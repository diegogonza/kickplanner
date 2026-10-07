'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isAdmin, OK, DENIED, failed, type ActionResult } from '@/app/lib/permissions'

/** Cambia el rol de un miembro. La regla real vive en set_member_role (018). */
export async function setMemberRole(userId: string, role: 'admin' | 'member'): Promise<ActionResult> {
  if (!(await isAdmin())) return DENIED
  if (!userId || (role !== 'admin' && role !== 'member')) return failed('Ese rol no existe.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_member_role', { p_user_id: userId, p_role: role })
  if (error) {
    console.error('setMemberRole:', error.message)
    if (error.message.includes('al menos un administrador')) return failed('Debe quedar al menos un administrador.')
    if (error.message.includes('Solo un administrador')) return DENIED
    return failed()
  }
  // El rol cambia el menú y los accesos en toda la app.
  revalidatePath('/', 'layout')
  return OK
}
