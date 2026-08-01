import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from './components/sidebar'
import NewProjectButton from './components/new-project-button'

type Project = {
  id: string
  name: string
  created_at: string
}

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  const list = (projects ?? []) as Project[]

  return (
    <div className="flex h-screen">
      <Sidebar email={user.email ?? ''} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Proyectos
              <span className="count-badge">{list.length}</span>
            </h1>
          </div>
          <NewProjectButton />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            {list.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Todavía no tenés proyectos</p>
                <p className="card-desc mb-5">Creá el primero para empezar a organizar tareas.</p>
                <div className="flex justify-center">
                  <NewProjectButton label="Crear mi primer proyecto" />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="card block">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-[10px]"
                        style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                      <div>
                        <p className="card-title">{project.name}</p>
                        <p className="card-desc">Abrir tablero de tareas</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
