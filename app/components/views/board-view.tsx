'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { STATUSES, PRIORITIES, formatDueShort, type Task, type Status, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import { useTaskContextMenu } from '@/app/components/task-context-menu'

const TASK_COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, created_at'

export default function BoardView({
  projectId,
  view,
  userId,
  tasks,
  subtaskCounts,
  memberMap,
  hideDone = false,
}: {
  projectId: string
  view: string
  userId: string
  tasks: Task[]
  subtaskCounts: Record<string, number>
  memberMap: Record<string, Member>
  hideDone?: boolean
}) {
  const supabase = createClient()
  const router = useRouter()
  const { onContextMenu, menu } = useTaskContextMenu()

  const [items, setItems] = useState<Task[]>(tasks)
  // Sincronizar con los datos frescos del servidor (ej. prioridad puesta en el panel)
  useEffect(() => {
    setItems(tasks)
  }, [tasks])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const hrefFor = (id: string) => `/projects/${projectId}?view=${view}${hideDone ? '&hide=done' : ''}&task=${id}`

  // ---- Mutaciones (optimistas + persistencia con el cliente del navegador) ----
  const move = async (id: string, status: Status) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    await supabase.from('tasks').update({ status }).eq('id', id)
    router.refresh()
  }

  const toggleDone = async (task: Task) => {
    const next: Status = task.status === 'done' ? 'todo' : 'done'
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
    router.refresh()
  }

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
    router.refresh()
  }

  const add = async (status: Status) => {
    const title = (drafts[status] ?? '').trim()
    if (!title) return
    setDrafts((d) => ({ ...d, [status]: '' }))
    const { data } = await supabase
      .from('tasks')
      .insert({ title, project_id: projectId, status, created_by: userId })
      .select(TASK_COLS)
      .single()
    if (data) setItems((prev) => [...prev, data as Task])
    router.refresh()
  }

  return (
    <div className="board">
      {STATUSES.map((col) => {
        if (hideDone && col.key === 'done') return null
        const colItems = items.filter((t) => t.status === col.key)
        return (
          <div
            key={col.key}
            className={`column ${overCol === col.key ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (overCol !== col.key) setOverCol(col.key)
            }}
            onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
            onDrop={() => {
              if (dragId) move(dragId, col.key)
              setDragId(null)
              setOverCol(null)
            }}
          >
            <div className="column-head">
              <span className="title">
                <span className="dot" style={{ background: col.color }} />
                {col.label}
              </span>
              <span className="count-badge">{colItems.length}</span>
            </div>

            <div className="column-body">
              {colItems.map((task) => {
                const prio = PRIORITIES.find((p) => p.key === task.priority)
                const subs = subtaskCounts[task.id] ?? 0
                const done = task.status === 'done'
                const due = task.due_date ? formatDueShort(task.due_date) : null
                return (
                  <div
                    key={task.id}
                    className={`task-mini ${done ? 'done' : ''} ${dragId === task.id ? 'dragging' : ''}`}
                    draggable
                    onContextMenu={(e) => onContextMenu(e, { id: task.id, projectId })}
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverCol(null)
                    }}
                  >
                    {prio && (
                      <div className="card-prio" style={{ background: `${prio.color}14`, color: prio.color }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 21V4a1 1 0 0 1 1-1h12l-3 4 3 4H5" />
                        </svg>
                        Prioridad {prio.label}
                      </div>
                    )}
                    <div className="task-mini-body">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className={`task-check ${done ? 'done' : ''}`}
                        title={done ? 'Reabrir tarea' : 'Marcar como finalizada'}
                        onClick={() => toggleDone(task)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </button>
                      <Link
                        href={hrefFor(task.id)}
                        className="t task-open flex-1"
                        style={{
                          textDecoration: done ? 'line-through' : 'none',
                          color: done ? 'var(--text-3)' : 'var(--text)',
                        }}
                      >
                        {task.title}
                      </Link>
                    </div>

                    <div className="row">
                      <div className="task-meta">
                        {task.assignee_id && memberMap[task.assignee_id] && (
                          <Avatar
                            name={memberMap[task.assignee_id].full_name}
                            email={memberMap[task.assignee_id].email}
                            url={memberMap[task.assignee_id].avatar_url}
                            size={22}
                          />
                        )}
                        {due && (
                          <span className={`task-due ${due.overdue && !done ? 'overdue' : ''}`} title="Fecha de entrega">
                            {due.label}
                          </span>
                        )}
                      </div>
                      <div className="task-meta-end">
                        {subs > 0 && (
                          <span className="subcount" title={`${subs} subtareas`}>
                            {subs}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
                            </svg>
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn-ghost task-del"
                          title="Eliminar tarea"
                          onClick={() => remove(task.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                )
              })}

              {/* Añadir tarea en la columna */}
              <form
                className="add-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  add(col.key)
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <input
                  value={drafts[col.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [col.key]: e.target.value }))}
                  placeholder="Añadir tarea…"
                  autoComplete="off"
                />
              </form>
            </div>
          </div>
        )
      })}
      {menu}
    </div>
  )
}
