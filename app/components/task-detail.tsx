import Link from 'next/link'
import { displayName, type Task, type Tag, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import {
  toggleComplete,
  removeTag,
  createTask,
  addComment,
  deleteComment,
} from '@/app/projects/actions'
import PrioritySelect from '@/app/components/priority-select'
import DueDateInput from '@/app/components/due-date-input'
import TagInput from '@/app/components/tag-input'
import DescriptionInput from '@/app/components/description-input'
import AssigneeSelect from '@/app/components/assignee-select'
import DriveField from '@/app/components/drive-field'

type Ancestor = { id: string; title: string }
type Comment = {
  id: string
  body: string
  author_email: string
  author_id: string
  author_name: string | null
  author_avatar: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'hace un momento'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es')
}

export default function TaskDetail({
  task,
  subtasks,
  tags,
  allTags,
  ancestors,
  members,
  comments,
  currentUserId,
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
  members: Member[]
  comments: Comment[]
  currentUserId: string
  projectId: string
  projectName: string
  view: string
  closeHref: string
}) {
  const done = task.status === 'done'
  const subDone = subtasks.filter((s) => s.status === 'done').length
  const me = members.find((m) => m.user_id === currentUserId)
  const myEmail = me?.email ?? '?'
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

        {/* Responsable */}
        <div className="detail-row">
          <div className="k">Responsable</div>
          <AssigneeSelect
            taskId={task.id}
            projectId={projectId}
            current={task.assignee_id}
            members={members}
          />
        </div>

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

        {/* Archivo de Drive */}
        <div className="section-label">Archivo de Drive</div>
        <DriveField taskId={task.id} projectId={projectId} value={task.drive_url} />

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

        {/* Comentarios / actividad (timeline) */}
        <div className="comments">
          <div className="comments-head">
            <span className="comments-title">Comentarios</span>
            {comments.length > 0 && <span className="comments-count">{comments.length}</span>}
          </div>

          {comments.length === 0 ? (
            <p className="act-empty">Aún no hay comentarios. Escribí el primero abajo.</p>
          ) : (
            <div className="act-feed">
              {comments.map((c) => {
                const own = c.author_id === currentUserId
                return (
                  <div key={c.id} className={`act ${own ? 'own' : ''}`}>
                    <Avatar name={c.author_name} email={c.author_email} url={c.author_avatar} size={34} />
                    <div className="act-card">
                      <div className="act-top">
                        <span className="act-author">
                          {own ? 'Vos' : displayName({ full_name: c.author_name, email: c.author_email })}
                        </span>
                        <span className="act-time">{timeAgo(c.created_at)}</span>
                        {own && (
                          <form action={deleteComment} className="act-del">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="project_id" value={projectId} />
                            <button type="submit" className="btn-ghost" title="Eliminar comentario">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </form>
                        )}
                      </div>
                      <p className="act-body">{c.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Compositor fijo al pie del panel */}
      <div className="panel-footer">
        <form action={addComment} className="comment-composer">
          <Avatar name={me?.full_name} email={myEmail} url={me?.avatar_url} size={28} />
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="project_id" value={projectId} />
          <input name="body" placeholder="Agregar un comentario…" autoComplete="off" required />
          <button type="submit" className="comment-send" title="Enviar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </div>
    </>
  )
}
