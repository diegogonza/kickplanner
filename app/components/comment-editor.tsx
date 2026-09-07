'use client'

import { useEffect, useRef, useState } from 'react'
import { addComment, editComment } from '@/app/projects/actions'
import { displayName, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import Popover from '@/app/components/popover'

const MAX_LARGO = 5000

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeUrl(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  try {
    const u = new URL(v, 'https://x')
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return v
  } catch {
    return null
  }
  return null
}

type Named = { m: Member; dn: string }

// Respaldo para menciones escritas a mano (o venidas de comentarios viejos).
// Las que inserta el autocompletado NO pasan por acá: viajan como chip con
// data-uid, que es exacto aunque dos personas compartan nombre.
function mentionize(text: string, named: Named[], used: Set<string>): string {
  if (named.length === 0) return esc(text)
  const re = new RegExp('@(' + named.map((n) => escapeRegExp(n.dn)).join('|') + ')', 'g')
  let out = ''
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out += esc(text.slice(last, match.index))
    const dn = match[1]
    const hit = named.find((n) => n.dn === dn)
    if (!hit) {
      out += esc(match[0])
      last = match.index + match[0].length
      continue
    }
    used.add(hit.m.user_id)
    out += `<span class="mention-chip" data-uid="${esc(hit.m.user_id)}">@${esc(dn)}</span>`
    last = match.index + match[0].length
  }
  if (last < text.length) out += esc(text.slice(last))
  return out
}

// Serializa el contenido editable a HTML seguro (negrita, cursiva, enlaces,
// saltos y chips de mención). Todo lo demás se aplana a su texto.
function serialize(node: Node, named: Named[], used: Set<string>): string {
  let html = ''
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      html += mentionize(n.textContent ?? '', named, used)
      return
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return
    const el = n as HTMLElement
    const tag = el.tagName.toLowerCase()

    // Chip de mención: se respeta el uid guardado en vez de volver a adivinar
    // por nombre. Esto es lo que hace fiel la edición y desambigua homónimos.
    if (tag === 'span' && el.classList.contains('mention-chip')) {
      const uid = el.getAttribute('data-uid') ?? ''
      const miembro = named.find((x) => x.m.user_id === uid)
      if (miembro) {
        used.add(uid)
        html += `<span class="mention-chip" data-uid="${esc(uid)}">@${esc(miembro.dn)}</span>`
      } else {
        html += esc(el.textContent ?? '')
      }
      return
    }

    if (tag === 'br') { html += '<br>'; return }
    if (tag === 'strong' || tag === 'b') { html += `<strong>${serialize(el, named, used)}</strong>`; return }
    if (tag === 'em' || tag === 'i') { html += `<em>${serialize(el, named, used)}</em>`; return }
    if (tag === 'a') {
      const href = safeUrl(el.getAttribute('href'))
      const inner = serialize(el, named, used)
      html += href ? `<a href="${esc(href)}">${inner}</a>` : inner
      return
    }
    if (tag === 'div' || tag === 'p') {
      if (html && !html.endsWith('<br>')) html += '<br>'
      html += serialize(el, named, used)
      return
    }
    html += serialize(el, named, used)
  })
  return html
}

