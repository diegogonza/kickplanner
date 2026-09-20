import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

export type SessionProfile = {
  user: { id: string; email: string } | null
  fullName: string | null
  avatarUrl: string | null
  /** Rol en la agencia (profiles.role). Diego y Oscar son 'admin'. */
  isAdmin: boolean
}

/**
 * Sesión + perfil del usuario actual, resueltos UNA sola vez por request.
 *
 * `cache()` de React deduplica la llamada dentro del mismo render: la página,
 * el sidebar y cualquier otro componente de servidor pueden pedirlo sin que se
 * repitan la validación de la sesión ni
 * la consulta a `profiles`.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile> => {
  const supabase = await createClient()
  // getClaims() verifica la firma del JWT de la cookie. Con claves asimétricas
  // lo hace localmente (sin ir a Supabase); con la clave simétrica heredada
  // cae solo a getUser() por red. En ambos casos la identidad es confiable.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return { user: null, fullName: null, avatarUrl: null, isAdmin: false }

  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role')
    .eq('id', claims.sub)
    .maybeSingle()

  return {
    user: { id: claims.sub, email: (claims.email as string | undefined) ?? '' },
    fullName: prof?.full_name ?? null,
    avatarUrl: prof?.avatar_url ?? null,
    isAdmin: prof?.role === 'admin',
  }
})
