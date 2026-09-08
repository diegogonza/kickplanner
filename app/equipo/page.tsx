import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import TeamWeek, { type TeamTask } from '@/app/components/views/team-week'
import { todayISO, type Member } from '@/app/projects/statuses'

const COLS =
  'id, title, status, priority, due_date, parent_id, description, assignee_id, drive_url, created_at, project_id, projects(name, color_hue)'

type ProjRel = { name: string; color_hue: number | null } | { name: string; color_hue: number | null }[] | null

function proj(row: { projects: ProjRel }): { name: string; hue: number | null } {
  const p = row.projects
  if (!p) return { name: 'Proyecto', hue: null }
  const one = Array.isArray(p) ? p[0] : p
  return { name: one?.name ?? 'Proyecto', hue: one?.color_hue ?? null }
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// 'YYYY-MM-DD' -> Date a medianoche, sin que la zona del proceso la corra un día
function deISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Lunes de la semana que contiene a `d`
function lunesDe(d: Date): Date {
  const dow = (d.getDay() + 6) % 7
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -dow)
}

function etiquetaSemana(inicio: Date, fin: Date): string {
  const mismoMes = inicio.getMonth() === fin.getMonth()
  const a = inicio.toLocaleDateString('es', mismoMes ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const b = fin.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${a} – ${b}`
}

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>
}) {
  const { semana } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // "Hoy" sale de todayISO(), que fija la zona de la operación. Antes era
  // `new Date()` a secas: el proceso de Vercel corre en UTC, así que los
  // domingos después de las 19:00 la página abría en la semana siguiente.
  const hoyISO = todayISO()
  const valida = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana)
  const base = valida ? deISO(semana) : deISO(hoyISO)
  const inicio = lunesDe(isNaN(base.getTime()) ? deISO(hoyISO) : base)
  const fin = addDays(inicio, 6)
  const hoyLunes = lunesDe(deISO(hoyISO))

  // La semana viaja en la URL para que el enlace sea compartible y para que los
  // datos se traigan ya acotados: solo los 7 días visibles, no la tabla entera.
  const [{ data: memberRows }, { data: taskRows }] = await Promise.all([
    supabase.rpc('workspace_members'),
    supabase.from('tasks').select(COLS).gte('due_date', iso(inicio)).lte('due_date', iso(fin)),
  ])

  // workspace_members no trae `role`; el tipo Member lo pide, así que se rellena.
  const members: Member[] = ((memberRows ?? []) as Omit<Member, 'role'>[]).map((m) => ({ ...m, role: 'member' }))

  const rows = (taskRows ?? []) as unknown as (TeamTask & { projects: ProjRel })[]
  const tasks: TeamTask[] = rows.map((r) => {
    const p = proj(r)
    return { ...r, project_name: p.name, project_hue: p.hue }
  })

  // Quién puede recibir cada tarea. Solo hacen falta los proyectos que aparecen
  // esta semana —no se puede arrastrar una tarea que no está en pantalla—, así
  // que la consulta va acotada: traer la tabla entera crecía con el espacio de
  // trabajo y, pasadas las 1000 filas del tope de PostgREST, habría empezado a
  // rechazar drops válidos sin que se note.
  const projectIds = [...new Set(tasks.map((t) => t.project_id))]
  const membersByProject: Record<string, string[]> = {}
  if (projectIds.length > 0) {
    const { data: pmRows } = await supabase
      .from('project_members')
      .select('project_id, user_id')
      .in('project_id', projectIds)
    for (const r of (pmRows ?? []) as { project_id: string; user_id: string }[]) {
      ;(membersByProject[r.project_id] ??= []).push(r.user_id)
    }
  }

  const pendientes = tasks.filter((t) => t.status !== 'done').length
  const enEstaSemana = inicio.getTime() === hoyLunes.getTime()

  return (
    <div className="flex h-full">
      <Sidebar active="equipo" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Semana del equipo
              <span className="count-badge">{pendientes}</span>
            </h1>
          </div>

          <div className="cal-nav">
            <span className="tw-rango">{etiquetaSemana(inicio, fin)}</span>
            {!enEstaSemana && (
              <Link className="btn btn-outline" href="/equipo">
                Esta semana
              </Link>
            )}
            <Link
              className="move-btn"
              href={`/equipo?semana=${iso(addDays(inicio, -7))}`}
              title="Semana anterior"
              aria-label="Semana anterior"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Link>
            <Link
              className="move-btn"
              href={`/equipo?semana=${iso(addDays(inicio, 7))}`}
              title="Semana siguiente"
              aria-label="Semana siguiente"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6 pb-6">
          <TeamWeek
            members={members}
            tasks={tasks}
            weekStart={iso(inicio)}
            hoyISO={hoyISO}
            currentUserId={user.id}
            membersByProject={membersByProject}
          />
        </div>
      </div>
    </div>
  )
}
