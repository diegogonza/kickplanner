import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/app/lib/session'
import Sidebar from '@/app/components/sidebar'
import NewPortfolioButton from '@/app/components/new-portfolio-button'
import PortfolioCard, { formatFees, type PortfolioCardData } from '@/app/components/portfolio-card'

export default async function PortfoliosPage() {
  const { user, isAdmin } = await getSessionProfile()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('portfolios_cards')
  if (error) console.error('portfolios_cards:', error.message)
  const list = (data ?? []) as PortfolioCardData[]

  // Resumen de arriba. Un proyecto puede estar en dos portafolios: los
  // proyectos se cuentan una vez por portafolio, igual que en las tarjetas.
  const totals = list.reduce(
    (acc, p) => {
      acc.active += p.active_count
      acc.open += p.open_tasks
      acc.overdue += p.overdue_tasks
      for (const [cur, n] of Object.entries(p.seo_fees ?? {})) acc.fees[cur] = (acc.fees[cur] ?? 0) + Number(n)
      return acc
    },
    { active: 0, open: 0, overdue: 0, fees: {} as Record<string, number> }
  )
  const feesLabel = isAdmin ? formatFees(totals.fees) : null

  return (
    <div className="flex h-full">
      <Sidebar active="portfolios" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Portafolios
              <span className="count-badge">{list.length}</span>
            </h1>
          </div>
          <NewPortfolioButton />
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          {list.length === 0 ? (
            <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
              <p className="card-title mb-1">Todavía no tienes portafolios</p>
              <p className="card-desc mb-5">Crea uno para agrupar clientes por responsable o por servicio.</p>
              <div className="flex justify-center">
                <NewPortfolioButton label="Crear mi primer portafolio" />
              </div>
            </div>
          ) : (
            <>
              <section className="pf-summary" aria-label="Resumen de portafolios">
                <div className="pf-kpi">
                  <b>{totals.active}</b>
                  <span>proyectos activos</span>
                </div>
                <div className="pf-kpi">
                  <b>{totals.open}</b>
                  <span>tareas abiertas</span>
                </div>
                <div className="pf-kpi">
                  <b className={totals.overdue > 0 ? 'is-late' : ''}>{totals.overdue}</b>
                  <span>tareas vencidas</span>
                </div>
                {feesLabel && (
                  <div className="pf-kpi">
                    <b>{feesLabel}</b>
                    <span>en retainers SEO / mes</span>
                    <span className="pf-kpi-badge">Solo admins</span>
                  </div>
                )}
              </section>

              <div className="pf-grid">
                {list.map((p) => (
                  <PortfolioCard key={p.id} p={p} canManage={isAdmin || p.owner_id === user.id} />
                ))}
                <NewPortfolioButton variant="card" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
