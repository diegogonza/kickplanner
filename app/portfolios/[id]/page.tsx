import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import PortfolioDetail from '@/app/components/portfolio-detail'
import { getSessionProfile } from '@/app/lib/session'
import { isCover } from '@/app/portfolios/covers'
import { daysBetween, dateInTZ, formatDateShort, nextBilling, todayISO } from '@/app/projects/statuses'
import type { Cobro, DetailField, DetailMember, DetailRow } from '@/app/portfolios/detail-types'

type Overview = {
  id: string
  name: string
  client: string | null
  status: string
  type: string
  last_activity: string | null
  manager_id: string | null
  manager: string | null
  manager_avatar: string | null
  start_date: string | null
  fee: number | null
  currency: string
  url: string | null
}
type PagoResumen = { project_id: string; overdue_count: number; overdue_amount: number | null; paid_through: string | null }
type Mes = { project_id: string; month: string; clicks: number; partial: boolean }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function activityOf(ts: string | null, today: string): string {
  if (!ts) return 'Sin actividad'
  const d = daysBetween(dateInTZ(ts), today)
  if (d <= 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  if (d < 30) return `Hace ${d} días`
  return formatDateShort(dateInTZ(ts), today)
}

function gscOf(meses: Mes[] | undefined): DetailRow['gsc'] {
  const completos = (meses ?? []).filter((m) => !m.partial).sort((a, b) => a.month.localeCompare(b.month))
  if (completos.length === 0) return null
  const last = completos[completos.length - 1]
  const prev = completos[completos.length - 2]
  const isNew = !!prev && prev.clicks === 0 && last.clicks > 0
  const deltaPct = prev && prev.clicks > 0 ? Math.round(((last.clicks - prev.clicks) / prev.clicks) * 100) : null
  return { clicks: last.clicks, deltaPct, isNew, spark: completos.slice(-5).map((m) => m.clicks) }
}

/** Misma regla que la columna de cobro de /projects (ver projects-view.tsx). */
function cobroOf(p: Overview, pago: PagoResumen | undefined): Cobro {
  if (pago && pago.overdue_count > 0) return { kind: 'late', count: pago.overdue_count, amount: Number(pago.overdue_amount ?? 0) }
  if (p.type !== 'seo') return { kind: 'none' }
  if (p.status === 'on_hold') return { kind: 'paused' }
  const nb = nextBilling(p.start_date, undefined, pago?.paid_through ?? null)
  return nb ? { kind: 'next', ...nb } : { kind: 'none' }
}

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, isAdmin } = await getSessionProfile()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id, name, description, cover, owner_id')
    .eq('id', id)
    .maybeSingle()
  if (!portfolio) redirect('/portfolios')

  // Igual que /projects: para admin se materializan primero los cobros que ya
  // tocaron, así el atraso no depende de que alguien haya abierto Pagos.
  if (isAdmin) {
    const { error } = await supabase.rpc('generate_client_payments')
    if (error) console.error('portfolio generate_client_payments:', error.message)
  }

  const { data: links } = await supabase.from('portfolio_projects').select('project_id').eq('portfolio_id', id)
  const ids = (links ?? []).map((l) => l.project_id as string)
  const inIds = new Set(ids)
  const safeIds = ids.length ? ids : ['00000000-0000-0000-0000-000000000000']

  const [ovRes, tasksRes, gscRes, pagosRes, membersRes, fieldsRes] = await Promise.all([
    supabase.rpc('projects_overview'),
    supabase.from('tasks').select('project_id, due_date').in('project_id', safeIds).is('parent_id', null).neq('status', 'done'),
    supabase.from('gsc_monthly').select('project_id, month, clicks, partial').in('project_id', safeIds),
    isAdmin ? supabase.rpc('payments_summary_by_project') : Promise.resolve({ data: [], error: null }),
    supabase.rpc('workspace_members'),
    supabase.from('portfolio_fields').select('id, name, type').eq('portfolio_id', id).order('position', { ascending: true }),
  ])
  for (const [k, r] of Object.entries({ ovRes, tasksRes, gscRes, pagosRes, membersRes, fieldsRes })) {
    if (r.error) console.error(`portfolio ${k}:`, r.error.message)
  }

  const overview = ((ovRes.data ?? []) as Overview[])
  const inPortfolio = overview.filter((p) => inIds.has(p.id))
  const available = overview
    .filter((p) => !inIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const today = todayISO()
  const lateBy = new Map<string, number>()
  const openBy = new Map<string, number>()
  for (const t of (tasksRes.data ?? []) as { project_id: string; due_date: string | null }[]) {
    openBy.set(t.project_id, (openBy.get(t.project_id) ?? 0) + 1)
    if (t.due_date && t.due_date < today) lateBy.set(t.project_id, (lateBy.get(t.project_id) ?? 0) + 1)
  }
  const gscBy = new Map<string, Mes[]>()
  for (const m of (gscRes.data ?? []) as Mes[]) gscBy.set(m.project_id, [...(gscBy.get(m.project_id) ?? []), m])
  const pagos = new Map(((pagosRes.data ?? []) as PagoResumen[]).map((p) => [p.project_id, p]))

  const rows: DetailRow[] = inPortfolio.map((p) => {
    const late = lateBy.get(p.id) ?? 0
    return {
      id: p.id,
      name: p.name,
      url: p.url,
      client: p.client,
      type: p.type === 'web' ? 'web' : 'seo',
      status: p.status,
      managerId: p.manager_id,
      manager: p.manager,
      managerAvatar: p.manager_avatar,
      open: openBy.get(p.id) ?? 0,
      late,
      activity: activityOf(p.last_activity, today),
      gsc: p.type === 'web' ? null : gscOf(gscBy.get(p.id)),
      fee: isAdmin ? p.fee : null,
      currency: p.currency,
      cobro: isAdmin ? cobroOf(p, pagos.get(p.id)) : null,
    }
  })

  // Mes de referencia de los clics: el último mes completo más reciente.
  const ultimoMes = ((gscRes.data ?? []) as Mes[])
    .filter((m) => !m.partial)
    .map((m) => m.month)
    .sort()
    .pop()
  const gscMonth = ultimoMes ? MESES[Number(ultimoMes.slice(5, 7)) - 1] : null

  // Campos personalizados y sus valores
  const fields = (fieldsRes.data ?? []) as DetailField[]
  const values: Record<string, string> = {}
  if (fields.length > 0) {
    const { data: valRows } = await supabase
      .from('project_field_values')
      .select('field_id, project_id, value')
      .in('field_id', fields.map((f) => f.id))
    for (const v of valRows ?? []) if (v.value != null) values[`${v.field_id}:${v.project_id}`] = v.value
  }

  return (
    <div className="flex h-full">
      <Sidebar active="portfolios" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PortfolioDetail
          portfolio={{
            id: portfolio.id,
            name: portfolio.name,
            description: portfolio.description,
            cover: isCover(portfolio.cover) ? portfolio.cover : 'bosque',
          }}
          canManage={isAdmin || portfolio.owner_id === user.id}
          isAdmin={isAdmin}
          rows={rows}
          available={available}
          members={(membersRes.data ?? []) as DetailMember[]}
          fields={fields}
          values={values}
          gscMonth={gscMonth}
        />
      </div>
    </div>
  )
}
