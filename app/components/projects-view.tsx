'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  createProject,
  updateProject,
  setProjectStatus,
  setProjectManager,
  setProjectUrl,
  toggleFavorite,
  deleteProject,
} from '@/app/projects/actions'
import {
  PROJECT_STATUSES as STATUSES,
  projectStatusOf as statusOf,
  PROJECT_TYPES,
  projectTypeOf,
  money,
} from '@/app/projects/statuses'
import Avatar from '@/app/components/avatar'

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
  manager_id: string | null
  manager: string | null
  manager_avatar: string | null
  start_date: string | null
  fee: number | null
  currency: string
  url: string | null
}

type Member = { user_id: string; email: string; full_name: string | null; avatar_url: string | null }

const memberName = (m: Member) => m.full_name?.trim() || m.email

// Paleta pastel (tintes suaves) para las píldoras de estado
const STATUS_PASTEL: Record<string, { bg: string; fg: string }> = {
  upcoming: { bg: '#E6F1FB', fg: '#0C447C' },
  on_track: { bg: '#E1F5EE', fg: '#0F6E56' },
  at_risk: { bg: '#FAEEDA', fg: '#854F0B' },
  on_hold: { bg: '#ECEEF2', fg: '#444441' },
}

// Antigüedad del cliente: días activo y "mes" del contrato (bloques de 30 días)
function ageInfo(start: string | null): { month: number; days: number } | null {
  if (!start) return null
  const [y, m, d] = start.split('-').map(Number)
  const s = new Date(y, m - 1, d)
  s.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.floor((today.getTime() - s.getTime()) / 86400000)
  if (days < 0) return { month: 1, days: 0 }
  return { month: Math.floor(days / 30) + 1, days }
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
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
  members = [],
}: {
  projects: ProjectOverview[]
  clients?: { id: string; name: string }[]
  templates?: { id: string; name: string; type: string }[]
  members?: Member[]
}) {
  const [createType, setCreateType] = useState('seo')
  const tplFor = (type: string) => templates.filter((t) => t.type === type || t.type === 'general')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectOverview | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState<string | null>(null)
  const [managerOpen, setManagerOpen] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // El botón "Iniciar un nuevo proyecto" vive en el header y abre este modal por evento
  useEffect(() => {
    const open = () => setCreateOpen(true)
    window.addEventListener('open-new-project', open)
    return () => window.removeEventListener('open-new-project', open)
  }, [])

  // Filtros por columna (estilo data table), aplicados en cliente
  const [fName, setFName] = useState('')
  const [fClient, setFClient] = useState('')
  const [fManager, setFManager] = useState('')
  const [fType, setFType] = useState('')
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set())
  const [fOverdue, setFOverdue] = useState('')

  const toggleStatus = (key: string) =>
    setStatusSel((prev) => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const anyFilter = !!(fName.trim() || fClient || fManager || fType || statusSel.size > 0 || fOverdue)
  const clearFilters = () => {
    setFName(''); setFClient(''); setFManager(''); setFType(''); setStatusSel(new Set()); setFOverdue('')
  }

  const filtered = useMemo(() => {
    const q = fName.trim().toLowerCase()
    return projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (fClient) {
        if (fClient === '__none__' ? p.client_id != null : p.client_id !== fClient) return false
      }
      if (fManager) {
        if (fManager === '__none__' ? p.manager_id != null : p.manager_id !== fManager) return false
      }
      if (fType && p.type !== fType) return false
      if (statusSel.size > 0 && !statusSel.has(p.status)) return false
      if (fOverdue === 'with' && !(p.overdue > 0)) return false
      if (fOverdue === 'without' && p.overdue > 0) return false
      return true
    })
  }, [projects, fName, fClient, fManager, fType, statusSel, fOverdue])

  // Base para el conteo de las píldoras: todo menos el filtro de estado
  const baseForCounts = useMemo(() => {
    const q = fName.trim().toLowerCase()
    return projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (fClient) { if (fClient === '__none__' ? p.client_id != null : p.client_id !== fClient) return false }
      if (fManager) { if (fManager === '__none__' ? p.manager_id != null : p.manager_id !== fManager) return false }
      if (fType && p.type !== fType) return false
      if (fOverdue === 'with' && !(p.overdue > 0)) return false
      if (fOverdue === 'without' && p.overdue > 0) return false
      return true
    })
  }, [projects, fName, fClient, fManager, fType, fOverdue])
  const statusCount = (key: string) => (key === '' ? baseForCounts.length : baseForCounts.filter((p) => p.status === key).length)

  // Agrupa por encargado (respetando el orden original dentro de cada grupo)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; avatar: string | null; items: ProjectOverview[] }>()
    for (const p of filtered) {
      const key = p.manager_id ?? '__none__'
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: p.manager_id ? p.manager ?? 'Encargado' : 'Sin encargado',
          avatar: p.manager_avatar,
          items: [],
        })
      }
      map.get(key)!.items.push(p)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === '__none__') return 1
      if (b.key === '__none__') return -1
      return a.name.localeCompare(b.name)
    })
  }, [filtered])

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

  // Celda de encargado: avatar + nombre, con menú para reasignar
  const ManagerCell = ({ p }: { p: ProjectOverview }) => (
    <div className="dropdown proj-manager">
      <button
        type="button"
        className="proj-manager-btn"
        onClick={() => setManagerOpen(managerOpen === p.id ? null : p.id)}
        title={p.manager ? `Encargado: ${p.manager}` : 'Sin encargado'}
      >
        {p.manager_id ? (
          <>
            <Avatar name={p.manager} url={p.manager_avatar} size={22} />
            <span className="proj-manager-name">{p.manager}</span>
          </>
        ) : (
          <span className="proj-manager-none">
            <span className="proj-manager-dot" />
            Sin encargado
          </span>
        )}
      </button>
      {managerOpen === p.id && (
        <div className="dropdown-menu" style={{ left: 0, minWidth: 210, maxHeight: 260, overflowY: 'auto' }}>
          <div className="dropdown-label">Encargado</div>
          {members.map((m) => (
            <form key={m.user_id} action={setProjectManager} onSubmit={() => setManagerOpen(null)}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="manager_id" value={m.user_id} />
              <button type="submit" className="dropdown-item">
                <span className="flex items-center gap-2">
                  <Avatar name={m.full_name} email={m.email} url={m.avatar_url} size={22} />
                  {memberName(m)}
                </span>
              </button>
            </form>
          ))}
          {p.manager_id && (
            <form action={setProjectManager} onSubmit={() => setManagerOpen(null)}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="manager_id" value="" />
              <button type="submit" className="dropdown-item" style={{ color: 'var(--text-3)' }}>
                Quitar encargado
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )

  const RiskHint = ({ p }: { p: ProjectOverview }) =>
    p.overdue > 0 ? (
      <Link className="risk-hint" href={`/projects/${p.id}?view=lista&overdue=1`} title="Ver las tareas vencidas de este proyecto">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        {p.overdue} {p.overdue === 1 ? 'tarea vencida' : 'tareas vencidas'}
      </Link>
    ) : null

  const TypeBadge = ({ p }: { p: ProjectOverview }) => {
    const t = projectTypeOf(p.type)
    return <span className={`ptype ${t.cls}`} title={`Proyecto ${t.label}`}>{t.label}</span>
  }

  const UrlCell = ({ p }: { p: ProjectOverview }) => (
    <form action={setProjectUrl} className="proj-url">
      <input type="hidden" name="id" value={p.id} />
      <input
        name="url"
        defaultValue={p.url ?? ''}
        placeholder="Agregar URL…"
        className="proj-url-input"
        autoComplete="off"
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
      {p.url && (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="proj-url-open" title="Abrir en pestaña nueva">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        </a>
      )}
    </form>
  )

  const AgeCell = ({ p }: { p: ProjectOverview }) => {
    const a = ageInfo(p.start_date)
    if (!a) {
      return (
        <button type="button" className="proj-age-empty" onClick={() => setEditing(p)} title="Definir fecha de inicio">
          Definir inicio
        </button>
      )
    }
    return (
      <span className="proj-age" title={`Inicio: ${fmtDate(p.start_date!)}`}>
        <b className="proj-age-month">Mes {a.month}</b>
        <span className="proj-age-days">{a.days} {a.days === 1 ? 'día' : 'días'} activo</span>
      </span>
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

  const Row = ({ p }: { p: ProjectOverview }) => (
    <div className="projtable-row">
      <StarBtn p={p} />
      <Link href={`/projects/${p.id}`} className="projtable-name">
        <span className="name">{p.name}</span>
      </Link>
      <span className="projtable-cell projtable-muted">{p.client ?? '—'}</span>
      <span className="projtable-cell"><UrlCell p={p} /></span>
      <span className="projtable-cell projtable-fee">
        {p.fee != null ? (
          <>
            {money(p.fee, p.currency)}
            <span className="projtable-fee-unit">{p.type === 'web' ? 'total' : '/mes'}</span>
          </>
        ) : (
          <span className="projtable-muted">—</span>
        )}
      </span>
      <span className="projtable-cell"><AgeCell p={p} /></span>
      <span className="projtable-cell"><ManagerCell p={p} /></span>
      <span className="projtable-cell"><TypeBadge p={p} /></span>
      <span className="projtable-cell"><StatusPill p={p} /></span>
      <span className="projtable-cell">
        {p.overdue > 0 ? <RiskHint p={p} /> : <span className="projtable-muted">—</span>}
      </span>
      <span className="projtable-cell proj-active">{activeAgo(p.last_activity)}</span>
      <Menu p={p} />
    </div>
  )

  return (
    <div>
      {projects.length === 0 ? (
        <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
          <p className="card-title mb-1">Aún no tienes proyectos</p>
          <p className="card-desc">Crea tu primer proyecto para empezar a organizar el trabajo.</p>
        </div>
      ) : (
        <>
          {/* Barra de filtros: buscador + Advanced Search + píldoras de estado */}
          <div className="projfilters">
            <div className="projfilter projfilter-search">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="Buscar proyectos…"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className={`proj-advanced-toggle ${advancedOpen || fClient || fManager || fType || fOverdue ? 'on' : ''}`}
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              Advanced Search
            </button>

            <div className="proj-pills">
              <button
                type="button"
                className={`proj-pill proj-pill-all ${statusSel.size === 0 ? 'on' : ''}`}
                onClick={() => setStatusSel(new Set())}
                title="Ver todos los estados"
              >
                Todos <span className="proj-pill-count">{statusCount('')}</span>
              </button>
              {STATUSES.map((s) => {
                const pastel = STATUS_PASTEL[s.key] ?? { bg: '#ECEEF2', fg: '#444441' }
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`proj-pill ${statusSel.has(s.key) ? 'on' : ''}`}
                    style={{ background: pastel.bg, color: pastel.fg }}
                    onClick={() => toggleStatus(s.key)}
                    aria-pressed={statusSel.has(s.key)}
                  >
                    {s.label} <span className="proj-pill-count">{statusCount(s.key)}</span>
                  </button>
                )
              })}
              <button
                type="button"
                className={`proj-groupbtn ${groupBy ? 'on' : ''}`}
                onClick={() => setGroupBy((v) => !v)}
                title="Agrupar proyectos por encargado"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
                {groupBy ? 'Sin agrupar' : 'Agrupar por encargado'}
              </button>
            </div>
          </div>

          {/* Filtros avanzados (se despliegan con Advanced Search) */}
          {advancedOpen && (
            <div className="projfilters proj-advanced">
              <select className="projfilter-sel" value={fClient} onChange={(e) => setFClient(e.target.value)} title="Cliente">
                <option value="">Cliente: todos</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__none__">Sin cliente</option>
              </select>
              <select className="projfilter-sel" value={fManager} onChange={(e) => setFManager(e.target.value)} title="Encargado">
                <option value="">Encargado: todos</option>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
                <option value="__none__">Sin encargado</option>
              </select>
              <select className="projfilter-sel" value={fType} onChange={(e) => setFType(e.target.value)} title="Tipo">
                <option value="">Tipo: todos</option>
                {PROJECT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <select className="projfilter-sel" value={fOverdue} onChange={(e) => setFOverdue(e.target.value)} title="Vencidas">
                <option value="">Vencidas: todas</option>
                <option value="with">Con vencidas</option>
                <option value="without">Sin vencidas</option>
              </select>
              {anyFilter && (
                <button type="button" className="projfilter-clear" onClick={clearFilters}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  Limpiar
                </button>
              )}
              <span className="projfilter-count">{filtered.length} de {projects.length}</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
              <p className="card-title mb-1">Sin resultados</p>
              <p className="card-desc">Ningún proyecto coincide con los filtros. <button type="button" className="linklike" onClick={clearFilters}>Limpiar filtros</button></p>
            </div>
          ) : (
            <div className="projtable">
              <div className="projtable-head">
                <span />
                <span>Nombre</span>
                <span>Cliente</span>
                <span>URL</span>
                <span>Fee</span>
                <span>Antigüedad</span>
                <span>Encargado</span>
                <span>Tipo</span>
                <span>Estado</span>
                <span>Vencidas</span>
                <span>Actividad</span>
                <span />
              </div>

              {groupBy
                ? groups.map((g) => (
                    <Fragment key={g.key}>
                      <div className="projgroup">
                        {g.key !== '__none__' && <Avatar name={g.name} url={g.avatar} size={22} />}
                        <span className="projgroup-title">Encargado: {g.name}</span>
                        <span className="projgroup-count">{g.items.length}</span>
                      </div>
                      {g.items.map((p) => <Row key={p.id} p={p} />)}
                    </Fragment>
                  ))
                : filtered.map((p) => <Row key={p.id} p={p} />)}
            </div>
          )}
        </>
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
                <label className="k">Encargado</label>
                <select name="manager_id" className="field" defaultValue="">
                  <option value="">Sin encargado</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
                </select>
                <label className="k">Fecha de inicio</label>
                <input type="date" name="start_date" className="field" defaultValue="" />
                <label className="k">Fee (mensual si SEO · total si Web)</label>
                <div className="flex gap-2">
                  <input type="number" name="fee" className="field" placeholder="0" style={{ flex: 1 }} min="0" step="any" />
                  <select name="currency" className="field" defaultValue="COP" style={{ width: 96 }}>
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <label className="k">URL del proyecto</label>
                <input name="url" className="field" placeholder="https://…" autoComplete="off" />
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
                <label className="k">Encargado</label>
                <select name="manager_id" className="field" defaultValue={editing.manager_id ?? ''}>
                  <option value="">Sin encargado</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}
                </select>
                <label className="k">Fecha de inicio</label>
                <input type="date" name="start_date" className="field" defaultValue={editing.start_date ?? ''} />
                <label className="k">Fee (mensual si SEO · total si Web)</label>
                <div className="flex gap-2">
                  <input type="number" name="fee" className="field" placeholder="0" defaultValue={editing.fee ?? ''} style={{ flex: 1 }} min="0" step="any" />
                  <select name="currency" className="field" defaultValue={editing.currency ?? 'COP'} style={{ width: 96 }}>
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <label className="k">URL del proyecto</label>
                <input name="url" className="field" placeholder="https://…" defaultValue={editing.url ?? ''} autoComplete="off" />
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
