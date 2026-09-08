'use client'

import { Fragment, useMemo, useOptimistic, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { displayName, isOverdue, parseDue, type Member, type Task } from '@/app/projects/statuses'
import { setAssignee, updateDueDate } from '@/app/projects/actions'
import Avatar from '@/app/components/avatar'
import { useTaskContextMenu } from '@/app/components/task-context-menu'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SIN_RESPONSABLE = '__sin__'

export type TeamTask = Task & {
  project_id: string
  project_name: string
  project_hue: number | null
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

// Tono de respaldo si un proyecto no tuviera color_hue asignado
function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

/**
 * Semana del equipo: una fila por persona, una columna por día.
 *
 * La grilla es una sola `grid` (no una tabla ni columnas independientes) para
 * que la cabecera y todas las filas compartan el mismo reparto de ancho aunque
 * se oculten los fines de semana.
 *
 * Arrastrar una tarea la mueve de día y, si cae en la fila de otra persona,
 * también se la reasigna. Solo se permite soltar en gente que sea miembro del
 * proyecto de esa tarea: asignarla a alguien de afuera la volvería invisible
 * para esa persona (RLS) y quedaría en el limbo.
 */
export default function TeamWeek({
  members,
  tasks,
  weekStart,
  hoyISO,
  currentUserId,
  membersByProject,
}: {
  members: Member[]
  tasks: TeamTask[]
  /** Lunes de la semana visible, en YYYY-MM-DD */
  weekStart: string
  /** Hoy en la zona de la operación, calculado en el servidor. No se usa
      `new Date()` acá: el servidor elige la semana y el cliente resaltaba el
      día, y las dos fechas podían no ser la misma. */
  hoyISO: string
  currentUserId: string
  /** project_id -> user_ids que pueden recibir tareas de ese proyecto */
  membersByProject: Record<string, string[]>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { onContextMenu, menu } = useTaskContextMenu()

  const [hideWeekends, setHideWeekends] = useState(true)
  const [hideDone, setHideDone] = useState(false)
  const [proyecto, setProyecto] = useState('')
  const [persona, setPersona] = useState('')
  const [drag, setDrag] = useState<{ id: string; pid: string } | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [optimisticTasks, mover] = useOptimistic(
    tasks,
    (state: TeamTask[], p: { id: string; due: string; assignee: string | null }) =>
      state.map((t) => (t.id === p.id ? { ...t, due_date: p.due, assignee_id: p.assignee } : t))
  )

  const lunes = parseDue(weekStart)
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(lunes, i)), [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lista de proyectos presentes en la semana, para el filtro
  const proyectos = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tasks) m.set(t.project_id, t.project_name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [tasks])

  const visibles = optimisticTasks.filter(
    (t) => (!hideDone || t.status !== 'done') && (!proyecto || t.project_id === proyecto)
  )

  // Índice responsable+día -> tareas
  const porCelda = new Map<string, TeamTask[]>()
  for (const t of visibles) {
    if (!t.due_date) continue
    const k = `${t.assignee_id ?? SIN_RESPONSABLE}|${t.due_date}`
    const arr = porCelda.get(k)
    if (arr) arr.push(t)
    else porCelda.set(k, [t])
  }

  // El fin de semana solo aparece si hay algo agendado (o si se pide verlo)
  const findeConTareas = (i: number) => {
    const iso = isoDate(dias[i])
    return visibles.some((t) => t.due_date === iso)
  }
  const indices = [0, 1, 2, 3, 4, ...(!hideWeekends || findeConTareas(5) ? [5] : []), ...(!hideWeekends || findeConTareas(6) ? [6] : [])]
  const cols = `var(--tw-persona) repeat(${indices.length}, minmax(0, 1fr))`

  // Filas: primero vos, después el resto; "Sin responsable" al final y solo si aplica
  const orden = [
    ...members.filter((m) => m.user_id === currentUserId),
    ...members.filter((m) => m.user_id !== currentUserId),
  ]
  const sueltas = visibles.filter((t) => !t.assignee_id && t.due_date)
  const todasLasFilas: { id: string; miembro: Member | null }[] = [
    ...orden.map((m) => ({ id: m.user_id, miembro: m })),
    ...(sueltas.length > 0 ? [{ id: SIN_RESPONSABLE, miembro: null }] : []),
  ]
  // Filtrar por persona deja una sola fila: la semana de esa persona, con las
  // mismas columnas. No se filtran las tareas, se filtran las filas.
  const filas = persona ? todasLasFilas.filter((f) => f.id === persona) : todasLasFilas

  const totalDe = (uid: string) =>
    visibles.filter((t) => (t.assignee_id ?? SIN_RESPONSABLE) === uid && t.due_date).length

  // ¿Esta persona puede recibir la tarea que se está arrastrando?
  const aceptaDrop = (uid: string) => {
    if (!drag) return false
    if (uid === SIN_RESPONSABLE) return true
    return (membersByProject[drag.pid] ?? []).includes(uid)
  }

  const soltar = (uid: string, dia: Date) => {
    const arrastrada = drag
    setOverKey(null)
    setDrag(null)
    if (!arrastrada || !aceptaDrop(uid)) return

    const due = isoDate(dia)
    // Contra el estado optimista, no contra los props: entre el primer arrastre
    // y la revalidación, `tasks` todavía tiene el valor viejo. Comparar ahí
    // hacía que devolver una tarea a su día original se descartara como "sin
    // cambios" y quedara pintada donde no estaba.
    const actual = optimisticTasks.find((t) => t.id === arrastrada.id)
    if (!actual) return
    const nuevoResp = uid === SIN_RESPONSABLE ? null : uid
    const cambiaFecha = actual.due_date !== due
    const cambiaResp = (actual.assignee_id ?? null) !== nuevoResp
    if (!cambiaFecha && !cambiaResp) return

    startTransition(async () => {
      mover({ id: arrastrada.id, due, assignee: nuevoResp })
      try {
        if (cambiaFecha) {
          const fd = new FormData()
          fd.set('id', arrastrada.id)
          fd.set('project_id', arrastrada.pid)
          fd.set('due_date', due)
          await updateDueDate(fd)
        }
        if (cambiaResp) {
          const fd = new FormData()
          fd.set('id', arrastrada.id)
          fd.set('project_id', arrastrada.pid)
          fd.set('assignee_id', nuevoResp ?? '')
          await setAssignee(fd)
        }
      } catch {
        // El servidor rechazó el movimiento (por ejemplo, la persona dejó de ser
        // miembro entre que se cargó la página y se soltó la tarea). Se avisa y
        // se refresca: el estado optimista se cae solo con los datos reales.
        setError('No se pudo mover la tarea. Se restauró como estaba.')
        router.refresh()
      }
    })
  }

  // Agrupa las tareas de una celda por proyecto, conservando el orden en que
  // aparecen. Es la misma lectura que la semana de "Mis tareas": primero de qué
  // cliente es el trabajo, después qué hay que hacer.
  const agrupar = (items: TeamTask[]): [string, TeamTask[]][] => {
    const g = new Map<string, TeamTask[]>()
    for (const t of items) {
      const arr = g.get(t.project_id)
      if (arr) arr.push(t)
      else g.set(t.project_id, [t])
    }
    return [...g.entries()]
  }

  const abrir = (t: TeamTask) => router.push(`/projects/${t.project_id}?view=lista&task=${t.id}`)

  const finDeSemana = (i: number) => i >= 5
  const esHoy = (d: Date) => isoDate(d) === hoyISO

  return (
    <div className="tw">
      <div className="tw-tools">
        <select
          className="tw-filtro"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          aria-label="Filtrar por miembro del equipo"
        >
          <option value="">Todo el equipo</option>
          {orden.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.user_id === currentUserId ? `${displayName(m)} (vos)` : displayName(m)}
            </option>
          ))}
          {sueltas.length > 0 && <option value={SIN_RESPONSABLE}>Sin responsable</option>}
        </select>

        <select
          className="tw-filtro"
          value={proyecto}
          onChange={(e) => setProyecto(e.target.value)}
          aria-label="Filtrar por proyecto"
        >
          <option value="">Todos los proyectos</option>
          {proyectos.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`btn-outline cal-toggle ${hideDone ? 'active' : ''}`}
          onClick={() => setHideDone((v) => !v)}
          aria-pressed={hideDone}
        >
          Ocultar completadas
        </button>

        <button
          type="button"
          className={`btn-outline cal-toggle ${!hideWeekends ? 'active' : ''}`}
          onClick={() => setHideWeekends((v) => !v)}
          aria-pressed={!hideWeekends}
        >
          Fines de semana
        </button>

        <span className="tw-hint">Arrastrá una tarea para cambiarle el día o pasársela a otra persona</span>
      </div>

      {error && (
        <p className="side-error" role="alert">
          {error}
        </p>
      )}

      <div className="tw-scroll">
        <div className="tw-grid" style={{ gridTemplateColumns: cols }}>
          {/* Cabecera */}
          <div className="tw-corner">Equipo</div>
          {indices.map((i) => (
            <div
              key={`h${i}`}
              className={`tw-dia ${finDeSemana(i) ? 'finde' : ''} ${esHoy(dias[i]) ? 'hoy' : ''}`}
            >
              <span className="tw-dia-n">{WEEKDAYS[i]}</span>
              <span className="tw-dia-d">{dias[i].getDate()}</span>
            </div>
          ))}

          {/* Una fila por persona */}
          {filas.map((fila) => {
            const total = totalDe(fila.id)
            const puede = drag ? aceptaDrop(fila.id) : true
            return (
              <Fragment key={fila.id}>
                <div className={`tw-persona ${drag && !puede ? 'bloqueada' : ''}`}>
                  {fila.miembro ? (
                    <>
                      <Avatar
                        name={fila.miembro.full_name}
                        email={fila.miembro.email}
                        url={fila.miembro.avatar_url}
                        size={28}
                      />
                      <span className="tw-persona-n" title={displayName(fila.miembro)}>
                        {fila.miembro.user_id === currentUserId ? 'Vos' : displayName(fila.miembro)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="tw-sin-ava">?</span>
                      <span className="tw-persona-n">Sin responsable</span>
                    </>
                  )}
                  {total > 0 && <span className="tw-persona-c">{total}</span>}
                </div>

                {indices.map((i) => {
                  const dia = dias[i]
                  const iso = isoDate(dia)
                  const key = `${fila.id}|${iso}`
                  const items = porCelda.get(key) ?? []
                  return (
                    <div
                      key={key}
                      className={`tw-celda ${finDeSemana(i) ? 'finde' : ''} ${esHoy(dia) ? 'hoy' : ''} ${
                        overKey === key ? (puede ? 'dragover' : 'nodrop') : ''
                      }`}
                      onDragOver={(e) => {
                        if (!puede) return
                        e.preventDefault()
                        if (overKey !== key) setOverKey(key)
                      }}
                      onDragEnter={() => {
                        if (!puede) setOverKey(key)
                      }}
                      onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                      onDrop={() => soltar(fila.id, dia)}
                    >
                      {agrupar(items).map(([pid, list]) => {
                        const hue = list[0].project_hue ?? hashHue(list[0].project_name)
                        return (
                          <div
                            key={pid}
                            className="cal-group"
                            style={{ background: `hsl(${hue} 72% 95%)` }}
                          >
                            <div className="cal-group-head">
                              <span className="cal-group-dot" style={{ background: `hsl(${hue} 58% 52%)` }} />
                              <span className="cal-group-name" title={list[0].project_name}>
                                {list[0].project_name}
                              </span>
                              <span className="cal-group-count">{list.length}</span>
                            </div>
                            {list.map((t) => {
                              const hecha = t.status === 'done'
                              return (
                                <div
                                  key={t.id}
                                  className={`tw-chip ${hecha ? 'hecha' : ''} ${
                                    isOverdue(t.due_date, hecha) ? 'vencida' : ''
                                  } ${drag?.id === t.id ? 'arrastrando' : ''}`}
                                  title={`${t.title} · ${t.project_name}`}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      abrir(t)
                                    }
                                  }}
                                  draggable
                                  onDragStart={(e) => {
                                    setError(null)
                                    setDrag({ id: t.id, pid: t.project_id })
                                    e.dataTransfer.effectAllowed = 'move'
                                    e.dataTransfer.setData('text/plain', t.id)
                                  }}
                                  onDragEnd={() => {
                                    setDrag(null)
                                    setOverKey(null)
                                  }}
                                  onContextMenu={(e) => onContextMenu(e, { id: t.id, projectId: t.project_id })}
                                  onClick={() => abrir(t)}
                                >
                                  <span className="tw-chip-t">{t.title}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>

      {filas.every((f) => totalDe(f.id) === 0) && (
        <div className="tw-vacio">
          <p>{persona ? 'Sin tareas con fecha esta semana' : 'Nadie tiene tareas con fecha esta semana'}</p>
          <span>Probá con otra semana, o quitá el filtro de proyecto</span>
        </div>
      )}

      {menu}
    </div>
  )
}
