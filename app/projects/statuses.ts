export type Status = 'todo' | 'doing' | 'done'
export type Priority = 'media' | 'alta' | 'urgente'

export type Tag = { id: string; name: string; color: string }

export type Task = {
  id: string
  title: string
  status: Status
  parent_id: string | null
  description: string | null
  priority: Priority | null
  due_date: string | null
  assignee_id: string | null
  drive_url: string | null
  created_at: string
  position?: number | null
}

export type Member = {
  user_id: string
  email: string
  role: string
  full_name: string | null
  avatar_url: string | null
}

// Nombre para mostrar: usa el nombre del perfil, o el correo si no hay
export function displayName(m: { full_name?: string | null; email: string }): string {
  return m.full_name?.trim() || m.email
}

// ---------- Fechas ----------
/**
 * Zona horaria de la operación. La agencia trabaja en Medellín, así que "hoy"
 * significa hoy acá — no en UTC ni en la máquina de quien mira.
 *
 * Es una constante y no la del navegador a propósito: la misma fecha tiene que
 * salir en el cliente, en el render del servidor (Vercel corre en UTC) y en la
 * base. Si se calcula en cada lado por separado, se contradicen entre sí
 * durante las 5 horas que UTC va adelantado.
 */
export const TZ = 'America/Bogota'

// Fecha de hoy en formato YYYY-MM-DD, en la zona de la operación.
// 'en-CA' porque es el locale que formatea nativamente como YYYY-MM-DD.
const FMT_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function todayISO(): string {
  return FMT_DIA.format(new Date())
}

