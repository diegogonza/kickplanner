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

// Acceso a la sección de Pagos: por ahora solo Diego González
export const FINANCE_USER_ID = 'e676f0e8-5e19-4db2-8295-01974d3ced39'

// ---------- Fechas ----------
// Fecha de hoy en formato YYYY-MM-DD (UTC, coherente con current_date de la BD)
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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
  { key: 'upcoming', label: 'Inicia pronto', cls: 'ps-upcoming', color: '#3b5bdb' },
  { key: 'on_track', label: 'En progreso', cls: 'ps-ontrack', color: '#1f9d62' },
  { key: 'at_risk', label: 'En riesgo', cls: 'ps-atrisk', color: '#b9740b' },
  { key: 'on_hold', label: 'Detenido', cls: 'ps-onhold', color: '#5b6472' },
]

export const projectStatusOf = (k: string) =>
  PROJECT_STATUSES.find((s) => s.key === k) ?? PROJECT_STATUSES[0]

// Tipo de proyecto
export type ProjectType = 'seo' | 'web'

export const PROJECT_TYPES: { key: ProjectType; label: string; cls: string; color: string }[] = [
  { key: 'seo', label: 'SEO', cls: 'pt-seo', color: '#6d5bd0' },
  { key: 'web', label: 'WEB', cls: 'pt-web', color: '#0d9488' },
]

export const projectTypeOf = (k: string) =>
  PROJECT_TYPES.find((t) => t.key === k) ?? PROJECT_TYPES[0]

export const PRIORITIES: { key: Priority; label: string; pill: string; color: string }[] = [
  { key: 'media', label: 'Media', pill: 'pill-info', color: '#2E77E6' },
  { key: 'alta', label: 'Alta', pill: 'pill-mod', color: '#E0890B' },
  { key: 'urgente', label: 'Urgente', pill: 'pill-urgent', color: '#E5484D' },
]
