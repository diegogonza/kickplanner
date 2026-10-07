import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import {
  calcularHitos,
  formatoClics,
  mesCorto,
  nombreHito,
  TOTAL_NIVELES,
  type EstadoHitos,
  type MesClics,
} from '@/app/lib/hitos'

type Fila = { id: string; name: string; client: string | null; hitos: EstadoHitos | null }

/**
 * Vista general de hitos (Proyectos → Hitos): todos los proyectos SEO visibles
 * para la persona, con su nivel y el avance hacia la próxima meta.
 * Componente de servidor: hace sus propias consultas.
 */
export default async function HitosOverview() {
  const supabase = await createClient()

  const { data: projs, error } = await supabase
    .from('projects')
    .select('id, name, clients(name)')
    .eq('type', 'seo')
    .order('name')
  if (error) console.error('hitos-overview projects:', error.message)

  const proyectos = (projs ?? []) as unknown as {
    id: string
    name: string
    clients: { name: string } | { name: string }[] | null
  }[]
  const ids = proyectos.map((p) => p.id)

  const porProyecto = new Map<string, MesClics[]>()
  if (ids.length) {
    const { data: meses, error: e2 } = await supabase
      .from('gsc_monthly')
      .select('project_id, month, clicks, partial')
      .in('project_id', ids)
    if (e2) console.error('hitos-overview gsc_monthly:', e2.message)
    for (const m of (meses ?? []) as { project_id: string; month: string; clicks: number; partial: boolean }[]) {
      const lista = porProyecto.get(m.project_id) ?? []
      lista.push({ mes: m.month, clics: m.clicks, parcial: m.partial })
      porProyecto.set(m.project_id, lista)
    }
  }

  const filas: Fila[] = proyectos.map((p) => {
    const cli = Array.isArray(p.clients) ? p.clients[0] : p.clients
    const meses = porProyecto.get(p.id)
    const hitos = meses && meses.length ? calcularHitos(meses) : null
    return { id: p.id, name: p.name, client: cli?.name ?? null, hitos: hitos?.conDatos ? hitos : null }
  })
  // Más avanzados arriba; a igual nivel, el que está más cerca de su meta.
  filas.sort((a, b) => {
    if (!a.hitos || !b.hitos) return a.hitos ? -1 : b.hitos ? 1 : a.name.localeCompare(b.name)
    return b.hitos.nivel - a.hitos.nivel || b.hitos.progreso - a.hitos.progreso
  })

  const conDatos = filas.filter((f) => f.hitos)
  const logradosMes = (() => {
    // Hitos logrados en el último mes completo de cada proyecto.
    let n = 0
    for (const f of conDatos) {
      const ult = f.hitos!.ultimoMes?.mes
      n += f.hitos!.logrados.filter((l) => l.mes === ult).length
    }
    return n
  })()

  return (
    <div className="adm-wrap" style={{ maxWidth: 'none' }}>
      <div className="adm-section-head">
        <h2 className="adm-section-title">Hitos de clics orgánicos</h2>
        <p className="adm-section-desc">
          {conDatos.length} proyectos SEO con datos de Search Console · {logradosMes}{' '}
          {logradosMes === 1 ? 'hito logrado' : 'hitos logrados'} en el último mes completo. Un hito se logra cuando un
          mes completo alcanza la cifra; la meta es siempre el nivel siguiente.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
          <p className="card-title mb-1">No hay proyectos SEO</p>
          <p className="card-desc">Cuando un proyecto SEO tenga Search Console vinculado, sus hitos aparecerán aquí.</p>
        </div>
      ) : (
        <div className="ptable-wrap">
          <table className="ptable">
            <thead>
              <tr>
                <th>Proyecto</th>
                <th>Nivel</th>
                <th>Último hito</th>
                <th>Último mes</th>
                <th>Próxima meta</th>
                <th>Avance</th>
                <th>Mejor mes</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const h = f.hitos
                const ultimo = h?.logrados[h.logrados.length - 1]
                return (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/projects/${f.id}?view=resumen`} className="adm-name" style={{ textDecoration: 'none' }}>
                        {f.name}
                      </Link>
                      {f.client && <div className="adm-email">{f.client}</div>}
                    </td>
                    {!h ? (
                      <td colSpan={6} style={{ color: 'var(--text-3)' }}>
                        Sin datos de Search Console
                      </td>
                    ) : (
                      <>
                        <td>
                          <span className={`hito-lvl ${h.nivel === 0 ? 'is-zero' : ''}`} title={`Nivel ${h.nivel} de ${TOTAL_NIVELES}`}>
                            {h.nivel}
                          </span>
                        </td>
                        <td>
                          {ultimo ? (
                            <>
                              <div style={{ color: 'var(--text)', fontWeight: 600 }}>{nombreHito(ultimo.meta)}</div>
                              <div className="adm-email">{mesCorto(ultimo.mes)}</div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>Aún sin hitos</span>
                          )}
                        </td>
                        <td className="hito-num">
                          {h.ultimoMes ? (
                            <>
                              {formatoClics(h.ultimoMes.clics)}
                              <div className="adm-email">{mesCorto(h.ultimoMes.mes)}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="hito-num">{h.meta ? `${formatoClics(h.meta)} / mes` : 'Todos logrados'}</td>
                        <td>
                          <div className="hito-mini" title={h.faltan ? `Faltan ${formatoClics(h.faltan)} clics` : undefined}>
                            <div className="hito-barra">
                              <span style={{ width: `${Math.max(2, h.progreso * 100)}%` }} />
                            </div>
                            <span className="pct">{Math.round(h.progreso * 100)}%</span>
                          </div>
                        </td>
                        <td className="hito-num">
                          {h.mejorMes ? (
                            <>
                              {formatoClics(h.mejorMes.clics)}
                              <div className="adm-email">{mesCorto(h.mejorMes.mes)}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
