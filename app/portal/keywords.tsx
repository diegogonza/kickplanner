'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { verKeywords } from './actions'
import type { KeywordsPortal } from './data'

/**
 * Tarjetas de palabras clave por rango de posición, desplegables.
 *
 * Dos asimetrías que hay que tener presentes al tocar esto:
 *
 * - La TARJETA cuenta acumulado (Top 10 incluye al Top 3) porque así se leen
 *   estos informes. La LISTA que se abre muestra solo la banda exclusiva
 *   (posiciones 4 a 10), y el título lo dice con todas las letras. Si las dos
 *   filtraran igual, las cuatro listas saldrían idénticas: las palabras con más
 *   clics son las mejor posicionadas, así que encabezan todos los acumulados.
 *
 * - El número de la tarjeta es el total real de Search Console; la lista son
 *   ejemplos de las 1000 filas que devuelve la API. Por eso el desplegable
 *   nunca dice "mostrando X de Y" — sería una resta que no cuadra.
 */

export type Rango = {
  tope: 3 | 10 | 20 | 50
  etiqueta: string
  valor: number
  /** Diferencia contra la foto de hace ~90 días. */
  dif: number | null
}

const ICONOS: Record<number, ReactNode> = {
  3: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  ),
  10: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20V11M12 20V5M19 20v-6" />
    </svg>
  ),
  20: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" />
    </svg>
  ),
  50: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" />
    </svg>
  ),
}

function unDecimal(n: number): string {
  return Number(n).toFixed(1).replace('.', ',')
}

export default function Keywords({
  projectId,
  rangos,
  ventana,
}: {
  projectId: string
  rangos: Rango[]
  ventana: number
}) {
  const [abierto, setAbierto] = useState<number | null>(null)
  // Cache por banda: volver a abrir una tarjeta ya vista no pide nada al
  // servidor ni parpadea.
  const [cache, setCache] = useState<Record<number, KeywordsPortal>>({})
  // El estado de carga se deduce de la cache (`datos` todavía sin llegar),
  // así que del transition solo hace falta el disparador.
  const [, start] = useTransition()

  const alternar = (tope: number) => {
    if (abierto === tope) {
      setAbierto(null)
      return
    }
    setAbierto(tope)
    if (cache[tope]) return

    start(async () => {
      const r = await verKeywords(projectId, tope)
      setCache((prev) => ({ ...prev, [tope]: r ?? { estado: 'sin_datos' } }))
    })
  }

  const datos = abierto != null ? cache[abierto] : undefined
  const filas = datos?.estado === 'ok' ? datos.filas ?? [] : undefined
  const desde = datos?.desde ?? 0
  const hasta = datos?.hasta ?? 0

  return (
    <div className="pt-seo-kw">
      <div className="pt-seo-kw-head">
        <b>Palabras clave posicionadas</b>
        <span>últimos {ventana} días</span>
      </div>

      <div className="pt-seo-kw-row">
        {rangos.map((r) => (
          <button
            type="button"
            key={r.tope}
            className={`pt-kw-card ${abierto === r.tope ? 'on' : ''}`}
            onClick={() => alternar(r.tope)}
            aria-expanded={abierto === r.tope}
            aria-label={`${r.valor} palabras clave en ${r.etiqueta}. Ver ejemplos`}
          >
            <span className="pt-kw-ico" aria-hidden="true">{ICONOS[r.tope]}</span>
            <span className="pt-kw-txt">
              <span className="v">{r.valor.toLocaleString('es')}</span>
              <span className="k">{r.etiqueta}</span>
              {r.dif != null && r.dif !== 0 && (
                <span className={`d ${r.dif > 0 ? 'up' : 'down'}`}>
                  {r.dif > 0 ? `+${r.dif}` : r.dif} en 3 meses
                </span>
              )}
            </span>
            <svg className="pt-kw-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>

      {abierto != null && (
        <div className="pt-kw-panel">
          <div className="pt-kw-panel-head">
            <b>
              {datos && desde > 1
                ? `Tus palabras clave entre las posiciones ${desde} y ${hasta}`
                : `Tus palabras clave en el Top ${hasta || abierto}`}
            </b>
            <button type="button" className="pt-kw-cerrar" onClick={() => setAbierto(null)}>
              Cerrar
            </button>
          </div>

          {!datos ? (
            <p className="pt-kw-estado">Buscando…</p>
          ) : !filas || filas.length === 0 ? (
            <p className="pt-kw-estado">
              Todavía no tenemos el detalle de este grupo. Aparece con la próxima
              actualización de datos.
            </p>
          ) : (
            <>
              <ul className="pt-kw-lista">
                {filas.map((k) => (
                  <li key={k.query}>
                    <span className="q">{k.query}</span>
                    <span className="pos">#{unDecimal(k.posicion)}</span>
                    <span className="cl">{k.clics.toLocaleString('es')} clics</span>
                  </li>
                ))}
              </ul>
              <p className="pt-kw-nota">
                {desde > 1 && (
                  <>
                    La tarjeta cuenta todas las que están en Top {hasta}, incluidas
                    las del Top {desde - 1}; acá abajo ves solo las que están entre
                    la {desde} y la {hasta}.{' '}
                  </>
                )}
                Es una muestra de las que más visitas traen: la lista completa es
                bastante más larga.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
