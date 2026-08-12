import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import Avatar from '@/app/components/avatar'
import { STATUSES, PRIORITIES, displayName } from '@/app/projects/statuses'

type PerProject = { id: string; name: string; status: string; total: number; done: number; overdue: number }
type Workload = {
  assignee_id: string
  full_name: string | null
  email: string
  avatar_url: string | null
  open: number
  overdue: number
}
type Dash = {
  projects_total: number
  projects_by_status: Record<string, number>
  tasks_total: number
  tasks_by_status: Record<string, number>
  tasks_by_priority: Record<string, number>
  overdue: number
  due_soon: number
  unassigned: number
  completed_pct: number
  per_project: PerProject[]
  workload: Workload[]
}

const PSTATUS: Record<string, { label: string; cls: string }> = {
  inprogress: { label: 'In progress', cls: 'ps-prog' },
  research: { label: 'Research', cls: 'ps-research' },
  ideate: { label: 'Ideate', cls: 'ps-ideate' },
  blocked: { label: 'Blocked', cls: 'ps-blocked' },
  completed: { label: 'Completed', cls: 'ps-done' },
}

export default async function PanelPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('pm_dashboard')
  const d = (data ?? {}) as Dash
  const pct = d.completed_pct ?? 0

  // Donut de progreso
  const R = 52
  const C = 2 * Math.PI * R
  const dash = (C * pct) / 100

  const statusMax = Math.max(1, ...STATUSES.map((s) => d.tasks_by_status?.[s.key] ?? 0))
  const workloadMax = Math.max(1, ...(d.workload ?? []).map((w) => w.open))

  const prioList = [
    ...PRIORITIES.map((p) => ({ key: p.key, label: p.label, color: p.color })),
    { key: 'none', label: 'Sin prioridad', color: 'var(--text-3)' },
  ]

  const kpis = [
    { label: 'Proyectos', value: d.projects_total ?? 0, color: 'var(--text)' },
    { label: 'Tareas', value: d.tasks_total ?? 0, color: 'var(--text)' },
    { label: 'Completado', value: `${pct}%`, color: 'var(--low-fg)' },
    { label: 'Vencidas', value: d.overdue ?? 0, color: 'var(--urgent-fg)' },
    { label: 'Vencen en 7 días', value: d.due_soon ?? 0, color: 'var(--mod-fg)' },
    { label: 'Sin responsable', value: d.unassigned ?? 0, color: 'var(--text-2)' },
  ]

  return (
    <div className="flex h-full">
      <Sidebar active="panel" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">Panel</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-5xl">
            {/* KPIs */}
            <div className="kpi-grid">
              {kpis.map((k) => (
                <div className="kpi" key={k.label}>
                  <div className="kpi-num" style={{ color: k.color }}>{k.value}</div>
                  <div className="kpi-label">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Progreso + prioridad + carga */}
            <div className="dash-grid">
              <div className="card">
                <div className="section-head" style={{ margin: '0 0 var(--space-4)' }}>Progreso general</div>
                <div className="flex items-center gap-5">
                  <svg viewBox="0 0 120 120" width="120" height="120" style={{ flex: '0 0 120px' }}>
                    <circle cx="60" cy="60" r={R} fill="none" stroke="var(--panel)" strokeWidth="14" />
                    <circle
                      cx="60" cy="60" r={R} fill="none" stroke="var(--brand-600)" strokeWidth="14" strokeLinecap="round"
                      strokeDasharray={`${dash} ${C}`} transform="rotate(-90 60 60)"
                    />
                    <text x="60" y="60" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="700" fill="var(--text)">{pct}%</text>
                  </svg>
                  <div className="flex-1">
                    {STATUSES.map((s) => {
                      const v = d.tasks_by_status?.[s.key] ?? 0
                      return (
                        <div key={s.key} className="bar-row">
                          <span className="bar-label"><span className="dot" style={{ background: s.color }} />{s.label}</span>
                          <span className="bar"><span className="bar-fill" style={{ width: `${(v / statusMax) * 100}%`, background: s.color }} /></span>
                          <span className="bar-val">{v}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="dash-sep" />
                <div className="section-head" style={{ margin: '0 0 var(--space-3)' }}>Por prioridad</div>
                <div className="flex flex-wrap gap-2">
                  {prioList.map((p) => (
                    <span key={p.key} className="prio-chip" style={{ color: p.color }}>
                      <span className="dot" style={{ background: p.color }} />
                      {p.label}: <b>{d.tasks_by_priority?.[p.key] ?? 0}</b>
                    </span>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-head" style={{ margin: '0 0 var(--space-4)' }}>Carga por responsable</div>
                {(d.workload ?? []).length === 0 ? (
                  <p className="card-desc">No hay tareas asignadas.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {(d.workload ?? []).map((w) => (
                      <div key={w.assignee_id} className="wl-row">
                        <Avatar name={w.full_name} email={w.email} url={w.avatar_url} size={28} />
                        <div className="wl-main">
                          <div className="wl-top">
                            <span className="wl-name">{displayName({ full_name: w.full_name, email: w.email })}</span>
                            <span className="wl-count">
                              {w.open} abiertas
                              {w.overdue > 0 && <span className="wl-overdue"> · {w.overdue} vencidas</span>}
                            </span>
                          </div>
                          <span className="bar"><span className="bar-fill" style={{ width: `${(w.open / workloadMax) * 100}%`, background: w.overdue > 0 ? 'var(--urgent-fg)' : 'var(--brand-600)' }} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Proyectos */}
            <div className="card" style={{ marginTop: 'var(--space-4)' }}>
              <div className="section-head" style={{ margin: '0 0 var(--space-3)' }}>Proyectos</div>
              <div className="dash-projects">
                {(d.per_project ?? []).map((p) => {
                  const prog = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
                  const st = PSTATUS[p.status] ?? PSTATUS.inprogress
                  return (
                    <Link href={`/projects/${p.id}`} key={p.id} className="dproj-row">
                      <span className="dproj-name">{p.name}</span>
                      <span className={`pstatus ${st.cls}`}>{st.label}</span>
                      <span className="dproj-bar">
                        <span className="bar" style={{ flex: 1 }}><span className="bar-fill" style={{ width: `${prog}%`, background: 'var(--brand-600)' }} /></span>
                        <span className="dproj-pct">{prog}%</span>
                      </span>
                      <span className="dproj-meta">{p.done}/{p.total}</span>
                      <span className="dproj-meta" style={{ color: p.overdue > 0 ? 'var(--urgent-fg)' : 'var(--text-3)' }}>
                        {p.overdue > 0 ? `${p.overdue} vencidas` : '—'}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
