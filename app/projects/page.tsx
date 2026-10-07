import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import { getSessionProfile } from '@/app/lib/session'
import ProjectsView, { type ProjectOverview } from '@/app/components/projects-view'
import { dateInTZ, type StatusChange } from '@/app/projects/statuses'
import NewProjectTrigger from '@/app/components/new-project-trigger'
import TabLink from '@/app/components/tab-link'
import PanelDashboard from '@/app/components/panel-dashboard'
import HitosOverview from '@/app/components/hitos-overview'

// Vistas de /projects. "proyectos" es la tabla de siempre (vista por defecto);
// "panel" es el tablero de indicadores que antes era la portada (/).
const VIEWS = [
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'panel', label: 'Panel' },
  { key: 'hitos', label: 'Hitos' },
] as const
type ViewKey = (typeof VIEWS)[number]['key']

const VIEW_ICONS: Record<ViewKey, React.ReactNode> = {
  proyectos: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  panel: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" rx="1" />
      <rect x="12" y="8" width="3" height="10" rx="1" />
      <rect x="17" y="5" width="3" height="13" rx="1" />
    </>
  ),
  hitos: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
}

function ViewTabs({ active }: { active: ViewKey }) {
  return (
    <div className="tabs">
      {VIEWS.map((v) => (
        <TabLink key={v.key} href={v.key === 'proyectos' ? '/projects' : `/projects?view=${v.key}`} active={active === v.key}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {VIEW_ICONS[v.key]}
          </svg>
          {v.label}
        </TabLink>
      ))}
    </div>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; view?: string }>
}) {
  const { client: clientFilter, view } = await searchParams
  const { user, isAdmin } = await getSessionProfile()
  if (!user) redirect('/login')

  // Vistas Panel e Hitos: no necesitan la carga de la tabla (cobros,
  // historial, etc.); cada una hace sus propias consultas.
  if (view === 'panel' || view === 'hitos') {
    return (
      <div className="flex h-full">
        <Sidebar active="projects" />

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="topbar" style={{ borderBottom: 'none' }}>
            <div>
              <div className="breadcrumb">Espacio de trabajo</div>
              <h1 className="page-title">Proyectos</h1>
            </div>
          </header>
          <ViewTabs active={view} />

          <div className="viewscroll flex-1 overflow-y-auto px-6">
            <div className="w-full">
              {view === 'panel' ? <PanelDashboard /> : <HitosOverview />}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const supabase = await createClient()

  // Para admin, primero se materializan los cobros que ya tocaron (lo mismo que
  // hace /pagos al abrirse): así el atraso no depende de que alguien haya
  // entrado a Pagos este mes. Es idempotente y para no-admin no hace nada.
  if (isAdmin) {
    const { error } = await supabase.rpc('generate_client_payments')
    if (error) console.error('projects/page generate_client_payments:', error.message)
  }

  // Las consultas son independientes: en serie la espera era la suma de los
  // viajes a us-east-2, y así es la del más lento.
  const [projectsRes, clientsRes, templatesRes, membersRes, historyRes, overdueRes] = await Promise.all([
    supabase.rpc('projects_overview'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('templates').select('id, name, type').order('name'),
    supabase.rpc('workspace_members'),
    // Historial de estados (RLS: solo de los proyectos de los que se es
    // miembro) para que la antigüedad no cuente las pausas.
    supabase.from('project_status_updates').select('project_id, status, created_at').order('created_at'),
    // Atraso y último mes pagado: solo admin (la función tampoco devuelve nada a otros).
    isAdmin ? supabase.rpc('payments_summary_by_project') : Promise.resolve({ data: [], error: null }),
  ])

  type PagoResumen = {
    project_id: string
    overdue_count: number
    overdue_amount: number | null
    overdue_since: string | null
    paid_through: string | null
  }
  const pagos = new Map(((overdueRes.data ?? []) as PagoResumen[]).map((o) => [o.project_id, o]))
  const historial = new Map<string, StatusChange[]>()
  for (const h of (historyRes.data ?? []) as { project_id: string; status: string; created_at: string }[]) {
    const lista = historial.get(h.project_id) ?? []
    lista.push({ date: dateInTZ(h.created_at), status: h.status })
    historial.set(h.project_id, lista)
  }
  const projects = ((projectsRes.data ?? []) as ProjectOverview[]).map((p) => {
    const r = pagos.get(p.id)
    return {
      ...p,
      status_history: historial.get(p.id) ?? [],
      pay_overdue:
        r && r.overdue_count > 0 && r.overdue_since
          ? { count: r.overdue_count, amount: Number(r.overdue_amount), since: r.overdue_since }
          : null,
      pay_paid_through: r?.paid_through ?? null,
    }
  })
  const clients = (clientsRes.data ?? []) as { id: string; name: string }[]
  const templates = (templatesRes.data ?? []) as { id: string; name: string; type: string }[]
  const members = (membersRes.data ?? []) as {
    user_id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  }[]

  // Si alguna consulta falló, la lista vacía es indistinguible de "no hay nada".
  // Se avisa para no dejar a la persona mirando un "aún no tienes proyectos" falso.
  const loadError = !!(projectsRes.error || clientsRes.error || templatesRes.error || membersRes.error || historyRes.error || overdueRes.error)
  if (loadError) {
    console.error('projects/page:', {
      projects: projectsRes.error?.message,
      clients: clientsRes.error?.message,
      templates: templatesRes.error?.message,
      members: membersRes.error?.message,
      history: historyRes.error?.message,
      overdue: overdueRes.error?.message,
    })
  }

  // El filtro por cliente llega por URL (desde la ficha del cliente) pero se
  // aplica en la vista, en el mismo selector que el resto de filtros: antes
  // vivían en carriles separados y "Limpiar" no podía con el de la URL.
  const initialClient = clientFilter && clients.some((c) => c.id === clientFilter) ? clientFilter : ''

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
        <ViewTabs active="proyectos" />

        <div className="viewscroll flex-1 overflow-y-auto overflow-x-auto px-6">
          <div className="w-full">
            {loadError && (
              <div className="filter-bar" role="alert">
                <span>No se pudieron cargar todos los datos. Si falta algo, recarga la página.</span>
              </div>
            )}
            {/* key: si se navega a otro ?client= (o a /projects sin filtro)
                la ruta es la misma y React conservaría el estado viejo; con la
                key la vista se vuelve a montar con el filtro de la URL. */}
            <ProjectsView
              key={initialClient || 'all'}
              projects={projects}
              clients={clients}
              templates={templates}
              members={members}
              isAdmin={isAdmin}
              initialClient={initialClient}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
