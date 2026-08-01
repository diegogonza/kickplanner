'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { STATUSES, PRIORITIES, type Task, type Status } from '@/app/projects/statuses'

const TASK_COLS =
  'id, title, status, priority, due_date, parent_id, description, created_at'

export default function BoardView({
  projectId,
  view,
  userId,
  tasks,
  subtaskCounts,
}: {
  projectId: string
  view: string
  userId: string
  tasks: Task[]
  subtaskCounts: Record<string, number>
}) {
  const supabase = createClient()
  const router = useRouter()

  const [items, setItems] = useState<Task[]>(tasks)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<Status | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const hrefFor = (id: string) => `/projects/${projectId}?view=${view}&task=${id}`

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
                return (
                  <div
                    key={task.id}
                    className={`task-mini ${dragId === task.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverCol(null)
                    }}
                  >
                    <div className="flex items-start gap-2">
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

                    {prio && (
                      <div className="mt-2">
                        <span className={`pill ${prio.pill}`}>{prio.label}</span>
                      </div>
                    )}

                    <div className="row">
                      {subs > 0 ? (
                        <span className="subcount" title={`${subs} subtareas`}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
                          </svg>
                          {subs}
                        </span>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        className="btn-ghost"
                        title="Eliminar tarea"
                        onClick={() => remove(task.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        </svg>
                      </button>
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
    </div>
  )
}
