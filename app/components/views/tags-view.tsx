'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { PRIORITIES, formatDueShort, type Task, type Tag, type Member } from '@/app/projects/statuses'
import { toggleComplete, createTaskWithTag, moveTaskTag } from '@/app/projects/actions'
import AddTaskRow from '@/app/components/add-task-row'
import Avatar from '@/app/components/avatar'
import { useTaskContextMenu } from '@/app/components/task-context-menu'

const NONE = '__none__'

function TaskCard({
  task,
  projectId,
  view,
  colKey,
  memberMap,
  subtaskCounts,
  hideDone,
  dragging,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: {
  task: Task
  projectId: string
  view: string
  colKey: string
  memberMap: Record<string, Member>
  subtaskCounts: Record<string, number>
  hideDone?: boolean
  dragging: boolean
  onDragStart: (taskId: string, from: string) => void
  onDragEnd: () => void
  onContextMenu: (e: React.MouseEvent, task: { id: string; projectId: string }) => void
}) {
  const prio = PRIORITIES.find((p) => p.key === task.priority)
  const subs = subtaskCounts[task.id] ?? 0
  const done = task.status === 'done'
  const due = task.due_date ? formatDueShort(task.due_date) : null

  return (
    <div
      className={`task-mini ${done ? 'done' : ''} ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        onDragStart(task.id, colKey)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, { id: task.id, projectId })}
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
          <form action={toggleComplete}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="status" value={task.status} />
            <button
              type="submit"
              className={`task-check ${done ? 'done' : ''}`}
              title={done ? 'Reabrir tarea' : 'Marcar como finalizada'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </button>
          </form>
          <Link
            href={`/projects/${projectId}?view=${view}${hideDone ? '&hide=done' : ''}&task=${task.id}`}
            className="t task-open flex-1"
            style={{
              textDecoration: done ? 'line-through' : 'none',
              color: done ? 'var(--text-3)' : 'var(--text)',
            }}
          >
            {task.title}
          </Link>
        </div>

        {(subs > 0 || task.assignee_id || due) && (
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
            {subs > 0 && (
              <span className="subcount" title={`${subs} subtareas`}>
                {subs}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function TagsView({
  projectId,
  view,
  tasks,
  taskTags,
  usedTags,
  memberMap,
  subtaskCounts,
  hideDone,
}: {
  projectId: string
  view: string
  tasks: Task[]
  taskTags: Record<string, Tag[]>
  usedTags: Tag[]
  memberMap: Record<string, Member>
  subtaskCounts: Record<string, number>
  hideDone?: boolean
}) {
  const { onContextMenu, menu } = useTaskContextMenu()
  const [, startTransition] = useTransition()

  // Copia local de las etiquetas por tarea para actualizar al instante en el DnD
  const [localTags, setLocalTags] = useState<Record<string, Tag[]>>(taskTags)
  useEffect(() => setLocalTags(taskTags), [taskTags])

  const [drag, setDrag] = useState<{ id: string; from: string } | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const tagsOf = (taskId: string) => localTags[taskId] ?? []

  const columns = [
    ...usedTags.map((tag) => ({
      key: tag.id,
      label: tag.name,
      color: tag.color,
      items: tasks.filter((t) => tagsOf(t.id).some((x) => x.id === tag.id)),
    })),
    {
      key: NONE,
      label: 'Sin etiqueta',
      color: 'var(--text-3)',
      items: tasks.filter((t) => tagsOf(t.id).length === 0),
    },
  ]

  const handleDrop = (toKey: string) => {
    const d = drag
    setOverKey(null)
    setDrag(null)
    if (!d || d.from === toKey) return

    const targetTag = usedTags.find((t) => t.id === toKey)

    // Optimista: actualizar el mapa local de etiquetas
    setLocalTags((prev) => {
      const current = prev[d.id] ?? []
      let next = current
      if (d.from !== NONE) next = next.filter((t) => t.id !== d.from)
      if (targetTag && !next.some((t) => t.id === targetTag.id)) next = [...next, targetTag]
      return { ...prev, [d.id]: next }
    })

    // Persistir
    const fd = new FormData()
    fd.set('task_id', d.id)
    fd.set('project_id', projectId)
    fd.set('from_tag_id', d.from === NONE ? '' : d.from)
    fd.set('to_tag_id', toKey === NONE ? '' : toKey)
    startTransition(async () => {
      await moveTaskTag(fd)
    })
  }

  return (
    <div className="board">
      {columns.map((col) => (
        <div
          className={`column ${overKey === col.key ? 'drag-over' : ''}`}
          key={col.key}
          onDragOver={(e) => {
            e.preventDefault()
            if (overKey !== col.key) setOverKey(col.key)
          }}
          onDragLeave={() => setOverKey((k) => (k === col.key ? null : k))}
          onDrop={() => handleDrop(col.key)}
        >
          <div className="column-head">
            <span className="title">
              <span className="dot" style={{ background: col.color }} />
              {col.label}
            </span>
            <span className="count-badge">{col.items.length}</span>
          </div>
          <div className="column-body">
            {col.items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                projectId={projectId}
                view={view}
                colKey={col.key}
                memberMap={memberMap}
                subtaskCounts={subtaskCounts}
                hideDone={hideDone}
                dragging={drag?.id === task.id}
                onDragStart={(id, from) => setDrag({ id, from })}
                onDragEnd={() => {
                  setDrag(null)
                  setOverKey(null)
                }}
                onContextMenu={onContextMenu}
              />
            ))}

            {col.key === NONE ? (
              <AddTaskRow projectId={projectId} status="todo" />
            ) : (
              <form action={createTaskWithTag} className="add-row">
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="tag_id" value={col.key} />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <input name="title" placeholder="Añadir tarea…" autoComplete="off" />
              </form>
            )}
          </div>
        </div>
      ))}
      {menu}
    </div>
  )
}
