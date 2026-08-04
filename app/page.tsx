import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from './components/sidebar'
import ProjectsView, { type ProjectOverview } from './components/projects-view'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('projects_overview')
  const projects = (data ?? []) as ProjectOverview[]

  return (
    <div className="flex h-screen">
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
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-5xl">
            <ProjectsView projects={projects} />
          </div>
        </div>
      </div>
    </div>
  )
}
