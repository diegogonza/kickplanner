import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import NewPortfolioButton from '@/app/components/new-portfolio-button'

type Portfolio = { id: string; name: string; created_at: string }

export default async function PortfoliosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  const list = (portfolios ?? []) as Portfolio[]

  return (
    <div className="flex h-full">
      <Sidebar email={user.email ?? ''} active="portfolios" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Portfolios
              <span className="count-badge">{list.length}</span>
            </h1>
          </div>
          <NewPortfolioButton />
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="w-full">
            {list.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Todavía no tenés portfolios</p>
                <p className="card-desc mb-5">Creá uno para agrupar proyectos relacionados.</p>
                <div className="flex justify-center">
                  <NewPortfolioButton label="Crear mi primer portfolio" />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((p) => (
                  <Link key={p.id} href={`/portfolios/${p.id}`} className="card block">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-[10px]"
                        style={{ background: 'var(--brand-50)', color: 'var(--brand-600)' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                      </span>
                      <div>
                        <p className="card-title">{p.name}</p>
                        <p className="card-desc">Ver proyectos del portfolio</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
