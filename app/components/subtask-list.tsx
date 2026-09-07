'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { displayName, type Task, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import Popover from '@/app/components/popover'
import DueDateField from '@/app/components/due-date-field'

// Firma estable de los datos del servidor: solo resincronizamos cuando algo
// cambió de verdad, no en cada re-render del modal (evita pisar lo optimista).
const signature = (rows: Task[]) =>
  rows.map((s) => `${s.id}:${s.status}:${s.title}:${s.due_date}:${s.assignee_id}:${s.position}`).join('|')

export default function SubtaskList({
  parentId,
  projectId,
  view,
  subtasks,
  members,
  onStats,
  onDirty,
}: {
  parentId: string
  projectId: string
  view: string
  subtasks: Task[]
  members: Member[]
  onStats?: (done: number, total: number) => void
  onDirty?: () => void
}) {
  const supabase = createClient()

  // Se resincroniza durante el render (no en un efecto) y solo cuando los datos
  // del servidor cambiaron de verdad: así lo optimista nunca se pisa solo.
  const sig = signature(subtasks)
  const [state, setState] = useState<{ sig: string; items: Task[] }>({ sig, items: subtasks })
  if (state.sig !== sig) setState({ sig, items: subtasks })
  const items = state.items
  const setItems = (fn: (prev: Task[]) => Task[]) => setState((s) => ({ ...s, items: fn(s.items) }))

  // Progreso hacia el modal (la barra vive en el encabezado de la sección)
  const done = items.filter((t) => t.status === 'done').length
  const total = items.length
  useEffect(() => {
    onStats?.(done, total)
  }, [done, total, onStats])

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Un solo popover abierto a la vez: un ancla estable evita recalcular en cada render
  const assignAnchor = useRef<HTMLButtonElement | null>(null)

  const hrefFor = (id: string) => `/projects/${projectId}?view=${view}&task=${id}`
  const touch = () => onDirty?.()

  // ---- Mutaciones optimistas (el modal refresca una sola vez, al cerrar) ----
  const toggle = async (s: Task) => {
    const next = s.status === 'done' ? 'todo' : 'done'
    setItems((prev) => prev.map((t) => (t.id === s.id ? { ...t, status: next } : t)))
    touch()
    await supabase.from('tasks').update({ status: next }).eq('id', s.id)
    await supabase.from('task_activity').insert({ task_id: s.id, type: 'status', meta: { to: next } })
  }

  const saveTitle = async (id: string, title: string) => {
    const t = title.trim()
    if (!t) return
    touch()
    await supabase.from('tasks').update({ title: t }).eq('id', id)
  }
  const onTitleChange = (id: string, title: string) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
    if (timers.current[id]) clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => saveTitle(id, title), 600)
  }

  const setAssignee = async (id: string, userId: string | null) => {
    setAssignOpen(null)
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, assignee_id: userId } : t)))
    touch()
    await supabase.rpc('set_task_assignee', { p_task_id: id, p_assignee: userId })
  }

  const setDue = async (id: string, date: string | null) => {
    const due = date || null
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: due } : t)))
    touch()
    await supabase.from('tasks').update({ due_date: due }).eq('id', id)
    await supabase.from('task_activity').insert({ task_id: id, type: 'due', meta: { to: due } })
  }

  const persistOrder = async (ordered: Task[]) => {
    touch()
    await Promise.all(
      ordered.map((t, i) => supabase.from('tasks').update({ position: i + 1 }).eq('id', t.id))
    )
  }

  const onDrop = (targetId: string) => {
    setOverId(null)
    const from = dragId
    setDragId(null)
    if (!from || from === targetId) return
    const cur = [...items]
    const fromIdx = cur.findIndex((t) => t.id === from)
    const toIdx = cur.findIndex((t) => t.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = cur.splice(fromIdx, 1)
    cur.splice(toIdx, 0, moved)
    setItems(() => cur)
    persistOrder(cur)
  }

  const addSubtask = async () => {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    touch()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const maxPos = items.reduce((m, t) => Math.max(m, t.position ?? 0), 0)
    const { data } = await supabase
      .from('tasks')
      .insert({
        title,
        project_id: projectId,
        parent_id: parentId,
        status: 'todo',
        position: maxPos + 1,
        created_by: user?.id,
      })
      .select('id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, position')
      .single()
    if (!data) return
    // Aparece al instante: ya no hace falta recargar el proyecto entero
    setItems((prev) => [...prev, data as Task])
    await supabase.from('task_activity').insert({ task_id: data.id, type: 'created', meta: {} })
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((sub) => {
        const subDone = sub.status === 'done'
        const who = members.find((m) => m.user_id === sub.assignee_id)
        return (
          <div
            key={sub.id}
            className={`subrow ${overId === sub.id ? 'dragover' : ''} ${dragId === sub.id ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (overId !== sub.id) setOverId(sub.id)
            }}
            onDragLeave={() => setOverId((o) => (o === sub.id ? null : o))}
            onDrop={() => onDrop(sub.id)}
          >
            <span
              className="subrow-grip"
              title="Arrastrar para reordenar"
              draggable
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
              title={subDone ? 'Marcar como pendiente' : 'Marcar como completada'}
              onClick={() => toggle(sub)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </button>

            <input
              className="subrow-title"
              value={sub.title}
              onChange={(e) => onTitleChange(sub.id, e.target.value)}
              onBlur={(e) => {
                if (timers.current[sub.id]) clearTimeout(timers.current[sub.id])
                saveTitle(sub.id, e.target.value)
              }}
              style={{ textDecoration: subDone ? 'line-through' : 'none', color: subDone ? 'var(--text-3)' : 'var(--text-2)' }}
            />

            <Link href={hrefFor(sub.id)} className="subrow-open" title="Abrir subtarea">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M8 7h9v9" />
              </svg>
            </Link>

            <div className="subrow-due">
              <DueDateField value={sub.due_date} onChange={(v) => setDue(sub.id, v)} done={subDone} />
            </div>

            <div className="subrow-assignee">
              <button
                type="button"
                className="subrow-assignee-btn"
                aria-haspopup="menu"
                aria-expanded={assignOpen === sub.id}
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

      <form
        className="add-row"
        style={{ border: '1px dashed var(--border-strong)' }}
        onSubmit={(e) => {
          e.preventDefault()
          addSubtask()
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Agregar subtarea…" autoComplete="off" />
      </form>
    </div>
  )
}
