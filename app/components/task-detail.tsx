import Link from 'next/link'
import { displayName, STATUSES, PRIORITIES, type Task, type Tag, type Member } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import {
  toggleComplete,
  removeTag,
  deleteComment,
} from '@/app/projects/actions'
import PrioritySelect from '@/app/components/priority-select'
import DueDateInput from '@/app/components/due-date-input'
import TagInput from '@/app/components/tag-input'
import DescriptionInput from '@/app/components/description-input'
import AssigneeSelect from '@/app/components/assignee-select'
import DriveField from '@/app/components/drive-field'
import InlineTaskTitle from '@/app/components/inline-task-title'
import SubtaskList from '@/app/components/subtask-list'
import CommentEditor from '@/app/components/comment-editor'
import CommentBody from '@/app/components/comment-body'

type Ancestor = { id: string; title: string }
type Mention = { id: string; name: string | null; email: string; avatar: string | null }
type Comment = {
  id: string
  body: string
  author_email: string
  author_id: string
  author_name: string | null
  author_avatar: string | null
  created_at: string
  mentions: Mention[]
}

type Activity = {
  id: string
  actor_id: string
  actor_name: string | null
  actor_avatar: string | null
  actor_email: string | null
  type: string
  meta: { to?: string | null } | null
  created_at: string
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' })
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
  activity,
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
  activity: Activity[]
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

  const actText = (a: Activity): string => {
    const to = a.meta?.to ?? null
    switch (a.type) {
      case 'created':
        return 'creó la tarea'
      case 'status': {
        if (to === 'done') return 'marcó como completada'
        const s = STATUSES.find((x) => x.key === to)
        return s ? `movió a ${s.label}` : 'actualizó el estado'
      }
      case 'priority': {
        const p = PRIORITIES.find((x) => x.key === to)
        return p ? `cambió la prioridad a ${p.label}` : 'quitó la prioridad'
      }
      case 'due':
        return to ? `cambió la fecha de entrega a ${fmtDate(to)}` : 'quitó la fecha de entrega'
      case 'assignee': {
        if (!to) return 'quitó el responsable'
        const m = members.find((x) => x.user_id === to)
        return `asignó a ${m ? displayName(m) : 'alguien'}`
      }
      default:
        return 'actualizó la tarea'
    }
  }

  type FeedItem =
    | { kind: 'comment'; at: string; c: Comment }
    | { kind: 'activity'; at: string; a: Activity }
  const feed: FeedItem[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, at: c.created_at, c })),
    ...activity
      .filter((a) => a.type !== 'comment')
      .map((a) => ({ kind: 'activity' as const, at: a.created_at, a })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())

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

        <InlineTaskTitle key={task.id} taskId={task.id} initial={task.title} />

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
        <SubtaskList
          parentId={task.id}
          projectId={projectId}
          view={view}
          subtasks={subtasks}
          members={members}
        />

        {/* Actividad y comentarios (timeline) */}
        <div className="comments">
          <div className="comments-head">
            <span className="comments-title">Actividad</span>
            {comments.length > 0 && <span className="comments-count">{comments.length}</span>}
          </div>

          {feed.length === 0 ? (
            <p className="act-empty">Aún no hay actividad. Escribí el primer comentario abajo.</p>
          ) : (
            <div className="act-feed">
              {feed.map((item) => {
                if (item.kind === 'activity') {
                  const a = item.a
                  const own = a.actor_id === currentUserId
                  const who = own ? 'Vos' : displayName({ full_name: a.actor_name, email: a.actor_email ?? '' })
                  return (
                    <div key={`a-${a.id}`} className="act-line">
                      <Avatar name={a.actor_name} email={a.actor_email ?? ''} url={a.actor_avatar} size={22} />
                      <span className="act-line-text">
                        <b>{who}</b> {actText(a)}
                      </span>
                      <span className="act-line-time">{timeAgo(a.created_at)}</span>
                    </div>
                  )
                }
                const c = item.c
                const own = c.author_id === currentUserId
                return (
                  <div key={`c-${c.id}`} className={`act ${own ? 'own' : ''}`}>
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
                      <p className="act-body">
                        <CommentBody body={c.body} mentions={c.mentions} members={members} />
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Compositor fijo al pie del panel (con menciones @) */}
      <div className="panel-footer">
        <CommentEditor
          taskId={task.id}
          projectId={projectId}
          members={members}
          meName={me?.full_name ?? null}
          meEmail={myEmail}
          meAvatar={me?.avatar_url ?? null}
        />
      </div>
    </>
  )
}
