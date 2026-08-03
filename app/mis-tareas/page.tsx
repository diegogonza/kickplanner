import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import MyTasksList, { type MyTask } from '@/app/components/views/my-tasks-list'
import CalendarView from '@/app/components/views/calendar-view'
import type { Task } from '@/app/projects/statuses'

const COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, project_id, projects(name)'

const TABS = [
  { key: 'lista', label: 'Lista' },
  { key: 'calendario', label: 'Calendario' },
]

function projectName(row: { projects: { name: string } | { name: string }[] | null }): string {
  const p = row.projects
  if (!p) return 'Proyecto'
  return Array.isArray(p) ? (p[0]?.name ?? 'Proyecto') : p.name
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

  const rows = (data ?? []) as unknown as (MyTask & {
    projects: { name: string } | { name: string }[] | null
  })[]

  const listTasks: MyTask[] = rows.map((r) => ({ ...r, project_name: projectName(r) }))
  const calTasks = rows as unknown as (Task & { project_id: string })[]
  const pending = rows.filter((t) => t.status !== 'done').length

  return (
    <div className="flex h-screen">
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
            <div className="mx-auto max-w-4xl">
              <MyTasksList tasks={listTasks} />
            </div>
          ) : (
            <CalendarView projectId="" view="calendario" tasks={calTasks} />
          )}
        </div>
      </div>
    </div>
  )
}