// Convierte 'YYYY-MM-DD' a Date local (para cálculos de calendario)
export function parseDue(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
// ¿La tarea está vencida? (tiene fecha, no está hecha y venció antes de hoy)
export function isOverdue(due: string | null, done: boolean): boolean {
  return !!due && !done && due < todayISO()
}

// Formato de moneda (COP/USD), sin decimales
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'es-CO', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount}`
  }
}

/**
 * Versión abreviada para tablas: solo COP se compacta (2.500.000 → $2.5M),
 * porque es la única moneda donde los ceros vuelven la columna ilegible.
 * El resto de monedas usa el formato completo.
 */
export function moneyCompact(amount: number, currency: string): string {
  if (currency !== 'COP') return money(amount, currency)
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  const fmt = (n: number) => {
    const s = n.toFixed(1)
    return s.endsWith('.0') ? s.slice(0, -2) : s
  }
  if (abs >= 1_000_000) return `${sign}$${fmt(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}$${fmt(abs / 1_000)}K`
  return `${sign}$${abs}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * ---------- Cuentas de calendario, atadas a la zona de la operación ----------
 *
 * Todo lo de abajo trabaja con cadenas 'YYYY-MM-DD' y con `todayISO()`, que ya
 * resuelve el día en TZ. Las restas se hacen sobre el mediodía UTC del día, así
 * que ni el huso del navegador ni el del servidor (ni un cambio de horario)
 * pueden mover el resultado: el render del servidor y el del cliente dan lo
 * mismo, que es justo lo que evita los desajustes de hidratación.
 */
function dayValue(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

/** Días completos entre dos fechas 'YYYY-MM-DD' (negativo si `to` es anterior). */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((dayValue(toISO) - dayValue(fromISO)) / 86400000)
}

/** Fecha larga y estable: "21 sep 2026". Sin depender del locale del entorno. */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES[m - 1]} ${y}`
}

/** Último día del mes (1-12) de un año dado. */
function ultimoDiaDelMes(year: number, month1a12: number): number {
  return new Date(Date.UTC(year, month1a12, 0)).getUTCDate()
}

export type ProjectAge =
  | { future: true; days: number }
  | { future: false; month: number; days: number; pausedDays: number }

/** Un cambio de estado del proyecto, con su fecha (en TZ) y el estado nuevo. */
export type StatusChange = { date: string; status: string }

/** Fecha 'YYYY-MM-DD' en la zona de la operación para un timestamp absoluto. */
export function dateInTZ(ts: string): string {
  return FMT_DIA.format(new Date(ts))
}

/**
 * Estado vigente en una fecha según el historial (ordenado de más viejo a más
 * nuevo): el último cambio registrado hasta ese día inclusive. null si el
 * historial empieza después (antes de esa fecha no hay registro).
 */
function estadoEn(historial: StatusChange[], fecha: string): string | null {
  let st: string | null = null
  for (const h of historial) {
    if (h.date > fecha) break
    st = h.status
  }
  return st
}

/**
 * Antigüedad del proyecto: meses y días ACTIVO, sin contar las pausas.
 *
 * El mes se cuenta por ANIVERSARIO DE CALENDARIO (no en bloques de 30 días),
 * que es cuando se cobra el mes anticipado. Cuando el día de inicio no existe
 * en un mes (un 31 en septiembre) el aniversario es el último día de ese mes.
 *
 * Con historial de estados, un aniversario solo suma si en esa fecha el
 * proyecto NO estaba detenido: es la misma regla con la que la base genera los
 * cobros (generate_client_payments), así que "Mes N" coincide con los meses
 * facturables. Los días activo son los días desde el inicio menos los días en
 * pausa. Sin historial para una fecha (registros anteriores a agosto de 2026)
 * se asume activo.
 *
 * Si la fecha de inicio es futura devuelve `future`.
 *
 * `historial` debe venir ordenado por fecha ascendente; `today` se puede
 * inyectar para pruebas.
 */
export function projectAge(
  startISO: string | null,
  historial: StatusChange[] = [],
  today: string = todayISO(),
): ProjectAge | null {
  if (!startISO) return null
  const total = daysBetween(startISO, today)
  if (total < 0) return { future: true, days: -total }

  // Meses: aniversarios ya cumplidos en los que el proyecto estaba activo.
  let month = 0
  for (let k = 0; ; k++) {
    const aniv = aniversarioMensual(startISO, k)
    if (aniv > today) break
    if (estadoEn(historial, aniv) !== 'on_hold') month++
  }

  // Días en pausa: tramos en 'on_hold' entre el inicio y hoy.
  let pausedDays = 0
  for (let i = 0; i < historial.length; i++) {
    if (historial[i].status !== 'on_hold') continue
    const desde = historial[i].date > startISO ? historial[i].date : startISO
    const finTramo = i + 1 < historial.length ? historial[i + 1].date : today
    const hasta = finTramo < today ? finTramo : today
    if (hasta > desde) pausedDays += daysBetween(desde, hasta)
  }

  return { future: false, month, days: total - pausedDays, pausedDays }
}

/** 'YYYY-MM-DD' + 1 día. */
function sumarDia(iso: string): string {
  const d = new Date(dayValue(iso) + 86400000)
  return d.toISOString().slice(0, 10)
}

/** Aniversario mensual número `k` de una fecha: el mismo día k meses después,
 * o el último día de ese mes si el día no existe. Es lo mismo que hace la base
 * con `start_date + k months` en generate_client_payments(). */
function aniversarioMensual(startISO: string, k: number): string {
  const [sy, sm, sd] = startISO.split('-').map(Number)
  const total = sm - 1 + k
  const y = sy + Math.floor(total / 12)
  const m = (total % 12) + 1
  const d = Math.min(sd, ultimoDiaDelMes(y, m))
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export type NextBilling = { date: string; days: number }

/**
 * Próximo cobro de un retainer SEO (mes anticipado).
 *
 * Se cobra en cada aniversario mensual de la fecha de inicio, con la misma
 * regla que usa /pagos al generar los cobros (generate_client_payments), para
 * que las dos vistas nunca se contradigan. Si hoy es aniversario, el cobro es
 * hoy (0 días). Si el proyecto aún no arranca, el primer cobro es la propia
 * fecha de inicio: el primer mes también se paga por adelantado.
 *
 * `paidThrough` (opcional, solo lo tiene admin) es el último mes recurrente
 * pagado: si el cobro que toca ya está pagado —o se pagó por adelantado— la
 * cuenta salta al primer aniversario posterior. Sin él es una cuenta regresiva
 * de calendario pura.
 *
 * `today` se puede inyectar para pruebas; por defecto es hoy en TZ.
 */
export function nextBilling(
  startISO: string | null,
  today: string = todayISO(),
  paidThrough: string | null = null,
): NextBilling | null {
  if (!startISO) return null
  if (paidThrough && paidThrough >= today) {
    // Buscar el primer aniversario sin pagar: el siguiente al último pagado.
    const desde = nextBilling(startISO, sumarDia(paidThrough))
    return desde && { date: desde.date, days: daysBetween(today, desde.date) }
  }
  if (startISO >= today) return { date: startISO, days: daysBetween(today, startISO) }
  const [sy, sm] = startISO.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  const k = (ty - sy) * 12 + (tm - sm)
  let date = aniversarioMensual(startISO, k)
  if (date < today) date = aniversarioMensual(startISO, k + 1)
  return { date, days: daysBetween(today, date) }
}

/** Fecha corta "1 nov"; con año si no es el año de `today`: "5 ene 2027". */
export function formatDateShort(iso: string, today: string = todayISO()): string {
  const [y, m, d] = iso.split('-').map(Number)
  return y === Number(today.slice(0, 4)) ? `${d} ${MESES[m - 1]}` : `${d} ${MESES[m - 1]} ${y}`
}

/**
 * "Activo hace…" a partir de un timestamp absoluto.
 *
 * `now` se recibe en vez de llamar a `Date.now()` adentro: durante el render
 * del servidor todavía no hay reloj del navegador, así que quien llama pasa
 * `null` y se muestra la fecha (idéntica en ambos lados); una vez montado el
 * componente pasa el reloj real y el texto se vuelve relativo.
 */
export function activeAgo(iso: string, now: number | null): string {
  const fecha = new Date(iso)
  if (now === null) return 'Activo ' + formatDateLong(FMT_DIA.format(fecha))
  const secs = Math.floor((now - fecha.getTime()) / 1000)
  if (secs < 90) return 'Activo recién'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `Activo hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Activo hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Activo hace 1 día'
  if (days < 30) return `Activo hace ${days} días`
  return 'Activo ' + formatDateLong(FMT_DIA.format(fecha))
}

