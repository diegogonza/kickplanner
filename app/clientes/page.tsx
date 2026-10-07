import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import AdminTabs from '@/app/components/admin-tabs'
import { getSessionProfile } from '@/app/lib/session'
import ClientesView, { type ClientOverview } from '@/app/components/clientes-view'

// Clientes vive dentro de Administración: solo admin.
export default async function ClientesPage() {
  const { user, isAdmin } = await getSessionProfile()
  if (!user) redirect('/login')
  if (!isAdmin) redirect('/')
  const supabase = await createClient()

  const { data } = await supabase.rpc('clients_overview')
  const clients = (data ?? []) as ClientOverview[]

  return (
    <div className="flex h-full">
      <Sidebar active="admin" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Organización</div>
            <h1 className="page-title">Espacio de trabajo</h1>
          </div>
        </header>
        <AdminTabs active="clientes" />

        <div className="viewscroll flex-1 overflow-y-auto px-6">
          <div className="w-full">
            <ClientesView clients={clients} />
          </div>
        </div>
      </div>
    </div>
  )
}
