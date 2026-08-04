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

export type ProjectOverview = {
  id: string
  name: string
  client: string | null
  description: string | null
  status: string
  created_at: string
  last_activity: string
  favorite: boolean
  num_tasks: number
}

const STATUSES = [
  { key: 'inprogress', label: 'In progress', cls: 'ps-prog' },
  { key: 'research', label: 'Research', cls: 'ps-research' },
  { key: 'ideate', label: 'Ideate', cls: 'ps-ideate' },
  { key: 'blocked', label: 'Blocked', cls: 'ps-blocked' },
  { key: 'completed', label: 'Completed', cls: 'ps-done' },
]
const statusOf = (k: string) => STATUSES.find((s) => s.key === k) ?? STATUSES[0]

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

export default function ProjectsView({ projects }: { projects: ProjectOverview[] }) {
  const [view, setView] = useState<'grid' | 'list'>('grid')
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
        <div className="seg">
          <button type="button" className={`seg-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="Cuadrícula" aria-label="Cuadrícula">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          </button>
          <button type="button" className={`seg-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} title="Lista" aria-label="Lista">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="proj-grid">
          {projects.map((p) => {
            const s = statusOf(p.status)
            return (
              <div className="proj-card" key={p.id}>
                <div className="proj-card-head">
                  <Link href={`/projects/${p.id}`} className="proj-title">{p.name}</Link>
                  <div className="proj-actions">
                    <StarBtn p={p} />
                    <Menu p={p} />
                  </div>
                </div>
                {p.client && <div className="proj-client">para <b>{p.client}</b></div>}
                <Link href={`/projects/${p.id}`} className="proj-desc">
                  {p.description || 'Sin descripción'}
                </Link>
                <div className="proj-foot">
                  <span className="proj-active">{activeAgo(p.last_activity)}</span>
                  <StatusPill p={p} />
                </div>
                <span className="sr-only">{s.label}</span>
              </div>
            )
          })}

          <button type="button" className="proj-add" onClick={() => setCreateOpen(true)} title="Nuevo proyecto">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      ) : (
        <div className="proj-list">
          {projects.map((p) => (
            <div className="proj-row" key={p.id}>
              <StarBtn p={p} />
              <Link href={`/projects/${p.id}`} className="proj-row-name">
                <span className="name">{p.name}</span>
                {p.client && <span className="proj-row-client">para {p.client}</span>}
              </Link>
              <StatusPill p={p} />
              <span className="proj-active">{activeAgo(p.last_activity)}</span>
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
                <input name="client" className="field" placeholder="Cliente (opcional)" autoComplete="off" />
                <textarea name="description" className="field" placeholder="Descripción (opcional)" rows={3} />
                <select name="status" className="field" defaultValue="inprogress">
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
                <input name="client" className="field" defaultValue={editing.client ?? ''} placeholder="Cliente (opcional)" autoComplete="off" />
                <textarea name="description" className="field" defaultValue={editing.description ?? ''} placeholder="Descripción (opcional)" rows={3} />
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
