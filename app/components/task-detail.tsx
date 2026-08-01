import Link from 'next/link'
import type { Task, Tag } from '@/app/projects/statuses'
import { toggleComplete, removeTag, createTask } from '@/app/projects/actions'
import PrioritySelect from '@/app/components/priority-select'
import DueDateInput from '@/app/components/due-date-input'
import TagInput from '@/app/components/tag-input'
import DescriptionInput from '@/app/components/description-input'

type Ancestor = { id: string; title: string }

export default function TaskDetail({
  task,
  subtasks,
  tags,
  allTags,
  ancestors,
  projectId,
  projectName,
  view,
  closeHref,
}: {
  task: Task
  subtasks: Task[]
  tags: Tag[]
  allTags: Tag[]
  ancestors: Ancestor[]
  projectId: string
  projectName: string
  view: string
  closeHref: string
}) {
  const done = task.status === 'done'
  const subDone = subtasks.filter((s) => s.status === 'done').length
  const hrefFor = (id: string) => `/projects/${projectId}?view=${view}&task=${id}`

  return (
    <>
      {/* Encabezado */}
      <div className="panel-header">
        <form action={toggleComplete}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="status" value={task.status} />
          <button type="submit" className={`btn ${done ? 'btn-primary' : 'btn-outline'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {done ? 'Completada' : 'Marcar como finalizada'}
          </button>
        </form>

        <Link href={closeHref} className="btn-ghost" title="Cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Link>
      </div>

      <div className="panel-body">
        {/* Breadcrumb: ubicación de la tarea / subtarea */}
        <nav className="breadcrumb mb-2 flex flex-wrap items-center gap-1">
          <Link href={`/projects/${projectId}?view=${view}`} style={{ color: 'var(--text-3)' }}>
            {projectName}
          </Link>
          {ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <span style={{ color: 'var(--text-3)' }}>/</span>
              <Link href={hrefFor(a.id)} style={{ color: 'var(--text-3)' }}>
                {a.title}
              </Link>
            </span>
          ))}
          <span style={{ color: 'var(--text-3)' }}>/</span>
          <b style={{ color: 'var(--text-2)', fontWeight: 500 }}>{task.title}</b>
        </nav>

        <h2 className="panel-title">{task.title}</h2>

        {/* Prioridad */}
        <div className="detail-row">
          <div className="k">Prioridad</div>
          <PrioritySelect taskId={task.id} projectId={projectId} current={task.priority} />
        </div>

        {/* Fecha de entrega */}
        <div className="detail-row">
          <div className="k">Fecha de entrega</div>
          <DueDateInput taskId={task.id} projectId={projectId} value={task.due_date} />
        </div>

        {/* Etiquetas */}
        <div className="detail-row">
          <div className="k">Etiquetas</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((t) => (
                <span
                  key={t.id}
                  className="tag-pill"
                  style={{ background: `${t.color}1A`, color: t.color }}
                >
                  {t.name}
                  <form action={removeTag}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="tag_id" value={t.id} />
                    <input type="hidden" name="project_id" value={projectId} />
                    <button type="submit" title="Quitar etiqueta">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </form>
                </span>
              ))}
            </div>
            <div className="mt-2">
              <TagInput
                taskId={task.id}
                projectId={projectId}
                allTags={allTags}
                assignedIds={tags.map((t) => t.id)}
              />
            </div>
          </div>
        </div>

        {/* Descripción (autoguardado) */}
        <div className="section-label">Descripción</div>
        <DescriptionInput taskId={task.id} initial={task.description} />

        {/* Subtareas */}
        <div className="section-label">
          Subtareas {subtasks.length > 0 && `· ${subDone}/${subtasks.length}`}
        </div>
        <div className="flex flex-col gap-2">
          {subtasks.map((sub) => {
            const subIsDone = sub.status === 'done'
            return (
              <div key={sub.id} className="flex items-center gap-3">
                <form action={toggleComplete}>
                  <input type="hidden" name="id" value={sub.id} />
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="status" value={sub.status} />
                  <button
                    type="submit"
                    className={`task-check ${subIsDone ? 'done' : ''}`}
                    title={subIsDone ? 'Marcar como pendiente' : 'Marcar como completada'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </button>
                </form>
                <Link
                  href={hrefFor(sub.id)}
                  className="subtask-link"
                  style={{
                    textDecoration: subIsDone ? 'line-through' : 'none',
                    color: subIsDone ? 'var(--text-3)' : 'var(--text-2)',
                  }}
                >
                  {sub.title}
                </Link>
              </div>
            )
          })}

          <form action={createTask} className="add-row" style={{ border: '1px dashed var(--border-strong)' }}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="parent_id" value={task.id} />
            <input type="hidden" name="status" value="todo" />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <input name="title" placeholder="Agregar subtarea…" autoComplete="off" />
          </form>
        </div>
      </div>
    </>
  )
}
