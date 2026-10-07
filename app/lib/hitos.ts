/**
 * Hitos de clics orgánicos (Search Console).
 *
 * Regla: un hito se logra cuando UN MES COMPLETO alcanza la cifra. Los meses
 * parciales (el mes en curso, o uno al que todavía le faltan días de datos)
 * no cuentan para lograr hitos: un mes a medias subestimaría el ritmo.
 *
 * La meta es automática: siempre el siguiente nivel por encima del mejor mes.
 * Es lógica pura (sin base de datos ni React) para usarla igual en la app,
 * en la vista general y en el portal del cliente.
 */

export const HITOS: number[] = [
  1, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
  25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
]
export const TOTAL_NIVELES = HITOS.length

/** Un mes de Search Console. `mes` en formato 'YYYY-MM' o 'YYYY-MM-DD'. */
export type MesClics = { mes: string; clics: number; parcial: boolean }

export type HitoLogrado = { nivel: number; meta: number; mes: string }

export type EstadoHitos = {
  /** 0 = todavía ninguno; 17 = todos. */
  nivel: number
  /** Hitos logrados, del 1 en adelante, con el primer mes que lo alcanzó. */
  logrados: HitoLogrado[]
  /** Próxima meta en clics por mes. null si ya se logró el último nivel. */
  meta: number | null
  /** Último mes completo (el ritmo actual). */
  ultimoMes: { mes: string; clics: number } | null
  /** Mejor mes completo de todo el historial. */
  mejorMes: { mes: string; clics: number } | null
  /** Avance del último mes completo hacia la meta, entre 0 y 1. */
  progreso: number
  /** Clics que le faltan al último mes completo para la meta. */
  faltan: number | null
  /** Hay meses completos con los que medir. */
  conDatos: boolean
}

const nf = new Intl.NumberFormat('es-CO')
export const formatoClics = (n: number) => nf.format(n)

/** "Primer clic orgánico", "2.500 clics orgánicos", "1.000.000 de clics orgánicos". */
export function nombreHito(meta: number): string {
  if (meta === 1) return 'Primer clic orgánico'
  if (meta === 1_000_000) return '1.000.000 de clics orgánicos'
  return `${formatoClics(meta)} clics orgánicos`
}

/** Nivel (1..17) que corresponde a una cifra de clics; 0 si no llega a 1. */
export function nivelDe(clics: number): number {
  let n = 0
  for (let i = 0; i < HITOS.length; i++) if (clics >= HITOS[i]) n = i + 1
  return n
}

export function calcularHitos(meses: MesClics[]): EstadoHitos {
  const completos = meses
    .filter((m) => !m.parcial)
    .map((m) => ({ mes: m.mes.slice(0, 7), clics: m.clics ?? 0 }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  const logrados: HitoLogrado[] = []
  let mejorMes: { mes: string; clics: number } | null = null
  for (const m of completos) {
    if (!mejorMes || m.clics > mejorMes.clics) mejorMes = m
    // Cada nivel nuevo que este mes alcanza por primera vez queda fechado acá.
    while (logrados.length < HITOS.length && m.clics >= HITOS[logrados.length]) {
      const nivel = logrados.length + 1
      logrados.push({ nivel, meta: HITOS[nivel - 1], mes: m.mes })
    }
  }

  const nivel = logrados.length
  const meta = nivel < HITOS.length ? HITOS[nivel] : null
  const ultimoMes = completos.length ? completos[completos.length - 1] : null
  const actual = ultimoMes?.clics ?? 0

  return {
    nivel,
    logrados,
    meta,
    ultimoMes,
    mejorMes,
    progreso: meta ? Math.min(1, actual / meta) : 1,
    faltan: meta ? Math.max(0, meta - actual) : null,
    conDatos: completos.length > 0,
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** '2026-08' → 'ago 2026' */
export function mesCorto(mes: string): string {
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1] ?? ''} ${y}`
}
