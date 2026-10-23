// Fila de la tabla de /portfolios/[id]. Se arma en el servidor (page.tsx) con
// todas las etiquetas de fecha ya resueltas en la hora de Bogotá, para que el
// render del servidor y el del cliente digan lo mismo.

export type Cobro =
  | { kind: 'late'; count: number; amount: number }
  | { kind: 'next'; days: number; date: string }
  | { kind: 'paused' }
  | { kind: 'none' }

export type DetailRow = {
  id: string
  name: string
  url: string | null
  client: string | null
  type: 'seo' | 'web'
  status: string
  managerId: string | null
  manager: string | null
  managerAvatar: string | null
  open: number
  late: number
  activity: string
  /** Search Console: último mes completo vs. el anterior + serie para la mini-gráfica */
  gsc: { clicks: number; deltaPct: number | null; isNew: boolean; spark: number[] } | null
  /** Solo admin: fee y estado de cobro. null para miembros. */
  fee: number | null
  currency: string
  cobro: Cobro | null
}

export type DetailField = { id: string; name: string; type: 'text' | 'number' | 'money' }
export type DetailMember = { user_id: string; email: string; full_name: string | null; avatar_url: string | null }
