'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type Task } from '@/app/projects/statuses'
import { toggleComplete, deleteTask } from '@/app/projects/actions'
import PrioritySelect from '@/app/components/priority-select'
import DueDateInput from '@/app/components/due-date-input'

export type MyTask = Task & { project_id: string; project_name: string }

type BucketKey = 'vencidas' | 'semana' | 'proximas' | 'sinfecha' | 'completadas'
const BUCKETS: { key: BucketKey; label: string; color: string }[] = [
  { key: 'vencidas', label: 'Vencidas', color: 'var(--urgent-fg)' },
  { key: 'semana', label: 'Esta semana', color: 'var(--mod-fg)' },
  { key: 'proximas', label: 'Próximas', color: 'var(--info-fg)' },
  { key: 'sinfecha', label: 'Sin fecha', color: 'var(--text-3)' },
  { key: 'completadas', label: 'Completadas', color: 'var(--low-fg)' },
]

function parseDue(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const GRID = '26px minmax(0, 1fr) 150px 116px 122px 32px'

export default function MyTasksList({ tasks }: { tasks: MyTask[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = (today.getDay() + 6) % 7
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (6 - dow))

  const groups: Record<BucketKey, MyTask[]> = {
    vencidas: [], semana: [], proximas: [], sinfecha: [], completadas: [],
  }
  for (const t of tasks) {
    if (t.status === 'done') { groups.completadas.push(t); continue }
    if (!t.due_date) { groups.sinfecha.push(t); continue }
    const due = parseDue(t.due_date)
    if (due < today) groups.vencidas.push(t)
    else if (due <= endOfWeek) groups.semana.push(t)
    else groups.proximas.push(t)
  }

  if (tasks.length === 0) {
    return (
      <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
        <p className="card-title mb-1">No tenés tareas asignadas</p>
        <p className="card-desc">Cuando alguien te asigne una tarea, aparecerá aquí.</p>
      </div>
    )
  }

  return (
    <div className="ltable" style={{ ['--lt-grid' as string]: GRID }}>
      <div className="lt-head">
        <span aria-hidden />
        <span>Nombre</span>
        <span>Proyecto</span>
        <span>Prioridad</span>
        <span>Fecha de entrega</span>
        <span aria-hidden />
      </div>

      {BUCKETS.map(({ key, label, color }) => {
        const items = groups[key]
        if (items.length === 0) return null
        const isCollapsed = collapsed.has(key)
        return (
          <div className="lgroup" key={key}>
            <button
              type="button"
              className={`lgroup-head ${isCollapsed ? 'collapsed' : ''}`}
              onClick={() => toggle(key)}
              aria-expanded={!isCollapsed}
            >
              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
              <span className="dot" style={{ background: color }} />
              <span className="gname">{label}</span>
              <span className="gcount">{items.length}</span>
            </button>

            {!isCollapsed && (
              <div className="lrows">
                {items.map((t) => {
                  const done = t.status === 'done'
                  const overdue = !!t.due_date && !done && parseDue(t.due_date) < today
                  return (
                    <div key={t.id} className={`lrow ${done ? 'done' : ''}`}>
                      <form action={toggleComplete}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="project_id" value={t.project_id} />
                        <input type="hidden" name="status" value={t.status} />
                        <button
                          type="submit"
                          className={`task-check ${done ? 'done' : ''}`}
                          style={{ width: 20, height: 20, flex: '0 0 20px' }}
                          title={done ? 'Marcar como pendiente' : 'Marcar como completada'}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </button>
                      </form>

                      <div className="lname">
                        <Link href={`/projects/${t.project_id}?task=${t.id}`} className="title">
                          {t.title}
                        </Link>
                      </div>

                      <Link
                        href={`/projects/${t.project_id}`}
                        className="lassignee"
                        style={{ textDecoration: 'none' }}
                        title={t.project_name}
                      >
                        <span className="name">{t.project_name}</span>
                      </Link>

                      <PrioritySelect taskId={t.id} projectId={t.project_id} current={t.priority} />

                      <div className={overdue ? 'overdue-cell' : ''} title={overdue ? 'Vencida' : undefined}>
                        <DueDateInput taskId={t.id} projectId={t.project_id} value={t.due_date} />
                      </div>

                      <form action={deleteTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="project_id" value={t.project_id} />
                        <button type="submit" className="btn-ghost ldel" title="Eliminar tarea">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          </svg>
                        </button>
                      </form>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