export default function CommentEditor({
  taskId,
  projectId,
  members,
  onDraftChange,
  onSend,
  onSendFailed,
  variante = 'nuevo',
  commentId,
  initialHtml,
  onDone,
}: {
  taskId: string
  projectId: string
  members: Member[]
  onDraftChange?: (hasDraft: boolean) => void
  /** Pinta el comentario sin esperar al servidor. */
  onSend?: (tempId: string, body: string, mentions: string[]) => void
  /** Lo retira si el guardado falló. */
  onSendFailed?: (tempId: string) => void
  /** 'edicion' reutiliza este editor para modificar un comentario publicado,
      así conserva menciones y formato en vez de degradar a texto plano. */
  variante?: 'nuevo' | 'edicion'
  commentId?: string
  initialHtml?: string
  onDone?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const enlaceRef = useRef<HTMLButtonElement>(null)
  const [empty, setEmpty] = useState(true)
  const [sending, setSending] = useState(false)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [largo, setLargo] = useState(0)
  const [mention, setMention] = useState<{ q: string; i: number } | null>(null)
  const [enlaceAbierto, setEnlaceAbierto] = useState(false)
  const [enlaceUrl, setEnlaceUrl] = useState('')
  const editando = variante === 'edicion'
  const listaId = `menciones-${commentId ?? taskId}`

  // Carga el contenido a editar y deja el cursor al final
  useEffect(() => {
    if (!editando || !ref.current) return
    ref.current.innerHTML = initialHtml ?? ''
    setEmpty(!ref.current.textContent?.trim())
    setLargo(ref.current.textContent?.length ?? 0)
    ref.current.focus()
    const r = document.createRange()
    r.selectNodeContents(ref.current)
    r.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando])

  useEffect(() => {
    onDraftChange?.(!empty)
  }, [empty, onDraftChange])

  const named: Named[] = members
    .map((m) => ({ m, dn: displayName(m) }))
    .filter((n) => n.dn)
    .sort((a, b) => b.dn.length - a.dn.length)

  const sincronizar = () => {
    const texto = ref.current?.textContent ?? ''
    setEmpty(!texto.trim())
    setLargo(texto.length)
    if (error) setError(null)
  }

  // `execCommand` está deprecado, pero no tiene reemplazo estándar y sigue
  // siendo lo único que maneja bien selecciones parciales en contentEditable.
  const cmd = (command: string, value?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, value)
    sincronizar()
  }

  // ---- Enlaces (antes usaba window.prompt, que bloquea la ventana) ---------
  const rangoGuardado = useRef<Range | null>(null)

  const abrirEnlace = () => {
    const sel = window.getSelection()
    rangoGuardado.current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    setEnlaceUrl('')
    setEnlaceAbierto(true)
  }

  const aplicarEnlace = () => {
    const href = safeUrl(enlaceUrl)
    if (!href) {
      setError('Pegá un enlace válido (https://…)')
      return
    }
    setEnlaceAbierto(false)
    ref.current?.focus()
    const sel = window.getSelection()
    if (rangoGuardado.current) {
      sel?.removeAllRanges()
      sel?.addRange(rangoGuardado.current)
    }
    if (sel && sel.toString()) {
      document.execCommand('createLink', false, href)
    } else {
      document.execCommand('insertHTML', false, `<a href="${esc(href)}">${esc(href)}</a>&nbsp;`)
    }
    sincronizar()
  }

  // ---- Autocompletado de menciones ----------------------------------------
  const RE_MENCION = /(?:^|\s)@([\p{L}0-9._-]*)$/u

  const textoAntesDelCursor = (): { nodo: Text; hasta: number; m: RegExpMatchArray } | null => {
    const sel = window.getSelection()
    if (!sel || !sel.isCollapsed || !ref.current) return null
    const nodo = sel.anchorNode
    if (!nodo || nodo.nodeType !== Node.TEXT_NODE || !ref.current.contains(nodo)) return null
    const hasta = sel.anchorOffset
    const m = (nodo.textContent ?? '').slice(0, hasta).match(RE_MENCION)
    return m ? { nodo: nodo as Text, hasta, m } : null
  }

  const detectarMencion = () => {
    const hit = textoAntesDelCursor()
    setMention(hit ? { q: hit.m[1], i: 0 } : null)
  }

  const sugeridos = mention
    ? members
        .filter((m) => displayName(m).toLowerCase().includes(mention.q.toLowerCase()))
        .slice(0, 6)
    : []

  // Inserta un CHIP (no texto): lleva data-uid, así la mención es exacta aunque
  // dos personas se llamen igual, y sobrevive intacta a una edición posterior.
  const elegirMencion = (m: Member) => {
    const hit = textoAntesDelCursor()
    if (!hit) return
    const inicio = hit.hasta - (hit.m[1].length + 1)
    const r = document.createRange()
    r.setStart(hit.nodo, inicio)
    r.setEnd(hit.nodo, hit.hasta)
    r.deleteContents()

    const chip = document.createElement('span')
    chip.className = 'mention-chip'
    chip.setAttribute('data-uid', m.user_id)
    chip.setAttribute('contenteditable', 'false')
    chip.textContent = '@' + displayName(m)
    const espacio = document.createTextNode(' ')
    r.insertNode(espacio)
    r.insertNode(chip)

    const despues = document.createRange()
    despues.setStartAfter(espacio)
    despues.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(despues)

    setMention(null)
    sincronizar()
  }

  // ---- Envío ---------------------------------------------------------------
  const submit = async () => {
    const el = ref.current
    if (!el || sending) return
    const used = new Set<string>()
    const body = serialize(el, named, used).trim()
    const texto = el.textContent?.trim() ?? ''
    if (!body || !texto) return
    if (texto.length > MAX_LARGO) {
      setError(`El comentario supera los ${MAX_LARGO} caracteres.`)
      return
    }

    setSending(true)
    setMention(null)
    setError(null)

    if (editando) {
      const fd = new FormData()
      fd.set('id', commentId ?? '')
      fd.set('project_id', projectId)
      fd.set('body', body)
      fd.set('mentions', Array.from(used).join(','))
      try {
        await editComment(fd)
        onDone?.()
      } catch {
        setError('No se pudo guardar el cambio. Probá de nuevo.')
      } finally {
        setSending(false)
      }
      return
    }

    const tempId = `pend-${Date.now()}`
    const respaldo = el.innerHTML
    const fd = new FormData()
    fd.set('task_id', taskId)
    fd.set('project_id', projectId)
    fd.set('body', body)
    fd.set('mentions', Array.from(used).join(','))

    // Se vacía y se pinta al instante; si falla, se devuelve todo como estaba
    el.innerHTML = ''
    setEmpty(true)
    setLargo(0)
    onSend?.(tempId, body, Array.from(used))

    try {
      await addComment(fd)
    } catch {
      onSendFailed?.(tempId)
      el.innerHTML = respaldo
      sincronizar()
      setError('No se pudo publicar el comentario. Tu texto sigue acá.')
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (mention && sugeridos.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMention({ ...mention, i: (mention.i + 1) % sugeridos.length })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMention({ ...mention, i: (mention.i - 1 + sugeridos.length) % sugeridos.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        elegirMencion(sugeridos[mention.i])
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
    if (editando && e.key === 'Escape') {
      e.preventDefault()
      onDone?.()
    }
  }

  // Pegar siempre como texto plano: evita traerse estilos y markup de Word o
  // de una web. El serializador limpiaría al enviar, pero mientras tanto el
  // compositor mostraba un formato que no se iba a guardar.
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const texto = e.clipboardData.getData('text/plain')
    if (!texto) return
    document.execCommand('insertText', false, texto)
    sincronizar()
  }

  // `enlaceAbierto` entra acá porque el input del popover se lleva el foco: sin
  // esto la barra se escondía justo mientras se usaba, y el ancla del popover
  // desaparecía con ella.
  const activo = focused || !empty || editando || enlaceAbierto
  const excedido = largo > MAX_LARGO

  return (
    <div className="comment-editor">
      <div ref={boxRef} className={`ce-box ${activo ? 'is-activo' : ''} ${error ? 'is-error' : ''}`}>
        {activo && (
          <div className="ce-toolbar">
            <button type="button" className="ce-tool" title="Negrita" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')}>
              <b>B</b>
            </button>
            <button type="button" className="ce-tool" title="Cursiva" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')}>
              <i>I</i>
            </button>
            <button ref={enlaceRef} type="button" className="ce-tool" title="Enlace" onMouseDown={(e) => e.preventDefault()} onClick={abrirEnlace}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              </svg>
            </button>
            <span className="ce-hint">
              {largo > MAX_LARGO - 500 ? (
                <span className={excedido ? 'ce-exceso' : ''}>{largo} / {MAX_LARGO}</span>
              ) : (
                '@ menciona · Ctrl+Enter envía'
              )}
            </span>
          </div>
        )}

        <div className="ce-row">
          <div
            ref={ref}
            className={`ce-input ${empty ? 'is-empty' : ''}`}
            contentEditable
            role="textbox"
            aria-label={editando ? 'Editar el comentario' : 'Agregar un comentario'}
            aria-multiline="true"
            aria-autocomplete="list"
            aria-controls={sugeridos.length > 0 ? listaId : undefined}
            data-placeholder={editando ? 'Editar el comentario…' : 'Agregar un comentario…'}
            suppressContentEditableWarning
            onInput={() => {
              sincronizar()
              detectarMencion()
            }}
            onKeyUp={detectarMencion}
            onClick={detectarMencion}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              setMention(null)
            }}
            onKeyDown={onKeyDown}
          />
          {editando ? (
            <div className="ce-acciones">
              <button type="button" className="btn btn-tertiary" disabled={empty || sending || excedido} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
                {sending ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="btn btn-quiet" onMouseDown={(e) => e.preventDefault()} onClick={() => onDone?.()}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="comment-send"
              title="Enviar (Ctrl+Enter)"
              aria-label="Enviar comentario"
              disabled={empty || sending || excedido}
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && <p className="ce-error" role="alert">{error}</p>}

      {/* Lista de menciones */}
      <Popover open={sugeridos.length > 0} onClose={() => setMention(null)} anchor={boxRef} minWidth={240} maxHeight={230}>
        <div className="dropdown-label" id={listaId}>Mencionar a</div>
        <div role="listbox" aria-label="Personas para mencionar">
          {sugeridos.map((m, idx) => (
            <button
              key={m.user_id}
              type="button"
              role="option"
              aria-selected={mention ? idx === mention.i : false}
              className={`dropdown-item ${mention && idx === mention.i ? 'is-activo' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => mention && setMention({ ...mention, i: idx })}
              onClick={() => elegirMencion(m)}
            >
              <span className="flex items-center gap-2">
                <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
                {displayName(m)}
              </span>
            </button>
          ))}
        </div>
      </Popover>

      {/* Enlace: reemplaza al window.prompt, que bloqueaba la ventana */}
      <Popover open={enlaceAbierto} onClose={() => setEnlaceAbierto(false)} anchor={enlaceRef} minWidth={280}>
        <div className="dropdown-label">Insertar enlace</div>
        <input
          className="pop-search"
          value={enlaceUrl}
          autoFocus
          placeholder="https://…"
          aria-label="Dirección del enlace"
          onChange={(e) => setEnlaceUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              aplicarEnlace()
            }
          }}
        />
        <div className="ce-acciones" style={{ padding: '2px 2px 4px' }}>
          <button type="button" className="btn btn-tertiary" onMouseDown={(e) => e.preventDefault()} onClick={aplicarEnlace}>
            Insertar
          </button>
          <button type="button" className="btn btn-quiet" onMouseDown={(e) => e.preventDefault()} onClick={() => setEnlaceAbierto(false)}>
            Cancelar
          </button>
        </div>
      </Popover>
    </div>
  )
}
