'use client'

import { useState } from 'react'
import Link from 'next/link'
import { STATUSES, type Task, type Member } from '@/app/projects/statuses'
import { toggleComplete, deleteTask, createTask } from '@/app/projects/actions'
import AddTaskRow from '@/app/components/add-task-row'
import AssigneeSelect from '@/app/components/assignee-select'
import PrioritySelect from '@/app/components/priority-select'
import DueDateInput from '@/app/components/due-date-input'

function parseDue(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function ListView({
  projectId,
  view,
  tasks,
  memberMap,
  members,
  subtaskCounts = {},
  childrenByParent = {},
}: {
  projectId: string
  view: string
  tasks: Task[]
  memberMap: Record<string, string>
  members: Member[]
  subtaskCounts?: Record<string, number>
  childrenByParent?: Record<string, Task[]>
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleSet = (setter: typeof setCollapsed, key: string) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const hrefFor = (id: string) => `/projects/${projectId}?view=${view}&task=${id}`

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="ltable">
      {/* Encabezado de columnas (sticky) */}
      <div className="lt-head">
        <span aria-hidden />
        <span>Nombre</span>
        <span>Responsable</span>
        <span>Prioridad</span>
        <span>Fecha de entrega</span>
        <span aria-hidden />
      </div>

      {STATUSES.map((section) => {
        const items = tasks.filter((t) => t.status === section.key)
        const isCollapsed = collapsed.has(section.key)

        return (
          <div className="lgroup" key={section.key}>
            <button
              type="button"
              className={`lgroup-head ${isCollapsed ? 'collapsed' : ''}`}
              onClick={() => toggleSet(setCollapsed, section.key)}
              aria-expanded={!isCollapsed}
            >
              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
              <span className="dot" style={{ background: section.color }} />
              <span className="gname">{section.label}</span>
              <span className="gcount">{items.length}</span>
            </button>

            {!isCollapsed && (
              <div className="lrows">
                {items.map((task) => {
                  const done = task.status === 'done'
                  const subs = subtaskCounts[task.id] ?? 0
                  const isOpen = expanded.has(task.id)
                  const children = childrenByParent[task.id] ?? []
                  const overdue = !!task.due_date && !done && parseDue(task.due_date) < today

                  return (
                    <div key={task.id}>
                      <div className={`lrow ${done ? 'done' : ''}`}>
                        {/* 1. Check */}
                        <form action={toggleComplete}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="project_id" value={projectId} />
                          <input type="hidden" name="status" value={task.status} />
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

                        {/* 2. Nombre (chevron expandir + título + conteo) */}
                        <div className="lname">
                          <button
                            type="button"
                            className={`lexp ${isOpen ? 'open' : ''}`}
                            onClick={() => toggleSet(setExpanded, task.id)}
                            aria-expanded={isOpen}
                            title={isOpen ? 'Ocultar subtareas' : 'Ver subtareas'}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          <Link href={hrefFor(task.id)} className="title">
                            {task.title}
                          </Link>
                          {subs > 0 && (
                            <span className="lsub" title={`${subs} subtarea(s)`}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 6h11M9 12h11M9 18h11M4 6v.01M4 12v.01M4 18v.01" />
                              </svg>
                              {subs}
                            </span>
                          )}
                        </div>

                        {/* 3. Responsable (editable inline) */}
                        <AssigneeSelect
                          taskId={task.id}
                          projectId={projectId}
                          current={task.assignee_id}
                          members={members}
                        />

                        {/* 4. Prioridad (editable inline) */}
                        <PrioritySelect
                          taskId={task.id}
                          projectId={projectId}
                          current={task.priority}
                        />

                        {/* 5. Fecha de entrega (editable inline) */}
                        <div className={overdue ? 'overdue-cell' : ''} title={overdue ? 'Vencida' : undefined}>
                          <DueDateInput taskId={task.id} projectId={projectId} value={task.due_date} />
                        </div>

                        {/* 6. Eliminar (aparece al pasar el cursor) */}
                        <form action={deleteTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="project_id" value={projectId} />
                          <button type="submit" className="btn-ghost ldel" title="Eliminar tarea">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            </svg>
                          </button>
                        </form>
                      </div>

                      {/* Subtareas expandidas */}
                      {isOpen && (
                        <div className="lsubs">
                          {children.map((sub, i) => {
                            const subDone = sub.status === 'done'
                            return (
                              <div key={sub.id} className={`lsubrow ${subDone ? 'done' : ''}`}>
                                <span className="num">{i + 1}</span>
                                <form action={toggleComplete}>
                                  <input type="hidden" name="id" value={sub.id} />
                                  <input type="hidden" name="project_id" value={projectId} />
                                  <input type="hidden" name="status" value={sub.status} />
                                  <button
                                    type="submit"
                                    className={`task-check ${subDone ? 'done' : ''}`}
                                    style={{ width: 18, height: 18, flex: '0 0 18px' }}
                                    title={subDone ? 'Marcar como pendiente' : 'Marcar como completada'}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                  </button>
                                </form>
                                <Link href={hrefFor(sub.id)} className="title">
                                  {sub.title}
                                </Link>
                              </div>
                            )
                          })}

                          <form action={createTask} className="add-row lsub-add">
                            <input type="hidden" name="project_id" value={projectId} />
                            <input type="hidden" name="parent_id" value={task.id} />
                            <input type="hidden" name="status" value="todo" />
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            <input name="title" placeholder="Agregar subtarea…" autoComplete="off" />
                          </form>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="ladd">
                  <AddTaskRow projectId={projectId} status={section.key} />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
