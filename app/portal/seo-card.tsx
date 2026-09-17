import Image from 'next/image'
import { fechaCorta } from './data'
import Keywords, { type Rango } from './keywords'

/**
 * Tarjeta de resultados de búsqueda en el portal del cliente.
 *
 * Contrato: recibe lo que devuelve portal_seo(), que nunca falla. Si el estado
 * no es 'ok' la tarjeta no se dibuja — el portal sigue mostrando actividades
 * como si esta sección no existiera. Nunca un error en pantalla.
 */

export type DatosSeo = {
  estado: 'ok' | 'sin_propiedad' | 'sin_datos'
  desactualizado?: boolean
  ultima_sync?: string | null
  inicio_proyecto?: string | null
  mes?: {
    periodo: string
    clics: number
    impresiones: number
    posicion: number | null
    ctr: number | null
  }
  /** Mismo mes del año pasado. null si no hay un año de historial. */
  comparacion?: { periodo: string; clics: number; variacion: number } | null
  serie?: { mes: string; clics: number; parcial: boolean }[]
  posiciones?: {
    al_dia: string
    ventana: number
    total: number
    top1: number; top3: number; top5: number
    top10: number; top20: number; top50: number
  } | null
  posiciones_antes?: {
    al_dia: string
    top3: number; top10: number; top20: number; top50: number
  } | null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function nombreMes(periodo: string): string {
  const [y, m] = periodo.split('-')
  const n = MESES[Number(m) - 1] ?? ''
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`
}

/** '2026-08' → 'ago 26', para el eje del gráfico. */
function mesEje(periodo: string): string {
  const [y, m] = periodo.split('-')
  return `${MESES_CORTOS[Number(m) - 1]} ${y.slice(2)}`
}

/** 12.34 → "12,3". La posición viene con dos decimales; uno alcanza. */
function unDecimal(n: number): string {
  return n.toFixed(1).replace('.', ',')
}

/**
 * 1608 → "1.608" · 50491 → "50,5K".
 * La coma decimal es deliberada: con punto quedaba "50.5K" al lado de "1.608",
 * dos puntos con significados opuestos en el mismo renglón.
 */
function miles(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace('.0', '').replace('.', ',')}K`
  return n.toLocaleString('es')
}

/**
 * Etiquetas del eje vertical.
 *
 * Dos decimales y después se podan los ceros. Con un solo decimal el techo
 * 2500 daba "2,5K" arriba pero su mitad, 1250, se redondeaba a "1,3K": la
 * etiqueta decía un número y la línea estaba en otro.
 */
function eje(n: number): string {
  if (n < 1000) return String(Math.round(n))
  return `${(n / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}K`
}

/** Techo "redondo" para el eje: 4632 → 5000, 860 → 1000. */
function techo(n: number): number {
  if (n <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(n)))
  const r = n / exp
  const paso = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10
  return paso * exp
}

/** Ícono de la cabecera: el archivo oficial que está en /public, no un dibujo
 *  hecho a mano. El alt va vacío a propósito — el título de al lado ya dice
 *  "Resultados en Google" y un lector de pantalla no tiene por qué oírlo dos
 *  veces. */
function IconoBuscador() {
  return (
    <span className="pt-seo-ico">
      <Image src="/icono-google.webp" alt="" width={42} height={42} />
    </span>
  )
}

/** ⓘ con explicación. `title` nativo: sin JS y funciona en cualquier navegador. */
function Info({ texto }: { texto: string }) {
  return (
    <span className="pt-seo-info" title={texto} aria-label={texto} role="img">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.2" />
      </svg>
    </span>
  )
}

