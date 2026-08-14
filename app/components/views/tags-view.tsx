import Link from 'next/link'
import { PRIORITIES, type Task, type Tag, type Member } from '@/app/projects/statuses'
import { toggleComplete, createTaskWithTag } from '@/app/projects/actions'
import AddTaskRow from '@/app/components/add-task-row'
import Avatar from '@/app/components/avatar'

function TaskCard({
  task,
  projectId,
  view,
  memberMap,
  subtaskCounts,
  hideDone,
}: {
  task: Task
  projectId: string
  view: string
  memberMap: Record<string, Member>
  subtaskCounts: Record<string, number>
  hideDone?: boolean
}) {
  const prio = PRIORITIES.find((p) => p.key === task.priority)
  const subs = subtaskCounts[task.id] ?? 0
  const done = task.status === 'done'

  return (
    <div className="task-mini">
      {prio && (
        <div className="card-prio" style={{ background: `${prio.color}14`, color: prio.color }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 21V4a1 1 0 0 1 1-1h12l-3 4 3 4H5" />
          </svg>
          Prioridad {prio.label}
        </div>
      )}
      <div className="task-mini-body">
        <div className="flex items-start gap-2">
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

        {(subs > 0 || task.assignee_id) && (
          <div className="row">
            <div className="flex items-center gap-2">
              {subs > 0 && (
                <span className="subcount" title={`${subs} subtareas`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
                  </svg>
                  {subs}
                </span>
              )}
            </div>
            {task.assignee_id && memberMap[task.assignee_id] && (
              <Avatar
                name={memberMap[task.assignee_id].full_name}
                email={memberMap[task.assignee_id].email}
                url={memberMap[task.assignee_id].avatar_url}
                size={22}
              />
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
  const untagged = tasks.filter((t) => (taskTags[t.id] ?? []).length === 0)

  const columns = [
    ...usedTags.map((tag) => ({
      key: tag.id,
      label: tag.name,
      color: tag.color,
      items: tasks.filter((t) => (taskTags[t.id] ?? []).some((x) => x.id === tag.id)),
    })),
    { key: '__none__', label: 'Sin etiqueta', color: 'var(--text-3)', items: untagged },
  ]

  return (
    <div className="board">
      {columns.map((col) => (
        <div className="column" key={col.key}>
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
                memberMap={memberMap}
                subtaskCounts={subtaskCounts}
                hideDone={hideDone}
              />
            ))}

            {col.key === '__none__' ? (
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
    </div>
  )
}
