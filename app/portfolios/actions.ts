'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function createPortfolio(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('portfolios')
    .insert({ name, owner_id: user.id })
    .select('id')
    .single()

  if (error) {
    console.error('createPortfolio:', error.message)
    return
  }

  revalidatePath('/portfolios')
  redirect(`/portfolios/${data.id}`)
}

export async function addProjectToPortfolio(formData: FormData) {
  const portfolioId = formData.get('portfolio_id') as string
  const projectId = formData.get('project_id') as string
  if (!portfolioId || !projectId) return

  const supabase = await createClient()
  await supabase
    .from('portfolio_projects')
    .upsert(
      { portfolio_id: portfolioId, project_id: projectId },
      { onConflict: 'portfolio_id,project_id', ignoreDuplicates: true }
    )

  revalidatePath(`/portfolios/${portfolioId}`)
}

export async function removeProjectFromPortfolio(formData: FormData) {
  const portfolioId = formData.get('portfolio_id') as string
  const projectId = formData.get('project_id') as string

  const supabase = await createClient()
  await supabase
    .from('portfolio_projects')
    .delete()
    .eq('portfolio_id', portfolioId)
    .eq('project_id', projectId)

  revalidatePath(`/portfolios/${portfolioId}`)
}

// ---------- CAMPOS PERSONALIZADOS ----------

const VALID_FIELD_TYPE = ['text', 'number', 'money'] as const

export async function createField(formData: FormData) {
  const portfolioId = formData.get('portfolio_id') as string
  const name = (formData.get('name') as string)?.trim()
  const typeRaw = (formData.get('type') as string) ?? 'text'
  const type = VALID_FIELD_TYPE.includes(typeRaw as never) ? typeRaw : 'text'
  if (!portfolioId || !name) return

  const supabase = await createClient()

  // Posición al final
  const { count } = await supabase
    .from('portfolio_fields')
    .select('id', { count: 'exact', head: true })
    .eq('portfolio_id', portfolioId)

  await supabase
    .from('portfolio_fields')
    .insert({ portfolio_id: portfolioId, name, type, position: count ?? 0 })

  revalidatePath(`/portfolios/${portfolioId}`)
}

export async function deleteField(formData: FormData) {
  const id = formData.get('id') as string
  const portfolioId = formData.get('portfolio_id') as string

  const supabase = await createClient()
  await supabase.from('portfolio_fields').delete().eq('id', id)

  revalidatePath(`/portfolios/${portfolioId}`)
}

export async function deletePortfolio(formData: FormData) {
  const id = formData.get('id') as string

  const supabase = await createClient()
  await supabase.from('portfolios').delete().eq('id', id)

  revalidatePath('/portfolios')
  redirect('/portfolios')
}
