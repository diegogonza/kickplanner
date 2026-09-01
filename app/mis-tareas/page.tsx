import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import MyTasksList, { type MyTask } from '@/app/components/views/my-tasks-list'
import CalendarView from '@/app/components/views/calendar-view'
import type { Task } from '@/app/projects/statuses'

const COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, project_id, projects(name, color_hue)'

const TABS = [
  { key: 'lista', label: 'Lista' },
  { key: 'calendario', label: 'Calendario' },
]

type ProjRel = { name: string; color_hue: number | null } | { name: string; color_hue: number | null }[] | null
function projectName(row: { projects: ProjRel }): string {
  const p = row.projects
  if (!p) return 'Proyecto'
  return Array.isArray(p) ? (p[0]?.name ?? 'Proyecto') : p.name
}
function projectHue(row: { projects: ProjRel }): number | null {
  const p = row.projects
  if (!p) return null
  return (Array.isArray(p) ? p[0]?.color_hue : p.color_hue) ?? null
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const active = TABS.some((t) => t.key === view) ? view! : 'lista'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('tasks')
    .select(COLS)
    .eq('assignee_id', user.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  const rows = (data ?? []) as unknown as (MyTask & { projects: ProjRel })[]

  const listTasks: MyTask[] = rows.map((r) => ({ ...r, project_name: projectName(r) }))
  const calTasks = rows.map((r) => ({ ...r, project_name: projectName(r), project_hue: projectHue(r) })) as unknown as (Task & {
    project_id: string
    project_name: string
    project_hue: number | null
  })[]
  const pending = rows.filter((t) => t.status !== 'done').length

  return (
    <div className="flex h-full">
      <Sidebar active="mis-tareas" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Mis tareas
              <span className="count-badge">{pending}</span>
            </h1>
          </div>
          <a className="btn btn-outline" href="/api/export/tasks?assignee=me" title="Exportar a Excel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Exportar
          </a>
        </header>

        <div className="tabs">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/mis-tareas?view=${tab.key}`}
              className={`tab ${active === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {active === 'lista' ? (
            <div className="w-full">
              <MyTasksList tasks={listTasks} />
            </div>
          ) : (
            <CalendarView projectId="" view="calendario" tasks={calTasks} groupByProject />
          )}
        </div>
      </div>
    </div>
  )
}
