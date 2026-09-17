'use client'

import { useMemo, useState } from 'react'
import type { PortalTask } from './data'

/* ---------- Categorías ----------
   La etiqueta interna del equipo se traduce a lenguaje de cliente. "Inbound"
   o "UI/UX" no significan nada para quien contrata el servicio; "Contenido" y
   "Desarrollo" sí. La traducción vive acá para que cambiarla sea una línea. */
const CATEGORIAS: Record<string, { label: string; icon: string }> = {
  'On-page': { label: 'SEO On-page', icon: 'lupa' },
  Technical: { label: 'SEO Técnico', icon: 'tuerca' },
  Inbound: { label: 'Contenido', icon: 'doc' },
  'UI/UX': { label: 'Desarrollo', icon: 'code' },
  Reports: { label: 'Reportes', icon: 'chart' },
  Local: { label: 'SEO Local', icon: 'pin' },
  Proposals: { label: 'Propuestas', icon: 'doc' },
  Backlog: { label: 'Planificación', icon: 'chart' },
}

function categoria(tag: string | null) {
  if (!tag) return { label: 'General', icon: 'doc' }
  return CATEGORIAS[tag] ?? { label: tag, icon: 'doc' }
}

const ICONOS: Record<string, React.ReactNode> = {
  lupa: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  tuerca: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  code: <><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15v3" /><path d="M12 9v9" /><path d="M17 5v13" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`
}

/** La fecha que ubica la actividad en el tiempo: lo pendiente por su entrega
 *  prevista, lo terminado por el día en que se cerró. */
function fechaRef(t: PortalTask): string | null {
  return t.status === 'done' ? t.closed_on ?? t.due_date : t.due_date
}
const SIN_FECHA = 'sin-fecha'
function claveMes(t: PortalTask): string {
  const f = fechaRef(t)
  return f ? f.slice(0, 7) : SIN_FECHA
}
function nombreMes(clave: string): string {
  if (clave === SIN_FECHA) return 'Sin fecha definida'
  const [y, m] = clave.split('-')
  return `${MESES_LARGOS[Number(m) - 1]} ${y}`
}

type Filtro = 'curso' | 'hechas' | 'todas'
type Orden = 'entrega' | 'actividad' | 'categoria'

