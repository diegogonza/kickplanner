'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  createProject,
  updateProject,
  setProjectStatus,
  toggleFavorite,
  deleteProject,
} from '@/app/projects/actions'
import {
  PROJECT_STATUSES as STATUSES,
  projectStatusOf as statusOf,
  PROJECT_TYPES,
  projectTypeOf,
} from '@/app/projects/statuses'

export type ProjectOverview = {
  id: string
  name: string
  client_id: string | null
  client: string | null
  description: string | null
  status: string
  type: string
  status_note: string | null
  overdue: number
  created_at: string
  last_activity: string
  favorite: boolean
  num_tasks: number
}

function activeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 90) return 'Activo recién'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `Activo hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Activo hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Activo hace 1 día'
  if (days < 30) return `Activo hace ${days} días`
  return 'Activo ' + new Date(iso).toLocaleDateString('es')
}

function Star({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={on ? 'var(--mod-fg)' : 'none'} stroke={on ? 'var(--mod-fg)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export default function ProjectsView({
  projects,
  clients = [],
  templates = [],
}: {
  projects: ProjectOverview[]
  clients?: { id: string; name: string }[]
  templates?: { id: string; name: string; type: string }[]
}) {
  const [createType, setCreateType] = useState('seo')
  const tplFor = (type: string) => templates.filter((t) => t.type === type || t.type === 'general')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectOverview | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState<string | null>(null)

  const StatusPill = ({ p }: { p: ProjectOverview }) => {
    const s = statusOf(p.status)
    return (
      <div className="dropdown">
        <button type="button" className={`pstatus ${s.cls}`} onClick={() => setStatusOpen(statusOpen === p.id ? null : p.id)}>
          {s.label}
        </button>
        {statusOpen === p.id && (
          <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
            {STATUSES.map((opt) => (
              <form key={opt.key} action={setProjectStatus} onSubmit={() => setStatusOpen(null)}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="status" value={opt.key} />
                <button type="submit" className="dropdown-item">
                  <span className={`pstatus ${opt.cls}`}>{opt.label}</span>
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Indicador informativo: solo muestra cuántas tareas vencidas hay (no cambia el estado)
  const RiskHint = ({ p }: { p: ProjectOverview }) =>
    p.overdue > 0 ? (
      <span className="risk-hint" title="Tareas vencidas en este proyecto">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        {p.overdue} {p.overdue === 1 ? 'tarea vencida' : 'tareas vencidas'}
      </span>
    ) : null

  const TypeBadge = ({ p }: { p: ProjectOverview }) => {
    const t = projectTypeOf(p.type)
    return <span className={`ptype ${t.cls}`} title={`Proyecto ${t.label}`}>{t.label}</span>
  }

  const StarBtn = ({ p }: { p: ProjectOverview }) => (
    <form action={toggleFavorite}>
      <input type="hidden" name="project_id" value={p.id} />
      <input type="hidden" name="favorite" value={String(p.favorite)} />
      <button type="submit" className="proj-star" title={p.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}>
        <Star on={p.favorite} />
      </button>
    </form>
  )

  const Menu = ({ p }: { p: ProjectOverview }) => (
    <div className="dropdown">
      <button type="button" className="proj-more" onClick={() => setMenuOpen(menuOpen === p.id ? null : p.id)} title="Acciones">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {menuOpen === p.id && (
        <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
          <button type="button" className="dropdown-item" onClick={() => { setEditing(p); setMenuOpen(null) }}>Editar</button>
          <form action={deleteProject} onSubmit={(e) => { if (!confirm('¿Eliminar el proyecto y todas sus tareas?')) e.preventDefault(); else setMenuOpen(null) }}>
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="dropdown-item" style={{ color: 'var(--urgent-fg)' }}>Eliminar</button>
          </form>
        </div>
      )}
    </div>
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="proj-toolbar">
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Iniciar un nuevo proyecto
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
          <p className="card-title mb-1">Aún no tienes proyectos</p>
          <p className="card-desc">Crea tu primer proyecto para empezar a organizar el trabajo.</p>
        </div>
      ) : (
        <div className="projtable">
          <div className="projtable-head">
            <span />
            <span>Nombre</span>
            <span>Cliente</span>
            <span>Tipo</span>
            <span>Estado</span>
            <span>Vencidas</span>
            <span>Actividad</span>
            <span />
          </div>
          {projects.map((p) => (
            <div className="projtable-row" key={p.id}>
              <StarBtn p={p} />
              <Link href={`/projects/${p.id}`} className="projtable-name">
                <span className="name">{p.name}</span>
              </Link>
              <span className="projtable-cell projtable-muted">{p.client ?? '—'}</span>
              <span className="projtable-cell"><TypeBadge p={p} /></span>
              <span className="projtable-cell"><StatusPill p={p} /></span>
              <span className="projtable-cell">
                {p.overdue > 0 ? <RiskHint p={p} /> : <span className="projtable-muted">—</span>}
              </span>
              <span className="projtable-cell proj-active">{activeAgo(p.last_activity)}</span>
              <Menu p={p} />
            </div>
          ))}
        </div>
      )}

      {/* Modal crear */}
      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Crear proyecto</h2>
            <p className="modal-sub">Datos básicos del proyecto.</p>
            <form action={async (fd) => { await createProject(fd); setCreateOpen(false) }}>
              <div className="flex flex-col gap-3">
                <input name="name" className="field" placeholder="Nombre del proyecto" autoFocus autoComplete="off" required />
                <label className="k">Cliente</label>
                <select name="client_id" className="field" defaultValue="">
                  <option value="">Sin cliente</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <textarea name="description" className="field" placeholder="Descripción (opcional)" rows={3} />
                <label className="k">Tipo de proyecto</label>
                <select name="type" className="field" value={createType} onChange={(e) => setCreateType(e.target.value)}>
                  {PROJECT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <label className="k">Plantilla (opcional)</label>
                <select name="template_id" className="field" defaultValue="" key={createType}>
                  <option value="">Sin plantilla</option>
                  {tplFor(createType).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <label className="k">Estado</label>
                <select name="status" className="field" defaultValue="upcoming">
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Crear proyecto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Editar proyecto</h2>
            <form action={async (fd) => { await updateProject(fd); setEditing(null) }}>
              <input type="hidden" name="id" value={editing.id} />
              <div className="flex flex-col gap-3">
                <input name="name" className="field" defaultValue={editing.name} autoComplete="off" required />
                <label className="k">Cliente</label>
                <select name="client_id" className="field" defaultValue={editing.client_id ?? ''}>
                  <option value="">Sin cliente</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <textarea name="description" className="field" defaultValue={editing.description ?? ''} placeholder="Descripción (opcional)" rows={3} />
                <label className="k">Tipo de proyecto</label>
                <select name="type" className="field" defaultValue={editing.type}>
                  {PROJECT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <label className="k">Estado</label>
                <select name="status" className="field" defaultValue={editing.status}>
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
