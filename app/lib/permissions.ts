import { getSessionProfile } from '@/app/lib/session'

/**
 * Roles de la agencia.
 *
 * La barrera real está en la base (RLS + chequeos en las funciones, migración
 * 012_roles). Esto es para que la app lo SEPA antes de intentar la escritura y
 * pueda avisar "sin permisos" en vez de fallar en silencio: con RLS, un UPDATE
 * o DELETE bloqueado no da error, simplemente no toca ninguna fila.
 */

import { NO_PERMISSION_MESSAGE } from '@/app/lib/permission-copy'

export { NO_PERMISSION_MESSAGE }

export type ActionResult = { ok: true } | { ok: false; reason: 'no_permission' | 'error'; message: string }

export const OK: ActionResult = { ok: true }
export const DENIED: ActionResult = { ok: false, reason: 'no_permission', message: NO_PERMISSION_MESSAGE }
export const failed = (message = 'No se pudo completar la acción. Intenta de nuevo.'): ActionResult => ({
  ok: false,
  reason: 'error',
  message,
})

/** true si la persona con sesión es admin. Cacheado por request. */
export async function isAdmin(): Promise<boolean> {
  const { isAdmin } = await getSessionProfile()
  return isAdmin
}