export default function Activities({ tasks }: { tasks: PortalTask[] }) {
  // Arranca en "En curso": lo que viene es lo que el cliente todavía no sabe.
  const [filtro, setFiltro] = useState<Filtro>('curso')
  const [mes, setMes] = useState<string>('todos')
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<Orden>('entrega')

  const enCurso = tasks.filter((t) => t.status !== 'done').length
  const hechas = tasks.length - enCurso

  // Por estado, antes del filtro de mes: define qué meses se pueden elegir.
  const porEstado = useMemo(() => {
    if (filtro === 'curso') return tasks.filter((t) => t.status !== 'done')
    if (filtro === 'hechas') return tasks.filter((t) => t.status === 'done')
    return tasks
  }, [tasks, filtro])

  const desc = filtro === 'hechas' // lo terminado se lee de lo más reciente hacia atrás

  const meses = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of porEstado) m.set(claveMes(t), (m.get(claveMes(t)) ?? 0) + 1)
    const claves = [...m.keys()].filter((k) => k !== SIN_FECHA).sort()
    if (desc) claves.reverse()
    if (m.has(SIN_FECHA)) claves.push(SIN_FECHA)
    return claves.map((k) => ({ clave: k, n: m.get(k)! }))
  }, [porEstado, desc])

  // Si el mes elegido ya no existe con el estado actual, vuelve a "todos".
  const mesActivo = meses.some((x) => x.clave === mes) ? mes : 'todos'

  const grupos = useMemo(() => {
    const term = q.trim().toLowerCase()
    let r = porEstado
    if (mesActivo !== 'todos') r = r.filter((t) => claveMes(t) === mesActivo)
    if (term) {
      r = r.filter(
        (t) =>
          t.title.toLowerCase().includes(term) ||
          categoria(t.tag).label.toLowerCase().includes(term)
      )
    }

    const mapa = new Map<string, PortalTask[]>()
    for (const t of r) {
      const k = claveMes(t)
      if (!mapa.has(k)) mapa.set(k, [])
      mapa.get(k)!.push(t)
    }

    const ordenarFilas = (a: PortalTask, b: PortalTask) => {
      if (orden === 'actividad') return a.title.localeCompare(b.title, 'es')
      if (orden === 'categoria')
        return categoria(a.tag).label.localeCompare(categoria(b.tag).label, 'es')
      const fa = fechaRef(a)
      const fb = fechaRef(b)
      if (!fa) return 1
      if (!fb) return -1
      return desc ? fb.localeCompare(fa) : fa.localeCompare(fb)
    }

    const claves = [...mapa.keys()].filter((k) => k !== SIN_FECHA).sort()
    if (desc) claves.reverse()
    if (mapa.has(SIN_FECHA)) claves.push(SIN_FECHA)

    return claves.map((k) => ({ clave: k, filas: mapa.get(k)!.sort(ordenarFilas) }))
  }, [porEstado, mesActivo, q, orden, desc])

  const totalVisible = grupos.reduce((n, g) => n + g.filas.length, 0)

  const TABS: { key: Filtro; label: string; n: number; dot?: string }[] = [
    { key: 'curso', label: 'En curso', n: enCurso, dot: 'var(--info-fg)' },
    { key: 'hechas', label: 'Completadas', n: hechas, dot: 'var(--brand-500)' },
    { key: 'todas', label: 'Todas', n: tasks.length },
  ]

  return (
    <section className="pt-card" style={{ overflow: 'hidden' }}>
      <div className="pt-tools">
        <div className="pt-tabs" role="tablist" aria-label="Filtrar actividades">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={filtro === t.key}
              className={`pt-tab ${filtro === t.key ? 'on' : ''}`}
              onClick={() => setFiltro(t.key)}
            >
              {t.dot && <span className="pt-dot" style={{ background: t.dot }} />}
              {t.label}
              <span className="pt-n">{t.n}</span>
            </button>
          ))}
        </div>

        <div className="pt-tools-right">
          <label className="pt-sort">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <select
              id="pt-mes"
              value={mesActivo}
              onChange={(ev) => setMes(ev.target.value)}
              aria-label="Filtrar por mes"
            >
              <option value="todos">Todos los meses</option>
              {meses.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {nombreMes(m.clave)} ({m.n})
                </option>
              ))}
            </select>
          </label>

          <label className="pt-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="pt-q" type="search" value={q}
              onChange={(ev) => setQ(ev.target.value)}
              placeholder="Buscar actividades…" aria-label="Buscar actividades"
            />
          </label>

          <label className="pt-sort">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 20V4m0 0L4 7m3-3 3 3" /><path d="M17 4v16m0 0 3-3m-3 3-3-3" />
            </svg>
            <select
              id="pt-sort" value={orden}
              onChange={(ev) => setOrden(ev.target.value as Orden)}
              aria-label="Ordenar por"
            >
              <option value="entrega">Fecha de entrega</option>
              <option value="actividad">Actividad</option>
              <option value="categoria">Categoría</option>
            </select>
          </label>
        </div>
      </div>

      <div className="pt-tablewrap">
        <table className="pt-table">
          <thead>
            <tr>
              <th style={{ width: 46 }}><span className="sr">Estado</span></th>
              <th>Actividad</th>
              <th style={{ width: 190 }}>Categoría</th>
              <th style={{ width: 140 }}>Estado</th>
              <th style={{ width: 160 }}>Fecha de entrega</th>
              <th style={{ width: 56 }}><span className="sr">Entregable</span></th>
            </tr>
          </thead>

          {grupos.map((g) => (
            <tbody key={g.clave}>
              <tr className="pt-group">
                <th colSpan={6} scope="colgroup">
                  <span>{nombreMes(g.clave)}</span>
                  <span className="pt-n">{g.filas.length}</span>
                </th>
              </tr>
              {g.filas.map((t) => {
                const listo = t.status === 'done'
                const cat = categoria(t.tag)
                return (
                  <tr key={t.id}>
                    <td>
                      <span className={`pt-mark ${listo ? 'done' : ''}`}>
                        {listo && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                    </td>
                    <td className="pt-td-title">{t.title}</td>
                    <td>
                      <span className="pt-cat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          {ICONOS[cat.icon]}
                        </svg>
                        {cat.label}
                      </span>
                    </td>
                    <td>
                      <span className={`pt-state ${listo ? 'done' : 'run'}`}>
                        <span className="pt-dot" />
                        {listo ? 'Completada' : 'En curso'}
                      </span>
                    </td>
                    <td className="pt-td-date">{fecha(fechaRef(t))}</td>
                    <td>
                      {t.drive_url && (
                        <a
                          className="pt-doc" href={t.drive_url}
                          target="_blank" rel="noreferrer noopener"
                          title="Ver el entregable"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                          </svg>
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>

        {totalVisible === 0 && (
          <div className="pt-empty">
            <b>
              {q
                ? 'Sin resultados'
                : filtro === 'curso'
                  ? 'No hay actividades en curso'
                  : 'Nada por acá todavía'}
            </b>
            <span>
              {q
                ? `No encontramos actividades que coincidan con “${q}”.`
                : filtro === 'curso'
                  ? 'Todo lo planificado hasta ahora está terminado. Mirá la pestaña "Completadas" para ver el trabajo entregado.'
                  : 'Cuando haya actividades en este estado, van a aparecer en la lista.'}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
