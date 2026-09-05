import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import TeamMembers from '@/app/components/team-members'
import AddProjectToTeam from '@/app/components/add-project-to-team'
import { removeProjectFromTeam } from '@/app/teams/actions'

type Project = { id: string; name: string; team_id: string | null }

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: team } = await supabase.from('teams').select('id, name').eq('id', id).single()
  if (!team) redirect('/teams')

  // Proyectos del equipo
  const { data: teamProjects } = await supabase
    .from('projects')
    .select('id, name, team_id')
    .eq('team_id', id)
    .order('name')
  const inProjects = (teamProjects ?? []) as Project[]

  // Proyectos que el usuario posee y puede asignar (no están ya en este equipo)
  const { data: owned } = await supabase
    .from('projects')
    .select('id, name, team_id')
    .eq('owner_id', user.id)
  const available = ((owned ?? []) as Project[]).filter((p) => p.team_id !== id)

  return (
    <div className="flex h-full">
      <Sidebar email={user.email ?? ''} active="teams" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              <Link href="/teams" style={{ color: 'var(--text-3)' }}>
                Equipos
              </Link>{' '}
              / <b>{team.name}</b>
            </div>
            <h1 className="page-title">Equipo {team.name}</h1>
          </div>
          <AddProjectToTeam teamId={team.id} available={available} />
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_320px]">
            {/* Proyectos del equipo */}
            <div>
              <div className="section-label">Proyectos del equipo ({inProjects.length})</div>
              {inProjects.length === 0 ? (
                <div className="card text-center" style={{ padding: 'var(--space-8)' }}>
                  <p className="card-desc">
                    Aún no hay proyectos en este equipo. Asigná uno con el botón de arriba.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {inProjects.map((p) => (
                    <div key={p.id} className="card flex items-center gap-3">
                      <Link href={`/projects/${p.id}`} className="flex flex-1 items-center gap-3 task-open">
                        <span
                          className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                          style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                        <span className="card-title">{p.name}</span>
                      </Link>
                      <form action={removeProjectFromTeam}>
                        <input type="hidden" name="team_id" value={team.id} />
                        <input type="hidden" name="project_id" value={p.id} />
                        <button type="submit" className="btn-ghost" title="Quitar del equipo">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Miembros */}
            <div>
              <div className="section-label">Miembros</div>
              <TeamMembers teamId={team.id} currentUserId={user.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
