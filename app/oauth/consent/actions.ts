'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

/**
 * Decisión del miembro en la pantalla de consentimiento. Supabase Auth devuelve
 * la URL de vuelta al cliente OAuth (con el código, o con access_denied) y la
 * seguimos tal cual.
 */
async function decidir(formData: FormData, aprobar: boolean) {
  const id = (formData.get('authorization_id') as string) ?? ''
  if (!id) redirect('/oauth/consent?error=sin_id')

  const supabase = await createClient()
  const { data, error } = aprobar
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })

  if (error || !data?.redirect_url) {
    console.error('[oauth] decision:', error)
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=decision`)
  }
  redirect(data.redirect_url)
}

export async function aprobarAcceso(formData: FormData) {
  await decidir(formData, true)
}

export async function rechazarAcceso(formData: FormData) {
  await decidir(formData, false)
}
