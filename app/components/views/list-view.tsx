import Link from 'next/link'
import { STATUSES, type Task } from '@/app/projects/statuses'
import { toggleComplete, deleteTask } from '@/app/projects/actions'
import AddTaskRow from '@/app/components/add-task-row'

export default function ListView({
  projectId,
  view,
  tasks,
}: {
  projectId: string
  view: string
  tasks: Task[]
}) {
  const hrefFor = (id: string) => `/projects/${projectId}?view=${view}&task=${id}`

  return (
    <div className="mx-auto max-w-2xl">
      {STATUSES.map((section) => {
        const items = tasks.filter((t) => t.status === section.key)
        return (
          <div key={section.key}>
            <div className="section-head">
              <span className="dot" style={{ background: section.color }} />
              {section.label}
              <span className="count">{items.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {items.map((task) => {
                const done = task.status === 'done'
                return (
                  <div key={task.id} className="card flex items-center gap-3">
                    <form action={toggleComplete}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="project_id" value={projectId} />
                      <input type="hidden" name="status" value={task.status} />
                      <button
                        type="submit"
                        className={`task-check ${done ? 'done' : ''}`}
                        title={done ? 'Marcar como pendiente' : 'Marcar como completada'}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </button>
                    </form>

                    <Link
                      href={hrefFor(task.id)}
                      className="card-title task-open flex-1"
                      style={{
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? 'var(--text-3)' : 'var(--text)',
                      }}
                    >
                      {task.title}
                    </Link>

                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="project_id" value={projectId} />
                      <button type="submit" className="btn-ghost" title="Eliminar tarea">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        </svg>
                      </button>
                    </form>
                  </div>
                )
              })}

              <AddTaskRow projectId={projectId} status={section.key} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
