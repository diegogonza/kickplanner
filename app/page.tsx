import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from './components/sidebar'
import ProjectsView, { type ProjectOverview } from './components/projects-view'
import NewProjectTrigger from './components/new-project-trigger'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>
}) {
  const { client: clientFilter } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('projects_overview')
  const all = (data ?? []) as ProjectOverview[]
  const projects = clientFilter ? all.filter((p) => p.client_id === clientFilter) : all

  const { data: clientRows } = await supabase.from('clients').select('id, name').order('name')
  const clients = (clientRows ?? []) as { id: string; name: string }[]
  const activeClientName = clientFilter ? clients.find((c) => c.id === clientFilter)?.name : null

  const { data: tplRows } = await supabase.from('templates').select('id, name, type').order('name')
  const templates = (tplRows ?? []) as { id: string; name: string; type: string }[]

  const { data: memberRows } = await supabase.rpc('workspace_members')
  const members = (memberRows ?? []) as { user_id: string; email: string; full_name: string | null; avatar_url: string | null }[]

  return (
    <div className="flex h-full">
      <Sidebar active="projects" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Proyectos
              <span className="count-badge">{projects.length}</span>
            </h1>
          </div>
          <NewProjectTrigger />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="w-full">
            {activeClientName && (
              <div className="filter-bar">
                <span>Filtrado por cliente <b>{activeClientName}</b></span>
                <Link href="/" className="filter-clear">Quitar filtro</Link>
              </div>
            )}
            <ProjectsView projects={projects} clients={clients} templates={templates} members={members} />
          </div>
        </div>
      </div>
    </div>
  )
}
