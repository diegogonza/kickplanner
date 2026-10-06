import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/app/lib/session'
import Sidebar from '@/app/components/sidebar'
import PanelBanner, { type BannerStat } from '@/app/components/panel-banner'
import HomeMyTasks, { type HomeTask } from '@/app/components/home-my-tasks'
import HomeMyProjects, { type HomeProject } from '@/app/components/home-my-projects'
import { todayISO, TZ } from '@/app/projects/statuses'

// "Martes, 6 de octubre" en la zona de la operación
const FMT_FECHA = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
function fechaHoy(): string {
  const f = FMT_FECHA.format(new Date())
  return f.charAt(0).toUpperCase() + f.slice(1)
}

type ProjRel = { name: string; color_hue: number | null } | { name: string; color_hue: number | null }[] | null

// Portada del espacio de trabajo: saludo + "Mis tareas" (hoy / con retraso) +
// proyectos de los que el usuario es responsable. El panel de indicadores
// vive en /projects?view=panel.
export default async function HomePage() {
  const { user, fullName, avatarUrl } = await getSessionProfile()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const today = todayISO()
  // Fin de la ventana "próximos 7 días" (YYYY-MM-DD), contando desde mañana.
  const [y, m, d] = today.split('-').map(Number)
  const in7 = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)

  const [tasksRes, projectsRes, weekRes] = await Promise.all([
    // Pendientes del usuario con fecha hasta hoy: las de hoy y las atrasadas.
    // Las finalizadas no se muestran.
    supabase
      .from('tasks')
      .select('id, title, status, due_date, project_id, projects(name, color_hue)')
      .eq('assignee_id', user.id)
      .neq('status', 'done')
      .lte('due_date', today)
      .order('due_date', { ascending: true }),
    supabase
      .from('projects')
      .select('id, name, type, color_hue, status')
      .eq('manager_id', user.id)
      .order('name'),
    // Solo el conteo: pendientes que vencen entre mañana y dentro de 7 días.
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', user.id)
      .neq('status', 'done')
      .gt('due_date', today)
      .lte('due_date', in7),
  ])
  if (tasksRes.error) console.error('home tasks:', tasksRes.error.message)
  if (projectsRes.error) console.error('home projects:', projectsRes.error.message)

  const tasks: HomeTask[] = ((tasksRes.data ?? []) as unknown as (Omit<HomeTask, 'project_name' | 'project_hue'> & { projects: ProjRel })[]).map(
    ({ projects, ...t }) => {
      const p = Array.isArray(projects) ? projects[0] : projects
      return { ...t, project_name: p?.name ?? 'Proyecto', project_hue: p?.color_hue ?? null }
    }
  )
  const todayTasks = tasks.filter((t) => t.due_date === today)
  // Las más recientes primero: lo que se atrasó ayer importa más que lo de hace un mes.
  const overdueTasks = tasks.filter((t) => t.due_date !== today).reverse()
  const projects = (projectsRes.data ?? []) as (HomeProject & { status: string })[]
  const atRisk = projects.filter((p) => p.status === 'at_risk').length

  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)
  const stats: BannerStat[] = [
    { value: todayTasks.length, label: plural(todayTasks.length, 'tarea para hoy', 'tareas para hoy') },
    { value: overdueTasks.length, label: plural(overdueTasks.length, 'tarea atrasada', 'tareas atrasadas'), tone: 'alert' },
    { value: weekRes.count ?? 0, label: 'en los próximos 7 días', href: '/mis-tareas' },
    { value: atRisk, label: plural(atRisk, 'proyecto en riesgo', 'proyectos en riesgo'), tone: 'alert', href: '/projects' },
  ]

  return (
    <div className="flex h-full">
      <Sidebar active="inicio" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">{fechaHoy()}</h1>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <PanelBanner stats={stats} />

          <div className="hm-grid">
            <HomeMyTasks
              today={todayTasks}
              overdue={overdueTasks}
              user={{ name: fullName, email: user.email ?? '', avatarUrl }}
            />
            <HomeMyProjects projects={projects} />
          </div>
        </div>
      </div>
    </div>
  )
}
