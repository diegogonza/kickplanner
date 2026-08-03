import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import { PRIORITIES } from '@/app/projects/statuses'
import { toggleCompleteMine } from './actions'

type MyTask = {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done'
  priority: 'media' | 'alta' | 'urgente' | null
  due_date: string | null
  project_id: string
  projects: { name: string } | { name: string }[] | null
}

function projectName(t: MyTask): string {
  const p = t.projects
  if (!p) return 'Proyecto'
  return Array.isArray(p) ? (p[0]?.name ?? 'Proyecto') : p.name
}

// Fecha local a medianoche (para comparar solo por día)
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseDue(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDue(s: string): string {
  return parseDue(s).toLocaleDateString('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type BucketKey = 'vencidas' | 'semana' | 'proximas' | 'sinfecha' | 'completadas'

const BUCKETS: { key: BucketKey; label: string; color: string }[] = [
  { key: 'vencidas', label: 'Vencidas', color: 'var(--urgent-fg)' },
  { key: 'semana', label: 'Esta semana', color: 'var(--mod-fg)' },
  { key: 'proximas', label: 'Próximas', color: 'var(--info-fg)' },
  { key: 'sinfecha', label: 'Sin fecha', color: 'var(--text-3)' },
  { key: 'completadas', label: 'Completadas', color: 'var(--low-fg)' },
]

export default async function MyTasksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_date, project_id, projects(name)')
    .eq('assignee_id', user.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  const tasks = (data ?? []) as unknown as MyTask[]

  // Límite de "esta semana": hasta el domingo (semana lunes–domingo)
  const today = atMidnight(new Date())
  const dow = (today.getDay() + 6) % 7 // 0 = lunes
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (6 - dow))

  const groups: Record<BucketKey, MyTask[]> = {
    vencidas: [],
    semana: [],
    proximas: [],
    sinfecha: [],
    completadas: [],
  }

  for (const t of tasks) {
    if (t.status === 'done') {
      groups.completadas.push(t)
      continue
    }
    if (!t.due_date) {
      groups.sinfecha.push(t)
      continue
    }
    const due = parseDue(t.due_date)
    if (due < today) groups.vencidas.push(t)
    else if (due <= endOfWeek) groups.semana.push(t)
    else groups.proximas.push(t)
  }

  const pendingCount = tasks.filter((t) => t.status !== 'done').length

  return (
    <div className="flex h-screen">
      <Sidebar email={user.email ?? ''} active="mis-tareas" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Mis tareas
              <span className="count-badge">{pendingCount}</span>
            </h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            {tasks.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">No tenés tareas asignadas</p>
                <p className="card-desc">
                  Cuando alguien te asigne una tarea, aparecerá aquí ordenada por fecha de entrega.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {BUCKETS.map(({ key, label, color }) => {
                  const items = groups[key]
                  if (items.length === 0) return null
                  return (
                    <section key={key}>
                      <div className="section-head">
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: color,
                            display: 'inline-block',
                          }}
                        />
                        {label}
                        <span className="count">{items.length}</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {items.map((t) => {
                          const done = t.status === 'done'
                          const prio = PRIORITIES.find((p) => p.key === t.priority)
                          return (
                            <div
                              key={t.id}
                              className="card flex items-center gap-3"
                              style={{ padding: '10px 14px' }}
                            >
                              <form action={toggleCompleteMine}>
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="status" value={t.status} />
                                <button
                                  type="submit"
                                  className={`task-check ${done ? 'done' : ''}`}
                                  title={done ? 'Reabrir' : 'Marcar como hecha'}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                </button>
                              </form>

                              <Link
                                href={`/projects/${t.project_id}?task=${t.id}`}
                                className="min-w-0 flex-1"
                                style={{ textDecoration: 'none' }}
                              >
                                <div
                                  className="truncate"
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: 'var(--text)',
                                    textDecoration: done ? 'line-through' : 'none',
                                    opacity: done ? 0.6 : 1,
                                  }}
                                >
                                  {t.title}
                                </div>
                                <div className="breadcrumb truncate">{projectName(t)}</div>
                              </Link>

                              {prio && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: prio.color,
                                    background: 'var(--panel)',
                                    borderRadius: 999,
                                    padding: '2px 9px',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {prio.label}
                                </span>
                              )}

                              {t.due_date && (
                                <span
                                  style={{
                                    fontSize: 12.5,
                                    fontWeight: 500,
                                    color: key === 'vencidas' ? 'var(--urgent-fg)' : 'var(--text-3)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {fmtDue(t.due_date)}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
