'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/app/lib/session'
import { OK, DENIED, failed, type ActionResult } from '@/app/lib/permissions'
import { isCover, DESCRIPTION_MAX } from '@/app/portfolios/covers'

function readDescription(formData: FormData): string | null {
  const v = ((formData.get('description') as string) ?? '').trim()
  return v ? v.slice(0, DESCRIPTION_MAX) : null
}

export async function createPortfolio(formData: FormData) {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return

  const { user } = await getSessionProfile()
  if (!user) return
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('portfolios')
    .insert({
      name,
      owner_id: user.id,
      description: readDescription(formData),
      cover: isCover(formData.get('cover')) ? formData.get('cover') : 'bosque',
    })
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

/** Nombre, descripción y portada. Dueño o admin (lo garantiza la RLS). */
export async function updatePortfolio(formData: FormData): Promise<ActionResult> {
  const id = formData.get('id') as string
  const name = ((formData.get('name') as string) ?? '').trim()
  const cover = formData.get('cover')
  if (!id) return failed()
  if (!name) return failed('El portafolio necesita un nombre.')
  if (!isCover(cover)) return failed('Elige una de las portadas disponibles.')

  const supabase = await createClient()
  // count: con RLS un UPDATE bloqueado no da error, devuelve 0 filas.
  const { error, count } = await supabase
    .from('portfolios')
    .update({ name, description: readDescription(formData), cover }, { count: 'exact' })
    .eq('id', id)
  if (error || !count) {
    if (error) console.error('updatePortfolio:', error.message)
    return error ? failed() : DENIED
  }

  revalidatePath('/portfolios')
  revalidatePath(`/portfolios/${id}`)
  return OK
}

/** Elimina el portafolio (los proyectos NO se tocan). Dueño o admin. */
export async function deletePortfolio(formData: FormData): Promise<ActionResult> {
  const id = formData.get('id') as string
  if (!id) return failed()

  const supabase = await createClient()
  const { error, count } = await supabase.from('portfolios').delete({ count: 'exact' }).eq('id', id)
  if (error || !count) {
    if (error) console.error('deletePortfolio:', error.message)
    return error ? failed() : DENIED
  }

  revalidatePath('/portfolios')
  return OK
}

/**
 * Quita un proyecto del portafolio (el proyecto no se toca). Devuelve el
 * resultado para avisar "sin permisos": con RLS un DELETE bloqueado no da
 * error, simplemente borra 0 filas.
 */
export async function removeFromPortfolio(portfolioId: string, projectId: string): Promise<ActionResult> {
  if (!portfolioId || !projectId) return failed()
  const supabase = await createClient()
  const { error, count } = await supabase
    .from('portfolio_projects')
    .delete({ count: 'exact' })
    .eq('portfolio_id', portfolioId)
    .eq('project_id', projectId)
  if (error || !count) {
    if (error) console.error('removeFromPortfolio:', error.message)
    return error ? failed() : DENIED
  }
  revalidatePath(`/portfolios/${portfolioId}`)
  revalidatePath('/portfolios')
  return OK
}