// Fecha corta estilo Asana para las tarjetas: "Hoy", "Ayer", "Mañana",
// día de la semana si está dentro de los próximos 6 días, o "11 mayo".
export function formatDueShort(iso: string): { label: string; overdue: boolean } {
  const [y, m, d] = iso.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)

  let label: string
  if (diff === 0) label = 'Hoy'
  else if (diff === 1) label = 'Mañana'
  else if (diff === -1) label = 'Ayer'
  else if (diff > 1 && diff < 7) label = cap(DIAS[due.getDay()])
  else {
    label = `${d} ${MESES[due.getMonth()]}`
    if (due.getFullYear() !== today.getFullYear()) label += ` ${due.getFullYear()}`
  }
  return { label, overdue: diff < 0 }
}

export const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: 'todo', label: 'Por hacer', color: 'var(--info-fg)' },
  { key: 'doing', label: 'En curso', color: 'var(--mod-fg)' },
  { key: 'done', label: 'Hecho', color: 'var(--low-fg)' },
]

// Estado del proyecto (nivel proyecto, tipo Asana)
export type ProjectStatus = 'upcoming' | 'on_track' | 'at_risk' | 'on_hold'

export const PROJECT_STATUSES: { key: ProjectStatus; label: string; cls: string; color: string }[] = [
  { key: 'upcoming', label: 'Inicia pronto', cls: 'ps-upcoming', color: 'var(--info-fg)' },
  { key: 'on_track', label: 'En progreso', cls: 'ps-ontrack', color: 'var(--low-fg)' },
  { key: 'at_risk', label: 'En riesgo', cls: 'ps-atrisk', color: 'var(--mod-fg)' },
  { key: 'on_hold', label: 'Detenido', cls: 'ps-onhold', color: 'var(--text-2)' },
]

export const projectStatusOf = (k: string) =>
  PROJECT_STATUSES.find((s) => s.key === k) ?? PROJECT_STATUSES[0]

// Tipo de proyecto
export type ProjectType = 'seo' | 'web'

export const PROJECT_TYPES: { key: ProjectType; label: string; cls: string; color: string }[] = [
  { key: 'seo', label: 'SEO', cls: 'pt-seo', color: 'var(--brand-800)' },
  { key: 'web', label: 'WEB', cls: 'pt-web', color: 'var(--rust-fg)' },
]

export const projectTypeOf = (k: string) =>
  PROJECT_TYPES.find((t) => t.key === k) ?? PROJECT_TYPES[0]

export const PRIORITIES: { key: Priority; label: string; pill: string; color: string }[] = [
  { key: 'media', label: 'Media', pill: 'pill-info', color: 'var(--info-fg)' },
  { key: 'alta', label: 'Alta', pill: 'pill-mod', color: 'var(--mod-fg)' },
  { key: 'urgente', label: 'Urgente', pill: 'pill-urgent', color: 'var(--urgent-fg)' },
]
