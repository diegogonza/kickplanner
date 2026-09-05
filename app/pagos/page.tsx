import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Sidebar from '@/app/components/sidebar'
import PaymentsView from '@/app/components/payments-view'
import { FINANCE_USER_ID } from '@/app/projects/statuses'

type Client = { project_id: string; name: string; type: string; currency: string; start_date: string | null; fee: number }
type Payment = { id: string; project_id: string; seq: number; period: string | null; amount: number; currency: string; status: string; paid_on: string | null; kind: string; note: string | null }
type FeeChange = { project_id: string; old_amount: number | null; new_amount: number; currency: string; effective_date: string; created_at: string }

export default async function PagosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (user.id !== FINANCE_USER_ID) redirect('/')

  // Materializa ciclos SEO y cuotas Web, luego trae los datos
  await supabase.rpc('generate_client_payments')
  await supabase.rpc('seed_web_installments')
  const { data } = await supabase.rpc('payments_data')
  const d = (data ?? {}) as { clients?: Client[]; payments?: Payment[]; fee_history?: FeeChange[] }
  const clients = (d.clients ?? []).filter((c) => c.fee > 0 || c.start_date)
  const payments = d.payments ?? []
  const feeHistory = d.fee_history ?? []
  const today = new Date().toISOString().slice(0, 10)

  const activos = clients.filter((c) => c.start_date).length

  return (
    <div className="flex h-full">
      <Sidebar active="pagos" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="topbar" style={{ borderBottom: 'none' }}>
          <div>
            <div className="breadcrumb">Espacio de trabajo</div>
            <h1 className="page-title">
              Pagos
              <span className="count-badge">{activos} activos</span>
            </h1>
          </div>
        </header>

        <div className="viewscroll flex-1 overflow-y-auto overflow-x-auto px-6">
          <div className="w-full">
            <PaymentsView clients={clients} payments={payments} feeHistory={feeHistory} today={today} />
          </div>
        </div>
      </div>
    </div>
  )
}