export default function SeoCard({
  datos,
  projectId,
}: {
  datos: DatosSeo | null
  projectId: string
}) {
  if (!datos || datos.estado !== 'ok' || !datos.mes) return null

  const { mes, serie = [], posiciones, posiciones_antes, inicio_proyecto, desactualizado } = datos
  const comp = datos.comparacion

  // Línea de tendencia. Solo meses completos: el actual, a medio llenar,
  // siempre se vería como una caída.
  const puntos = serie.filter((s) => !s.parcial)
  const tope = techo(Math.max(1, ...puntos.map((p) => p.clics)))

  // Sistema de coordenadas de 0 a 100 en los dos ejes: el SVG se estira a lo
  // ancho (preserveAspectRatio="none") y las etiquetas van en HTML, así que
  // trabajar en porcentajes deja que las dos capas se alineen solas.
  const xy = puntos.map((p, i) => ({
    x: puntos.length > 1 ? (i / (puntos.length - 1)) * 100 : 0,
    y: 96 - (p.clics / tope) * 92,
    mes: p.mes,
    clics: p.clics,
  }))
  const linea = xy.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const area = xy.length > 1 ? `${linea} L 100 100 L 0 100 Z` : ''
  const ultimo = xy[xy.length - 1]

  // Marca del inicio del proyecto: la propiedad de GSC cubre el dominio entero,
  // así que el historial incluye tráfico anterior a la contratación.
  const inicioMes = inicio_proyecto ? inicio_proyecto.slice(0, 7) : null
  const marca = inicioMes ? xy.find((p) => p.mes === inicioMes) : undefined

  // Etiquetas del eje horizontal: como mucho 5, y la última SIEMPRE se dibuja.
  // La condición del final es la que evita el choque clásico: si la penúltima
  // etiqueta cae a uno o dos meses del borde, se pisa con la última en cuanto
  // la pantalla se angosta, así que se descarta.
  const saltos = Math.max(1, Math.ceil(puntos.length / 4))
  const ultimoI = xy.length - 1
  const etiquetasX = xy.filter(
    (_, i) => i === ultimoI || (i % saltos === 0 && ultimoI - i >= saltos)
  )

  const rangos: Rango[] = posiciones
    ? ([
        { tope: 3, etiqueta: 'Top 3', valor: posiciones.top3, antes: posiciones_antes?.top3 },
        { tope: 10, etiqueta: 'Top 10', valor: posiciones.top10, antes: posiciones_antes?.top10 },
        { tope: 20, etiqueta: 'Top 20', valor: posiciones.top20, antes: posiciones_antes?.top20 },
        { tope: 50, etiqueta: 'Top 50', valor: posiciones.top50, antes: posiciones_antes?.top50 },
      ] as const).map((r) => ({
        tope: r.tope,
        etiqueta: r.etiqueta,
        valor: r.valor,
        dif: r.antes != null ? r.valor - r.antes : null,
      }))
    : []

  return (
    <section className="pt-card pt-seo">
      <header className="pt-seo-head">
        <IconoBuscador />
        <div className="pt-seo-titulo">
          <h2>Resultados en Google</h2>
          <p>Así está rindiendo tu sitio en la búsqueda orgánica.</p>
        </div>
        <span className="pt-seo-periodo">{nombreMes(mes.periodo)}</span>
        <Info texto={`Mostramos el último mes cerrado (${nombreMes(mes.periodo)}). El mes en curso está a medio llenar y siempre se vería peor de lo que es.`} />
      </header>

      <div className="pt-seo-top">
        <div className="pt-seo-nums">
          <div className="pt-seo-num">
            <b>{miles(mes.clics)}</b>
            {comp && (
              <span className={`pt-seo-delta ${comp.variacion >= 0 ? 'up' : 'down'}`}>
                {comp.variacion >= 0 ? '↑' : '↓'} {Math.abs(comp.variacion)}% vs. {nombreMes(comp.periodo)}
              </span>
            )}
            <span className="pt-seo-lbl">Clics desde Google</span>
          </div>

          <div className="pt-seo-num">
            <b>{miles(mes.impresiones)}</b>
            <span className="pt-seo-lbl">
              Veces que apareciste
              <Info texto="Cuántas veces tu sitio salió en los resultados de Google, lo hayan clicado o no." />
            </span>
          </div>
        </div>

        {xy.length > 1 && (
          <figure className="pt-graf">
            <div className="pt-graf-y" aria-hidden="true">
              <span>{eje(tope)}</span>
              <span>{eje(tope / 2)}</span>
              <span>0</span>
            </div>

            <div className="pt-graf-plot">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
                   aria-label={`Evolución de clics mes a mes. De ${miles(puntos[0].clics)} en ${mesEje(puntos[0].mes)} a ${miles(ultimo.clics)} en ${mesEje(ultimo.mes)}.`}>
                <defs>
                  <linearGradient id="ptSeoFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-400)" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="var(--brand-400)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {[4, 50, 96].map((y) => (
                  <line key={y} x1="0" y1={y} x2="100" y2={y}
                        stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}

                {area && <path d={area} fill="url(#ptSeoFill)" />}
                <path d={linea} fill="none" stroke="var(--brand-600)" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

                {marca && (
                  <line x1={marca.x} y1="0" x2={marca.x} y2="100"
                        stroke="var(--brand-700)" strokeWidth="1.5" strokeDasharray="4 4"
                        vectorEffect="non-scaling-stroke" />
                )}
              </svg>

              {/* El punto y los globos van en HTML: dentro de un SVG estirado a lo
                  ancho un círculo saldría ovalado y el texto, deformado. */}
              <span className="pt-graf-punto" style={{ left: `${ultimo.x}%`, top: `${ultimo.y}%` }} aria-hidden="true" />
              <span
                className={`pt-graf-globo ${ultimo.y < 34 ? 'abajo' : ''}`}
                style={{ top: `${ultimo.y}%` }}
                aria-hidden="true"
              >
                <b>{miles(ultimo.clics)}</b> clics
              </span>

              {marca && (
                <span className="pt-graf-inicio" style={{ left: `${marca.x}%` }} aria-hidden="true">
                  Empezamos acá
                </span>
              )}
            </div>

            <div className="pt-graf-x" aria-hidden="true">
              {etiquetasX.map((p) => (
                <span key={p.mes} style={{ left: `${p.x}%` }}>{mesEje(p.mes)}</span>
              ))}
            </div>

            <figcaption className="pt-graf-pie">
              {marca
                ? 'La línea punteada marca el inicio de nuestro trabajo.'
                : `Clics mes a mes · últimos ${puntos.length} meses`}
            </figcaption>
          </figure>
        )}
      </div>

      {rangos.length > 0 && posiciones && (
        <Keywords projectId={projectId} rangos={rangos} ventana={posiciones.ventana} />
      )}

      <p className="pt-seo-det">
        {mes.ctr != null && <>CTR {unDecimal(Number(mes.ctr))}%</>}
        {mes.ctr != null && mes.posicion != null && ' · '}
        {mes.posicion != null && <>Posición media {unDecimal(Number(mes.posicion))}</>}
        {desactualizado && datos.ultima_sync && (
          <>
            {(mes.ctr != null || mes.posicion != null) && ' · '}
            <span style={{ color: 'var(--mod-fg)' }}>
              Datos actualizados al {fechaCorta(datos.ultima_sync.slice(0, 10))}
            </span>
          </>
        )}
      </p>
    </section>
  )
}
