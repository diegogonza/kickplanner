'use client'

import { useRef, useState } from 'react'
import { PRIORITIES, displayName, type Tag } from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'
import {
  addTemplateTask,
  updateTemplateTask,
  deleteTemplateTask,
  addTemplateTaskTag,
  removeTemplateTaskTag,
} from '@/app/plantillas/actions'

export type Person = { user_id: string; full_name: string | null; email: string; avatar_url: string | null }

export type TemplateTaskRow = {
  id: string
  parent_id: string | null
  title: string
  priority: string | null
  due_offset_days: number | null
  description: string | null
  drive_url: string | null
  assignee_id: string | null
  position: number
  created_at: string
}

const prioOf = (k: string | null) => PRIORITIES.find((p) => p.key === k)

/* ---------- Controles ---------- */

function TitleInput({ templateId, task, className }: { templateId: string; task: TemplateTaskRow; className?: string }) {
  return (
    <form action={updateTemplateTask} className="tpl-title-form">
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="id" value={task.id} />
      <input
        name="title"
        className={`tpl-title ${className ?? ''}`}
        defaultValue={task.title}
        autoComplete="off"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  )
}

function PriorityControl({ templateId, task }: { templateId: string; task: TemplateTaskRow }) {
  return (
    <form action={updateTemplateTask}>
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="id" value={task.id} />
      <select
        name="priority"
        className="tpl-select"
        defaultValue={task.priority ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Sin prioridad</option>
        {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
    </form>
  )
}

function OffsetControl({ templateId, task }: { templateId: string; task: TemplateTaskRow }) {
  return (
    <form action={updateTemplateTask} className="tpl-offset">
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="id" value={task.id} />
      <span className="tpl-offset-label">día +</span>
      <input
        name="due_offset_days"
        type="number"
        className="tpl-num"
        defaultValue={task.due_offset_days ?? ''}
        placeholder="—"
        min={0}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  )
}

function DeleteControl({ templateId, id, stop, label }: { templateId: string; id: string; stop?: boolean; label?: string }) {
  return (
    <form action={deleteTemplateTask} onClick={stop ? (e) => e.stopPropagation() : undefined}>
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={label ? 'btn-link tm2-del' : 'btn-ghost'} title="Eliminar tarea">
        {label ? (
          label
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        )}
      </button>
    </form>
  )
}

function Tags({ templateId, taskId, tags, allTags }: { templateId: string; taskId: string; tags: Tag[]; allTags: Tag[] }) {
  const available = allTags.filter((t) => !tags.some((x) => x.id === t.id))
  return (
    <div className="tpl-tags">
      {tags.map((tag) => (
        <span key={tag.id} className="chip" style={{ borderColor: tag.color, color: tag.color }}>
          {tag.name}
          <form action={removeTemplateTaskTag} style={{ display: 'inline' }}>
            <input type="hidden" name="template_id" value={templateId} />
            <input type="hidden" name="template_task_id" value={taskId} />
            <input type="hidden" name="tag_id" value={tag.id} />
            <button type="submit" className="chip-x" title="Quitar etiqueta">×</button>
          </form>
        </span>
      ))}
      {available.length > 0 ? (
        <form action={addTemplateTaskTag} key={tags.length}>
          <input type="hidden" name="template_id" value={templateId} />
          <input type="hidden" name="template_task_id" value={taskId} />
          <select name="tag_id" className="tpl-tagpick" defaultValue="" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            <option value="" disabled>+ etiqueta</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </form>
      ) : (
        allTags.length === 0 && <span className="tpl-tags-empty">Crea etiquetas desde una tarea de un proyecto</span>
      )}
    </div>
  )
}

function AssigneeControl({ templateId, task, people }: { templateId: string; task: TemplateTaskRow; people: Person[] }) {
  const [open, setOpen] = useState(false)
  const cur = people.find((p) => p.user_id === task.assignee_id)
  return (
    <div className="dropdown">
      <button type="button" className="tm2-assignee" onClick={() => setOpen((o) => !o)}>
        {cur ? (
          <>
            <Avatar name={cur.full_name} email={cur.email} url={cur.avatar_url} size={22} />
            <span>{displayName(cur)}</span>
          </>
        ) : (
          <span className="tm2-muted">Sin responsable</span>
        )}
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="dropdown-menu" style={{ minWidth: 220, maxHeight: 260, overflowY: 'auto' }}>
          <div className="dropdown-label">Personas</div>
          {people.length === 0 && <div className="dropdown-empty">No hay personas disponibles</div>}
          {people.map((p) => (
            <form key={p.user_id} action={updateTemplateTask} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="template_id" value={templateId} />
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="assignee_id" value={p.user_id} />
              <button type="submit" className="dropdown-item">
                <span className="flex items-center gap-2">
                  <Avatar name={p.full_name} email={p.email} url={p.avatar_url} size={22} />
                  {displayName(p)}
                </span>
              </button>
            </form>
          ))}
          {task.assignee_id && (
            <form action={updateTemplateTask} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="template_id" value={templateId} />
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="assignee_id" value="" />
              <button type="submit" className="dropdown-item" style={{ color: 'var(--text-3)' }}>Quitar responsable</button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function AddSubtaskRow({ templateId, parentId }: { templateId: string; parentId: string }) {
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form ref={ref} action={async (fd) => { await addTemplateTask(fd); ref.current?.reset() }} className="tpl-subadd">
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="parent_id" value={parentId} />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <input name="title" placeholder="Agregar subtarea…" autoComplete="off" />
    </form>
  )
}

function AddTaskCard({ templateId }: { templateId: string }) {
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form ref={ref} action={async (fd) => { await addTemplateTask(fd); ref.current?.reset() }} className="tpl-addcard">
      <input type="hidden" name="template_id" value={templateId} />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <input name="title" placeholder="Agregar tarea a la plantilla…" autoComplete="off" />
    </form>
  )
}

/* Íconos de las propiedades */
const ICONS = {
  label: <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01" />,
  people: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
}
function PropRow({ icon, label, children }: { icon: keyof typeof ICONS; label: string; children: React.ReactNode }) {
  return (
    <div className="tm2-row">
      <span className="tm2-ico">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
      </span>
      <span className="tm2-lbl">{label}</span>
      <div className="tm2-val">{children}</div>
    </div>
  )
}

/* ---------- Modal ---------- */

function TaskModal({
  templateId,
  templateName,
  task,
  subtasks,
  tags,
  allTags,
  people,
  onClose,
}: {
  templateId: string
  templateName: string
  task: TemplateTaskRow
  subtasks: TemplateTaskRow[]
  tags: Tag[]
  allTags: Tag[]
  people: Person[]
  onClose: () => void
}) {
  const [tab, setTab] = useState<'desc' | 'subs'>('desc')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="tm2" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="tm2-head">
          <div className="tm2-crumb">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z" />
            </svg>
            Plantilla / <b>{templateName}</b>
          </div>
          <button type="button" className="tm2-x" onClick={onClose} title="Cerrar">×</button>
        </div>

        <div className="tm2-body">
          <form action={updateTemplateTask}>
            <input type="hidden" name="template_id" value={templateId} />
            <input type="hidden" name="id" value={task.id} />
            <input
              name="title"
              className="tm2-title"
              defaultValue={task.title}
              placeholder="Título de la tarea"
              autoComplete="off"
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </form>

          <div className="tm2-props">
            <PropRow icon="label" label="Etiquetas">
              <Tags templateId={templateId} taskId={task.id} tags={tags} allTags={allTags} />
            </PropRow>
            <PropRow icon="people" label="Responsable">
              <AssigneeControl templateId={templateId} task={task} people={people} />
            </PropRow>
            <PropRow icon="flag" label="Prioridad">
              <PriorityControl templateId={templateId} task={task} />
            </PropRow>
            <PropRow icon="clock" label="Vence">
              <OffsetControl templateId={templateId} task={task} />
            </PropRow>
            <PropRow icon="link" label="Enlace">
              <div className="tm2-linkwrap">
                <form action={updateTemplateTask} className="tm2-linkform">
                  <input type="hidden" name="template_id" value={templateId} />
                  <input type="hidden" name="id" value={task.id} />
                  <input
                    name="drive_url"
                    type="url"
                    className="field"
                    defaultValue={task.drive_url ?? ''}
                    placeholder="https://…"
                    onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  />
                </form>
                {task.drive_url && (
                  <a href={task.drive_url} target="_blank" rel="noreferrer" className="tmodal-link">Abrir ↗</a>
                )}
              </div>
            </PropRow>
          </div>

          <div className="tm2-tabs">
            <button type="button" className={tab === 'desc' ? 'active' : ''} onClick={() => setTab('desc')}>Descripción</button>
            <button type="button" className={tab === 'subs' ? 'active' : ''} onClick={() => setTab('subs')}>
              Subtareas {subtasks.length > 0 && <span className="tm2-tabbadge">{subtasks.length}</span>}
            </button>
          </div>

          {tab === 'desc' ? (
            <form action={updateTemplateTask}>
              <input type="hidden" name="template_id" value={templateId} />
              <input type="hidden" name="id" value={task.id} />
              <textarea
                name="description"
                className="field"
                rows={5}
                defaultValue={task.description ?? ''}
                placeholder="Añade detalles, instrucciones, criterios…"
                onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                style={{ resize: 'vertical' }}
              />
            </form>
          ) : (
            <div className="tmodal-subs">
              {subtasks.map((sub) => (
                <div className="tmodal-subrow" key={sub.id}>
                  <TitleInput templateId={templateId} task={sub} />
                  <PriorityControl templateId={templateId} task={sub} />
                  <OffsetControl templateId={templateId} task={sub} />
                  <DeleteControl templateId={templateId} id={sub.id} />
                </div>
              ))}
              <AddSubtaskRow templateId={templateId} parentId={task.id} />
            </div>
          )}
        </div>

        <div className="tm2-foot">
          <DeleteControl templateId={templateId} id={task.id} label="Eliminar tarea" />
          <button type="button" className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Editor ---------- */

export default function TemplateEditor({
  templateId,
  templateName,
  tasks,
  tagsByTask,
  allTags,
  people,
}: {
  templateId: string
  templateName: string
  tasks: TemplateTaskRow[]
  tagsByTask: Record<string, Tag[]>
  allTags: Tag[]
  people: Person[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  const top = tasks.filter((t) => !t.parent_id)
  const childrenByParent: Record<string, TemplateTaskRow[]> = {}
  for (const t of tasks) {
    if (t.parent_id) (childrenByParent[t.parent_id] ??= []).push(t)
  }
  const openTask = openId ? tasks.find((t) => t.id === openId) ?? null : null

  return (
    <div>
      <p className="tpl-help">
        Cada tarjeta es una tarea de la plantilla. Haz clic en una para editar su título, descripción,
        enlace, responsable, prioridad, vencimiento relativo (día +N), etiquetas y subtareas.
      </p>

      <div className="tpl-cardgrid">
        {top.map((task) => {
          const children = childrenByParent[task.id] ?? []
          const subs = children.length
          const prio = prioOf(task.priority)
          const tags = tagsByTask[task.id] ?? []
          const who = people.find((p) => p.user_id === task.assignee_id)
          return (
            <div className="tpl-card" key={task.id} onClick={() => setOpenId(task.id)} role="button" tabIndex={0}>
              <div className="tpl-card-top">
                <span
                  className="tpl-card-prio"
                  style={{ background: prio ? prio.color : 'var(--border-strong)' }}
                  title={prio ? `Prioridad ${prio.label}` : 'Sin prioridad'}
                />
                <DeleteControl templateId={templateId} id={task.id} stop />
              </div>

              <div className="tpl-card-title">{task.title}</div>

              <div className="tpl-card-sub">
                {prio ? prio.label : 'Sin prioridad'}
                {task.due_offset_days != null && <> · día +{task.due_offset_days}</>}
              </div>

              {tags.length > 0 && (
                <div className="tpl-card-tags">
                  {tags.map((t) => (
                    <span key={t.id} className="chip chip-ro" style={{ borderColor: t.color, color: t.color }}>{t.name}</span>
                  ))}
                </div>
              )}

              <div className="tpl-card-foot">
                <span className="tpl-card-footleft">
                  {who && <Avatar name={who.full_name} email={who.email} url={who.avatar_url} size={20} />}
                  {subs > 0 ? `${subs} subtarea${subs === 1 ? '' : 's'}` : 'Sin subtareas'}
                </span>
                <span className="tpl-card-edit">Editar</span>
              </div>
            </div>
          )
        })}

        <AddTaskCard templateId={templateId} />
      </div>

      {openTask && (
        <TaskModal
          templateId={templateId}
          templateName={templateName}
          task={openTask}
          subtasks={childrenByParent[openTask.id] ?? []}
          tags={tagsByTask[openTask.id] ?? []}
          allTags={allTags}
          people={people}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
