import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import AddProjectToPortfolio from '@/app/components/add-project-to-portfolio'
import AddFieldButton from '@/app/components/add-field-button'
import PortfolioTable from '@/app/components/portfolio-table'
import { deletePortfolio } from '@/app/portfolios/actions'

type Project = { id: string; name: string }
type Row = {
  project_id: string
  name: string
  owner_email: string
  done_count: number
  total_count: number
}
type Field = { id: string; name: string; type: 'text' | 'number' | 'money' }

export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!portfolio) redirect('/portfolios')

  // Resumen de proyectos (nombre, encargado, progreso)
  const { data: overview } = await supabase.rpc('portfolio_overview', {
    p_portfolio_id: id,
  })
  const rows = (overview ?? []) as Row[]
  const inIds = new Set(rows.map((r) => r.project_id))

  // Campos personalizados
  const { data: fieldsData } = await supabase
    .from('portfolio_fields')
    .select('id, name, type')
    .eq('portfolio_id', id)
    .order('position', { ascending: true })
  const fields = (fieldsData ?? []) as Field[]

  // Valores de los campos
  const values: Record<string, string> = {}
  if (fields.length > 0) {
    const { data: valRows } = await supabase
      .from('project_field_values')
      .select('field_id, project_id, value')
      .in(
        'field_id',
        fields.map((f) => f.id)
      )
    for (const v of valRows ?? []) {
      if (v.value != null) values[`${v.field_id}:${v.project_id}`] = v.value
    }
  }

  // Proyectos disponibles para agregar
  const { data: mine } = await supabase.from('projects').select('id, name')
  const available = ((mine ?? []) as Project[]).filter((p) => !inIds.has(p.id))

  return (
    <div className="flex h-screen">
      <Sidebar email={user.email ?? ''} active="portfolios" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              <Link href="/portfolios" style={{ color: 'var(--text-3)' }}>
                Portfolios
              </Link>{' '}
              / <b>{portfolio.name}</b>
            </div>
            <h1 className="page-title">
              {portfolio.name}
              <span className="count-badge">{rows.length} proyectos</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <AddFieldButton portfolioId={portfolio.id} />
            <AddProjectToPortfolio portfolioId={portfolio.id} available={available} />
            <form action={deletePortfolio}>
              <input type="hidden" name="id" value={portfolio.id} />
              <button type="submit" className="btn btn-outline" title="Eliminar portfolio">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </form>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {rows.length === 0 ? (
            <div className="mx-auto max-w-3xl">
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Este portfolio está vacío</p>
                <p className="card-desc">Agregá proyectos con el botón de arriba.</p>
              </div>
            </div>
          ) : (
            <PortfolioTable
              portfolioId={portfolio.id}
              rows={rows}
              fields={fields}
              values={values}
            />
          )}
        </div>
      </div>
    </div>
  )
}
