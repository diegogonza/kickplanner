'use client'

import { useRef, useState } from 'react'
import { addComment } from '@/app/projects/actions'
import { displayName, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'

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

// Convierte texto plano en HTML, envolviendo @Nombre en chips de mención
function mentionize(text: string, named: Named[], used: Set<string>): string {
  if (named.length === 0) return esc(text)
  const re = new RegExp('@(' + named.map((n) => escapeRegExp(n.dn)).join('|') + ')', 'g')
  let out = ''
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out += esc(text.slice(last, match.index))
    const dn = match[1]
    const m = named.find((n) => n.dn === dn)!.m
    used.add(m.user_id)
    out += `<span class="mention-chip" data-uid="${esc(m.user_id)}">@${esc(dn)}</span>`
    last = match.index + match[0].length
  }
  if (last < text.length) out += esc(text.slice(last))
  return out
}

// Serializa el contenido editable a HTML seguro (solo negrita, cursiva, enlaces, saltos)
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
  meName,
  meEmail,
  meAvatar,
}: {
  taskId: string
  projectId: string
  members: Member[]
  meName: string | null
  meEmail: string
  meAvatar: string | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [empty, setEmpty] = useState(true)
  const [sending, setSending] = useState(false)

  const named: Named[] = members
    .map((m) => ({ m, dn: displayName(m) }))
    .filter((n) => n.dn)
    .sort((a, b) => b.dn.length - a.dn.length)

  const cmd = (command: string, value?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, value)
    setEmpty(!ref.current?.textContent?.trim())
  }

  const addLink = () => {
    const url = window.prompt('Pegá el enlace (https://…)')
    const href = safeUrl(url)
    if (!href) return
    ref.current?.focus()
    const sel = window.getSelection()
    if (sel && sel.toString()) {
      document.execCommand('createLink', false, href)
    } else {
      document.execCommand('insertHTML', false, `<a href="${esc(href)}">${esc(href)}</a>&nbsp;`)
    }
    setEmpty(!ref.current?.textContent?.trim())
  }

  const submit = async () => {
    const el = ref.current
    if (!el || sending) return
    const used = new Set<string>()
    const body = serialize(el, named, used).trim()
    if (!body || !el.textContent?.trim()) return
    setSending(true)
    const fd = new FormData()
    fd.set('task_id', taskId)
    fd.set('project_id', projectId)
    fd.set('body', body)
    fd.set('mentions', Array.from(used).join(','))
    await addComment(fd)
    el.innerHTML = ''
    setEmpty(true)
    setSending(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="comment-editor">
      <Avatar name={meName} email={meEmail} url={meAvatar} size={28} />
      <div className="ce-box">
        <div className="ce-toolbar">
          <button type="button" className="ce-tool" title="Negrita" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')}>
            <b>B</b>
          </button>
          <button type="button" className="ce-tool" title="Cursiva" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')}>
            <i>I</i>
          </button>
          <button type="button" className="ce-tool" title="Enlace" onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
          </button>
        </div>
        <div
          ref={ref}
          className={`ce-input ${empty ? 'is-empty' : ''}`}
          contentEditable
          role="textbox"
          aria-label="Agregar un comentario"
          data-placeholder="Agregar un comentario…  (@ para mencionar, Ctrl+Enter para enviar)"
          suppressContentEditableWarning
          onInput={() => setEmpty(!ref.current?.textContent?.trim())}
          onKeyDown={onKeyDown}
        />
      </div>
      <button type="button" className="comment-send" title="Enviar (Ctrl+Enter)" disabled={empty || sending} onClick={submit}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </div>
  )
}
