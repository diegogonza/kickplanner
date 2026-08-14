import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import Avatar from '@/app/components/avatar'
import { displayName } from '@/app/projects/statuses'

type SearchTask = {
  id: string
  title: string
  status: string
  priority: string | null
  due_date: string | null
  project_id: string
  project_name: string
  assignee_id: string | null
  assignee_name: string | null
  assignee_email: string | null
  assignee_avatar: string | null
}

type ProjectRow = { id: string; name: string; client: string | null; status: string }

const GRID = '30px minmax(0, 1fr) 130px 210px'

function fmtDue(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}
function dotColor(seed: string): string {
  const colors = ['#FD5F5C', '#2E77E6', '#14B8A6', '#E0A81E', '#EC4899', '#7B5CF0', '#22C55E']
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Sin completar', todo: 'Pendiente', doing: 'En curso', done: 'Completada',
}
const DUE_LABEL: Record<string, string> = {
  overdue: 'Vencidas', today: 'Hoy', week: 'Esta semana', range: 'Rango', none: 'Sin fecha',
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; status?: string; assignee?: string; project?: string; due?: string; type?: string; from?: string; to?: string
  }>
}) {
  const params = await searchParams
  const query = (params.q ?? '').trim()
  const status = params.status ?? 'all'
  const assignee = params.assignee ?? ''
  const project = params.project ?? ''
  const due = params.due ?? 'any'
  const type = params.type ?? 'all'
  const from = params.from ?? ''
  const to = params.to ?? ''

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: taskData } = await supabase.rpc('search_tasks_adv', {
    p_q: query,
    p_status: status,
    p_assignee: assignee && assignee !== 'me' ? assignee : null,
    p_assignee_me: assignee === 'me',
    p_project: project || null,
    p_due: due,
    p_include_subtasks: type !== 'top',
    p_from: due === 'range' && from ? from : null,
    p_to: due === 'range' && to ? to : null,
  })
  const tasks = (taskData ?? []) as SearchTask[]

  const { data: projData } = await supabase.rpc('projects_overview')
  const allProjects = (projData ?? []) as ProjectRow[]

  // Agrupar tareas por responsable
  const groups = new Map<string, { name: string; email: string | null; avatar: string | null; items: SearchTask[] }>()
  for (const t of tasks) {
    const key = t.assignee_id ?? '__none__'
    if (!groups.has(key)) {
      groups.set(key, {
        name: t.assignee_id ? displayName({ full_name: t.assignee_name, email: t.assignee_email ?? '' }) : 'Sin responsable',
        email: t.assignee_email,
        avatar: t.assignee_avatar,
        items: [],
      })
    }
    groups.get(key)!.items.push(t)
  }

  // Construcción de URLs preservando filtros
  const baseParams: Record<string, string> = {}
  if (query) baseParams.q = query
  if (status !== 'all') baseParams.status = status
  if (assignee) baseParams.assignee = assignee
  if (project) baseParams.project = project
  if (due !== 'any') baseParams.due = due
  if (due === 'range' && from) baseParams.from = from
  if (due === 'range' && to) baseParams.to = to
  if (type !== 'all') baseParams.type = type
  const buildHref = (extra: Record<string, string>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...baseParams, ...extra })) if (v) u.set(k, v)
    const s = u.toString()
    return '/buscar' + (s ? `?${s}` : '')
  }
  const exportParams = new URLSearchParams()
  for (const [k, v] of Object.entries(baseParams)) if (v) exportParams.set(k, v)
  const exportHref = '/api/export/tasks' + (exportParams.toString() ? `?${exportParams.toString()}` : '')

  // Chips de filtros activos
  const assigneeName =
    assignee === 'me'
      ? 'mí'
      : tasks.find((t) => t.assignee_id === assignee)?.assignee_name ?? 'persona'
  const projName = allProjects.find((p) => p.id === project)?.name ?? 'proyecto'
  const chips: { keys: string[]; label: string }[] = []
  if (status !== 'all') chips.push({ keys: ['status'], label: `Estado: ${STATUS_LABEL[status] ?? status}` })
  if (assignee) chips.push({ keys: ['assignee'], label: `Asignada a: ${assigneeName}` })
  if (project) chips.push({ keys: ['project'], label: `Proyecto: ${projName}` })
  if (due !== 'any') {
    const label =
      due === 'range'
        ? `Fecha: ${from || '…'} → ${to || '…'}`
        : `Fecha: ${DUE_LABEL[due] ?? due}`
    chips.push({ keys: due === 'range' ? ['due', 'from', 'to'] : ['due'], label })
  }
  if (type === 'top') chips.push({ keys: ['type'], label: 'Solo tareas' })

  return (
    <div className="flex h-full">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Búsqueda</div>
            <h1 className="page-title">
              {query ? `Resultados para “${query}”` : 'Resultados de la búsqueda'}
              <span className="count-badge">{tasks.length}</span>
            </h1>
          </div>
          {tasks.length > 0 && (
            <a href={exportHref} className="btn btn-outline" title="Exportar a Excel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Exportar a Excel
            </a>
          )}
        </header>

        {chips.length > 0 && (
          <div className="search-chips">
            {chips.map((c) => (
              <Link
                key={c.keys.join('-')}
                href={buildHref(Object.fromEntries(c.keys.map((k) => [k, ''])))}
                className="search-chip"
                title="Quitar filtro"
              >
                {c.label}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Link>
            ))}
            <Link href={query ? `/buscar?q=${encodeURIComponent(query)}` : '/buscar'} className="search-chip-clear">
              Limpiar filtros
            </Link>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="w-full">
            {tasks.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Sin resultados</p>
                <p className="card-desc">No encontramos tareas que coincidan con tu búsqueda.</p>
              </div>
            ) : (
                <div className="ltable" style={{ ['--lt-grid' as string]: GRID }}>
                  <div className="lt-head">
                    <span aria-hidden />
                    <span>Nombre de la tarea</span>
                    <span>Fecha de entrega</span>
                    <span>Proyecto</span>
                  </div>

                  {[...groups.values()].map((g) => (
                    <div className="lgroup" key={g.name + (g.email ?? '')}>
                      <div className="search-group">
                        <Avatar name={g.name} email={g.email ?? ''} url={g.avatar} size={26} />
                        <span className="gname">{g.name}</span>
                        <span className="gcount">{g.items.length}</span>
                      </div>
                      <div className="lrows">
                        {g.items.map((t) => {
                          const done = t.status === 'done'
                          return (
                            <div key={t.id} className={`lrow ${done ? 'done' : ''}`} style={{ ['--lt-grid' as string]: GRID }}>
                              <span
                                className="search-status"
                                style={{
                                  background: done ? 'var(--low-fg)' : 'transparent',
                                  borderColor: done ? 'var(--low-fg)' : 'var(--border-strong)',
                                  color: '#fff',
                                }}
                              >
                                {done && (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                )}
                              </span>
                              <div className="lname">
                                <Link href={`/projects/${t.project_id}?task=${t.id}`} className="title">
                                  {t.title}
                                </Link>
                              </div>
                              <span className="ldue" style={{ color: 'var(--text-3)' }}>
                                {t.due_date ? fmtDue(t.due_date) : '—'}
                              </span>
                              <Link href={`/projects/${t.project_id}`} className="search-proj" title={t.project_name}>
                                <span className="dot" style={{ background: dotColor(t.project_id) }} />
                                <span className="search-proj-name">{t.project_name}</span>
                              </Link>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
