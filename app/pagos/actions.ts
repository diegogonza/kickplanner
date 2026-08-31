'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { FINANCE_USER_ID } from '@/app/projects/statuses'
import type { SupabaseClient } from '@supabase/supabase-js'

// Solo Diego puede operar la sección de Pagos (por ahora)
async function isFinance(supabase: SupabaseClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id === FINANCE_USER_ID
}

// Marca un ciclo como pagado (fecha de pago = hoy o la indicada)
export async function markPaymentPaid(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return
  const paidOn = (formData.get('paid_on') as string) || new Date().toISOString().slice(0, 10)

  const supabase = await createClient()
  if (!(await isFinance(supabase))) return
  await supabase.from('client_payments').update({ status: 'paid', paid_on: paidOn }).eq('id', id)
  revalidatePath('/pagos')
}

// Revierte un ciclo a pendiente
export async function markPaymentPending(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return

  const supabase = await createClient()
  if (!(await isFinance(supabase))) return
  await supabase.from('client_payments').update({ status: 'pending', paid_on: null }).eq('id', id)
  revalidatePath('/pagos')
}

// Edita una cuota (monto, etiqueta y/o vencimiento)
export async function updatePayment(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return
  const amount = Number(formData.get('amount') ?? 0) || 0
  const note = ((formData.get('note') as string) ?? '').trim() || null
  const period = (formData.get('period') as string) || null

  const supabase = await createClient()
  if (!(await isFinance(supabase))) return
  await supabase.from('client_payments').update({ amount, note, period }).eq('id', id)
  revalidatePath('/pagos')
}

// Agrega una cuota a un proyecto Web
export async function addInstallment(formData: FormData) {
  const projectId = formData.get('project_id') as string
  const currency = (formData.get('currency') as string) || 'COP'
  if (!projectId) return
  const amount = Number(formData.get('amount') ?? 0) || 0
  const note = ((formData.get('note') as string) ?? '').trim() || 'Cuota'
  const period = (formData.get('period') as string) || null

  const supabase = await createClient()
  if (!(await isFinance(supabase))) return
  const { data: last } = await supabase
    .from('client_payments')
    .select('seq')
    .eq('project_id', projectId)
    .eq('kind', 'installment')
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  const seq = (last?.seq ?? 0) + 1

  await supabase.from('client_payments').insert({
    project_id: projectId,
    kind: 'installment',
    seq,
    amount,
    currency,
    note,
    period,
  })
  revalidatePath('/pagos')
}

// Cambia el fee de un cliente: registra historial, actualiza el fee y re-cotiza ciclos futuros
export async function changeFee(formData: FormData) {
  const projectId = formData.get('project_id') as string
  if (!projectId) return
  const amount = Number(formData.get('amount') ?? 0) || 0
  if (amount <= 0) return
  const effective = (formData.get('effective') as string) || new Date().toISOString().slice(0, 10)
  const note = ((formData.get('note') as string) ?? '').trim() || null

  const supabase = await createClient()
  if (!(await isFinance(supabase))) return
  await supabase.rpc('change_project_fee', {
    p_project_id: projectId,
    p_new: amount,
    p_effective: effective,
    p_note: note,
  })
  revalidatePath('/pagos')
  revalidatePath('/')
}

// Elimina una cuota
export async function deletePayment(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return

  const supabase = await createClient()
  if (!(await isFinance(supabase))) return
  await supabase.from('client_payments').delete().eq('id', id)
  revalidatePath('/pagos')
}
