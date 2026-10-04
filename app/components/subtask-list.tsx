'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { displayName, type Task, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import Popover from '@/app/components/popover'
import DueDateField from '@/app/components/due-date-field'
import { must, type Enqueue, type RegisterFlush } from '@/app/lib/write'
import { confirmCompleteSubtasks } from '@/app/lib/complete-subtasks'
import { confirmDeleteTask } from '@/app/lib/confirm-delete'

// Firma estable de los datos del servidor: solo resincronizamos cuando algo
// cambió de verdad, no en cada re-render del modal (evita pisar lo optimista).
const signature = (rows: Task[]) =>
  rows.map((s) => `${s.id}:${s.status}:${s.title}:${s.due_date}:${s.assignee_id}:${s.position}`).join('|')

const SUB_COLS = 'id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, position'
const isTemp = (id: string) => id.startsWith('tmp-')

/**
 * Subtareas dentro del modal. Toda escritura pasa por la cola del modal
 * (`enqueue`): se serializan, el cierre las espera y, si una falla, se avisa y
 * la fila vuelve a su último valor guardado.
 */
export default function SubtaskList({
  parentId,
  projectId,
  subtasks,
  members,
  childCounts,
  hrefFor,
  onOpen,
  onStats,
  enqueue,
  registerFlush,
  allDone = { seq: 0, on: false },
}: {
  parentId: string
  projectId: string
  subtasks: Task[]
  members: Member[]
  childCounts: Record<string, number>
  hrefFor: (id: string) => string
  onOpen: (href: string) => void
  onStats?: (done: number, total: number) => void
  enqueue: Enqueue
  registerFlush: RegisterFlush
  /** Al completar la tarea padre: `on` marca todas como hechas; `on:false` deshace. */
  allDone?: { seq: number; on: boolean }
}) {
  const supabase = useMemo(() => createClient(), [])

  // Se resincroniza durante el render (no en un efecto) y solo cuando los datos
  // del servidor cambiaron de verdad: así lo optimista nunca se pisa solo.
  const sig = signature(subtasks)
  const [state, setState] = useState<{ sig: string; items: Task[]; doneSeq: number; snap: Task[] | null }>({
    sig,
    items: subtasks,
    doneSeq: allDone.seq,
    snap: null,
  })
  if (state.sig !== sig) setState((s) => ({ ...s, sig, items: subtasks, snap: null }))
  // La tarea padre se completó: todas a "hecho" (y vuelta atrás si falló)
  if (state.doneSeq !== allDone.seq) {
    setState((s) =>
      allDone.on
        ? { ...s, doneSeq: allDone.seq, snap: s.items, items: s.items.map((t) => ({ ...t, status: 'done' })) }
        : {
            ...s,
            doneSeq: allDone.seq,
            // Solo se devuelve el estado previo, y solo a las filas que siguen
            // en "hecho": lo que se editó mientras tanto no se pisa.
            items: s.items.map((t) => {
              const prev = s.snap?.find((x) => x.id === t.id)
              return prev && t.status === 'done' ? { ...t, status: prev.status } : t
            }),
            snap: null,
          }
    )
  }
  const items = state.items
  const setItems = (fn: (prev: Task[]) => Task[]) => setState((s) => ({ ...s, items: fn(s.items) }))
  const patchRow = (id: string, p: Partial<Task>) => setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)))

  // Último valor CONFIRMADO por la base, por fila. Si una escritura falla se
  // vuelve a esto, y solo si la fila sigue mostrando el valor que falló (si el
  // usuario ya lo cambió de nuevo, no se le pisa).
  const saved = useRef<Record<string, Task>>({})
  const savedOf = (id: string): Task | undefined => saved.current[id] ?? subtasks.find((s) => s.id === id)
  const markSaved = (id: string, p: Partial<Task>) => {
    const base = savedOf(id)
    if (base) saved.current[id] = { ...base, ...p }
  }
  const tmpSeq = useRef(0)

  // Progreso hacia el modal (la barra vive en el encabezado de la sección)
  const done = items.filter((t) => t.status === 'done').length
  const total = items.length
  useEffect(() => {
    onStats?.(done, total)
  }, [done, total, onStats])

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const assignAnchor = useRef<HTMLElement | null>(null)
  const menuAnchor = useRef<HTMLElement | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})

  // ---- Títulos con debounce: se guardan al dejar de escribir, al salir del
  // campo, y TAMBIÉN cuando el modal cierra o navega (flush) ----
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pending = useRef<Record<string, string>>({})

  const saveTitle = (id: string) => {
    const value = pending.current[id]
    delete pending.current[id]
    if (timers.current[id]) clearTimeout(timers.current[id])
    delete timers.current[id]
    const t = (value ?? '').trim()
    const prev = savedOf(id)
    if (!t || !prev || t === prev.title || isTemp(id)) return
    enqueue(
      async () => {
        await must(supabase.from('tasks').update({ title: t }).eq('id', id).select('id'))
        markSaved(id, { title: t })
      },
      { what: 'el título de la subtarea', hint: 'Tu texto sigue en la fila.' }
    )
  }

  const flushRef = useRef<() => void>(() => {})
  useEffect(() => {
    flushRef.current = () => {
      for (const id of Object.keys(pending.current)) saveTitle(id)
    }
  })
  useEffect(() => {
    const off = registerFlush(() => flushRef.current())
    return () => {
      off()
      flushRef.current()
    }
  }, [registerFlush])

  const onTitleChange = (id: string, title: string) => {
    patchRow(id, { title })
    pending.current[id] = title
    if (timers.current[id]) clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => saveTitle(id), 600)
  }

  // Un título vacío no se guarda: al salir del campo vuelve el último guardado
  const onTitleBlur = (id: string, value: string) => {
    if (!value.trim()) {
      delete pending.current[id]
      if (timers.current[id]) clearTimeout(timers.current[id])
      const prev = savedOf(id)
      if (prev) patchRow(id, { title: prev.title })
      return
    }
    saveTitle(id)
  }

  // ---- Campos de una fila: optimista + cola + vuelta atrás si falla ----
  const setField = <K extends 'status' | 'due_date' | 'assignee_id'>(
    id: string,
    key: K,
    value: Task[K],
    what: string,
    write: () => Promise<unknown>
  ) => {
    patchRow(id, { [key]: value } as Partial<Task>)
    enqueue(
      async () => {
        await write()
        markSaved(id, { [key]: value } as Partial<Task>)
      },
      {
        what,
        undo: () =>
          setItems((prev) =>
            prev.map((t) =>
              t.id === id && t[key] === value ? { ...t, [key]: savedOf(id)?.[key] ?? null } : t
            )
          ),
      }
    )
  }

  const toggle = async (s: Task) => {
    const next = s.status === 'done' ? 'todo' : 'done'
    if (next === 'done') {
      // Si esta subtarea tiene subtareas propias abiertas, mismo aviso que en la tarea
      if (!(await confirmCompleteSubtasks(s.id, childCounts[s.id] ? undefined : 0))) return
      setField(s.id, 'status', next, 'el estado de la subtarea', () =>
        must(supabase.rpc('complete_task_tree', { p_task_id: s.id }))
      )
      return
    }
    setField(s.id, 'status', next, 'el estado de la subtarea', async () => {
      await must(supabase.from('tasks').update({ status: next }).eq('id', s.id).select('id'))
      // La base también lo registra por trigger (migración 017); el duplicado se descarta solo.
      await supabase.from('task_activity').insert({ task_id: s.id, type: 'status', meta: { to: next } })
    })
  }

  const setAssignee = (id: string, userId: string | null) => {
    setAssignOpen(null)
    setField(id, 'assignee_id', userId, 'el responsable de la subtarea', () =>
      must(supabase.rpc('set_task_assignee', { p_task_id: id, p_assignee: userId }))
    )
  }

  const setDue = (id: string, date: string | null) => {
    const due = date || null
    setField(id, 'due_date', due, 'la fecha de la subtarea', async () => {
      await must(supabase.from('tasks').update({ due_date: due }).eq('id', id).select('id'))
      await supabase.from('task_activity').insert({ task_id: id, type: 'due', meta: { to: due } })
    })
  }

  // ---- Orden: una sola llamada a la base, vuelta atrás si falla ----
  const reorder = (next: Task[]) => {
    const beforeIds = items.map((t) => t.id)
    setItems(() => next)
    const ids = next.filter((t) => !isTemp(t.id)).map((t) => t.id)
    enqueue(() => must(supabase.rpc('reorder_subtasks', { p_parent_id: parentId, p_ids: ids })), {
      what: 'el orden de las subtareas',
      // Vuelve el ORDEN anterior conservando el contenido actual de cada fila
      // (y al final las que se crearon mientras tanto)
      undo: () =>
        setItems((cur) => {
          const pos = (id: string) => {
            const i = beforeIds.indexOf(id)
            return i < 0 ? Number.MAX_SAFE_INTEGER : i
          }
          return [...cur].sort((x, y) => pos(x.id) - pos(y.id))
        }),
    })
  }

  const moveTo = (fromId: string, targetId: string) => {
    if (fromId === targetId) return
    const cur = [...items]
    const fromIdx = cur.findIndex((t) => t.id === fromId)
    const toIdx = cur.findIndex((t) => t.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = cur.splice(fromIdx, 1)
    cur.splice(toIdx, 0, moved)
    reorder(cur)
  }

  const onDrop = (targetId: string) => {
    setOverId(null)
    const from = dragId
    setDragId(null)
    if (from) moveTo(from, targetId)
  }

  // Alt + ↑ / ↓ sobre el título mueve la subtarea (reordenar sin mouse)
  const moveByKey = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((t) => t.id === id)
    const target = items[idx + dir]
    if (!target) return
    moveTo(id, target.id)
    requestAnimationFrame(() => inputs.current[id]?.focus())
  }

  // ---- Alta: la fila aparece al instante, atenuada hasta tener id real ----
  const addSubtask = () => {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const tmpId = `tmp-${++tmpSeq.current}`
    const maxPos = items.reduce((m, t) => Math.max(m, t.position ?? 0), 0)
    const draft = {
      id: tmpId,
      title,
      status: 'todo',
      priority: null,
      due_date: null,
      parent_id: parentId,
      description: null,
      assignee_id: null,
      drive_url: null,
      created_at: new Date().toISOString(),
      position: maxPos + 1,
    } as unknown as Task
    setItems((prev) => [...prev, draft])
    enqueue(
      async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const data = await must(
          supabase
            .from('tasks')
            .insert({
              title,
              project_id: projectId,
              parent_id: parentId,
              status: 'todo',
              position: maxPos + 1,
              created_by: user?.id,
            })
            .select(SUB_COLS)
            .single()
        )
        const row = data as unknown as Task
        saved.current[row.id] = row
        setItems((prev) => prev.map((t) => (t.id === tmpId ? row : t)))
        await supabase.from('task_activity').insert({ task_id: row.id, type: 'created', meta: {} })
      },
      {
        what: 'la subtarea nueva',
        hint: 'Volvé a escribirla para intentar de nuevo.',
        undo: () => {
          setItems((prev) => prev.filter((t) => t.id !== tmpId))
          setNewTitle((cur) => cur || title)
        },
      }
    )
  }

  // ---- Baja (clic derecho → Eliminar), con vuelta atrás si falla ----
  const remove = async (s: Task) => {
    setMenuFor(null)
    // Sin hijas directas no hay nietas: se evita la consulta. Con hijas, se
    // cuentan todas en la base.
    const ok = await confirmDeleteTask({
      taskId: s.id,
      title: s.title,
      knownSubs: childCounts[s.id] ? undefined : 0,
    })
    if (!ok) return
    const idx = items.findIndex((t) => t.id === s.id)
    setItems((prev) => prev.filter((t) => t.id !== s.id))
    enqueue(() => must(supabase.from('tasks').delete().eq('id', s.id).select('id')), {
      what: 'el borrado de la subtarea',
      hint: 'La subtarea sigue en la lista.',
      // Vuelve solo la fila borrada, en su lugar; el resto queda como está
      undo: () =>
        setItems((cur) => {
          if (cur.some((t) => t.id === s.id)) return cur
          const next = [...cur]
          next.splice(Math.min(Math.max(idx, 0), next.length), 0, s)
          return next
        }),
    })
  }

  // Abrir: espera a que se guarde lo pendiente (lo hace el modal). Clic con
  // Ctrl/Cmd o botón del medio siguen abriendo en otra pestaña.
  const openSub = (e: React.MouseEvent, id: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onOpen(hrefFor(id))
  }

  const menuTask = items.find((t) => t.id === menuFor) ?? null

  return (
    <div className="flex flex-col gap-1">
      {items.map((sub) => {
        const subDone = sub.status === 'done'
        const temp = isTemp(sub.id)
        const who = members.find((m) => m.user_id === sub.assignee_id)
        const hijas = childCounts[sub.id] ?? 0
        return (
          <div
            key={sub.id}
            className={`subrow ${overId === sub.id ? 'dragover' : ''} ${dragId === sub.id ? 'dragging' : ''} ${temp ? 'is-pendiente' : ''}`}
            aria-busy={temp || undefined}
            onDragOver={(e) => {
              e.preventDefault()
              if (overId !== sub.id) setOverId(sub.id)
            }}
            onDragLeave={() => setOverId((o) => (o === sub.id ? null : o))}
            onDrop={() => onDrop(sub.id)}
            onContextMenu={(e) => {
              if (temp) return
              e.preventDefault()
              menuAnchor.current = e.currentTarget
              setMenuFor(sub.id)
            }}
          >
            <span
              className="subrow-grip"
              title="Arrastrar para reordenar (o Alt + ↑ / ↓ desde el título)"
              aria-hidden="true"
              draggable={!temp}
              onDragStart={(e) => {
                setDragId(sub.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
              </svg>
            </span>

            <button
              type="button"
              className={`task-check ${subDone ? 'done' : ''}`}
              aria-pressed={subDone}
              aria-label={`${subDone ? 'Marcar como pendiente' : 'Marcar como completada'}: ${sub.title}`}
              title={subDone ? 'Marcar como pendiente' : 'Marcar como completada'}
              disabled={temp}
              onClick={() => toggle(sub)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </button>

            <input
              ref={(el) => {
                inputs.current[sub.id] = el
              }}
              className="subrow-title"
              aria-label="Título de la subtarea"
              value={sub.title}
              readOnly={temp}
              onChange={(e) => onTitleChange(sub.id, e.target.value)}
              onBlur={(e) => onTitleBlur(sub.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                  e.preventDefault()
                  moveByKey(sub.id, e.key === 'ArrowUp' ? -1 : 1)
                } else if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              style={{ textDecoration: subDone ? 'line-through' : 'none', color: subDone ? 'var(--text-3)' : 'var(--text-2)' }}
            />

            {hijas > 0 && !temp && (
              <Link
                href={hrefFor(sub.id)}
                onClick={(e) => openSub(e, sub.id)}
                className="subrow-hijas"
                title={`Tiene ${hijas} ${hijas === 1 ? 'subtarea' : 'subtareas'}`}
                aria-label={`Abrir: tiene ${hijas} ${hijas === 1 ? 'subtarea' : 'subtareas'}`}
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 4v9a3 3 0 0 0 3 3h9M14 12l4 4-4 4" />
                </svg>
                {hijas}
              </Link>
            )}

            {!temp && (
              <Link
                href={hrefFor(sub.id)}
                onClick={(e) => openSub(e, sub.id)}
                className="subrow-open"
                title="Abrir subtarea"
                aria-label={`Abrir subtarea: ${sub.title}`}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7M8 7h9v9" />
                </svg>
              </Link>
            )}

            <div className={`subrow-due ${sub.due_date ? 'has-date' : ''}`}>
              <DueDateField value={sub.due_date} onChange={(v) => setDue(sub.id, v)} done={subDone} />
            </div>

            <div className="subrow-assignee">
              <button
                type="button"
                className="subrow-assignee-btn"
                aria-haspopup="menu"
                aria-expanded={assignOpen === sub.id}
                aria-label={who ? `Responsable: ${displayName(who)}` : 'Asignar responsable'}
                disabled={temp}
                onClick={(e) => {
                  assignAnchor.current = e.currentTarget
                  setAssignOpen(assignOpen === sub.id ? null : sub.id)
                }}
                title={who ? `Responsable: ${displayName(who)}` : 'Sin responsable'}
              >
                {who ? (
                  <Avatar name={who.full_name} email={who.email} url={who.avatar_url} size={22} />
                ) : (
                  <span className="subrow-noassignee">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
                    </svg>
                  </span>
                )}
              </button>

              <Popover
                open={assignOpen === sub.id}
                onClose={() => setAssignOpen(null)}
                anchor={assignAnchor}
                align="right"
                minWidth={220}
              >
                <div className="dropdown-label">Responsable</div>
                {members.map((m) => (
                  <button key={m.user_id} type="button" className="dropdown-item" onClick={() => setAssignee(sub.id, m.user_id)}>
                    <span className="flex items-center gap-2">
                      <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
                      {displayName(m)}
                    </span>
                  </button>
                ))}
                {sub.assignee_id && (
                  <button type="button" className="dropdown-item" style={{ color: 'var(--text-3)' }} onClick={() => setAssignee(sub.id, null)}>
                    Quitar responsable
                  </button>
                )}
              </Popover>
            </div>
          </div>
        )
      })}

      {/* Menú contextual de la fila (clic derecho), igual que en la vista Lista */}
      <Popover open={!!menuTask} onClose={() => setMenuFor(null)} anchor={menuAnchor} minWidth={210}>
        {menuTask && (
          <>
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                setMenuFor(null)
                onOpen(hrefFor(menuTask.id))
              }}
            >
              Abrir subtarea
            </button>
            <div className="ctxmenu-sep" />
            <button type="button" className="dropdown-item danger" onClick={() => remove(menuTask)}>
              Eliminar subtarea
            </button>
          </>
        )}
      </Popover>

      <form
        className="add-row"
        style={{ border: '1px dashed var(--border-strong)' }}
        onSubmit={(e) => {
          e.preventDefault()
          addSubtask()
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Agregar subtarea…"
          aria-label="Agregar subtarea"
          autoComplete="off"
        />
      </form>
    </div>
  )
}
