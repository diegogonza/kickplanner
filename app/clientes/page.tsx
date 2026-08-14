import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import ClientesView, { type ClientOverview } from '@/app/components/clientes-view'

export default async function ClientesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase.rpc('clients_overview')
  const clients = (data ?? []) as ClientOverview[]

  return (
    <div className="flex h-full">
      <Sidebar active="clientes" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Clientes
              <span className="count-badge">{clients.length}</span>
            </h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="w-full">
            <ClientesView clients={clients} />
          </div>
        </div>
      </div>
    </div>
  )
}
