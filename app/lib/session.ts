import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

export type SessionProfile = {
  user: { id: string; email: string } | null
  fullName: string | null
  avatarUrl: string | null
}

/**
 * Sesión + perfil del usuario actual, resueltos UNA sola vez por request.
 *
 * `cache()` de React deduplica la llamada dentro del mismo render: la página,
 * el sidebar y cualquier otro componente de servidor pueden pedirlo sin que se
 * repitan el `auth.getUser()` (que valida el token contra Supabase por red) ni
 * la consulta a `profiles`.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, fullName: null, avatarUrl: null }

  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return {
    user: { id: user.id, email: user.email ?? '' },
    fullName: prof?.full_name ?? null,
    avatarUrl: prof?.avatar_url ?? null,
  }
})
