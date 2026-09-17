import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import PortalesView, { type PortalRow } from '@/app/components/portales-view'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Portales de clientes · KickPlanner' }

export default async function PortalesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let rows: PortalRow[] = []
  try {
    const { data } = await supabase.rpc('portales_overview')
    rows = (data ?? []) as PortalRow[]
  } catch {
    rows = []
  }

  // El enlace completo se arma con el host real de la petición, no con una
  // constante: así funciona igual en localhost y en producción sin tener que
  // acordarse de cambiar una variable.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const baseUrl = `${proto}://${host}`

  const conPortal = rows.filter((r) => r.slug).length

  return (
    <div className="flex h-full">
      <Sidebar active="portales" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Portales de clientes
              <span className="count-badge">{conPortal}</span>
            </h1>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="w-full">
            {rows.length === 0 ? (
              <div className="card text-center" style={{ padding: 'var(--space-10)' }}>
                <p className="card-title mb-1">Todavía no hay clientes</p>
                <p className="card-desc">
                  El portal se crea por cliente. Cargá el primero desde la vista de Clientes.
                </p>
              </div>
            ) : (
              <PortalesView rows={rows} baseUrl={baseUrl} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
