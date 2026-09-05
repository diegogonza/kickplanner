import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import MyTasksList, { type MyTask } from '@/app/components/views/my-tasks-list'

const COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, project_id, projects(name)'

type FilterKey = 'overdue' | 'due_soon' | 'unassigned'
const FILTERS: Record<FilterKey, { title: string }> = {
  overdue: { title: 'Tareas vencidas' },
  due_soon: { title: 'Vencen en 7 días' },
  unassigned: { title: 'Sin responsable' },
}

function projectName(row: { projects: { name: string } | { name: string }[] | null }): string {
  const p = row.projects
  if (!p) return 'Proyecto'
  return Array.isArray(p) ? (p[0]?.name ?? 'Proyecto') : p.name
}

export default async function PanelTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const key: FilterKey = (['overdue', 'due_soon', 'unassigned'] as const).includes(filter as FilterKey)
    ? (filter as FilterKey)
    : 'overdue'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Base de fecha en UTC para coincidir con current_date de la BD (usado por pm_dashboard)
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const in7 = new Date(now)
  in7.setUTCDate(in7.getUTCDate() + 7)
  const in7Str = in7.toISOString().slice(0, 10)

  // Mismos criterios que los KPIs del panel (pm_dashboard)
  let query = supabase.from('tasks').select(COLS).neq('status', 'done')
  if (key === 'overdue') query = query.lt('due_date', todayStr)
  else if (key === 'due_soon') query = query.gte('due_date', todayStr).lt('due_date', in7Str)
  else query = query.is('assignee_id', null)

  const { data } = await query.order('due_date', { ascending: true, nullsFirst: false })

  const rows = (data ?? []) as unknown as (MyTask & {
    projects: { name: string } | { name: string }[] | null
  })[]
  const listTasks: MyTask[] = rows.map((r) => ({ ...r, project_name: projectName(r) }))

  return (
    <div className="flex h-full">
      <Sidebar active="panel" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">
              <Link href="/panel" style={{ color: 'var(--text-3)' }}>Panel</Link> / {FILTERS[key].title}
            </div>
            <h1 className="page-title">
              {FILTERS[key].title}
              <span className="count-badge">{listTasks.length}</span>
            </h1>
          </div>
          <Link className="btn btn-outline" href="/panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Volver al panel
          </Link>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="w-full">
            {listTasks.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Nada por aquí</p>
                <p className="card-desc">No hay tareas que coincidan con este filtro.</p>
              </div>
            ) : (
              <MyTasksList tasks={listTasks} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
