'use server'

import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isAdmin, NO_PERMISSION_MESSAGE } from '@/app/lib/permissions'

/**
 * Administración de los accesos al portal de clientes.
 *
 * Regla que gobierna todo este archivo: la contraseña se genera acá, viaja a
 * Postgres solo para hashearse con bcrypt, y se devuelve a la pantalla UNA
 * vez. No se guarda en ningún lado en texto plano — ni en la base, ni en un
 * log, ni en el estado de la app. Si el cliente la pierde, se rota; no se
 * recupera. Es la misma razón por la que tu banco no te puede decir cuál era
 * tu contraseña.
 */

export type Resultado = { ok: boolean; mensaje: string }
export type AccesoCreado = { cliente: string; slug: string; password: string }

/**
 * Contraseña legible para dictar por teléfono o pegar en un WhatsApp.
 *
 * Alfabeto sin caracteres ambiguos: nada de 0/O ni 1/l/I, que son la causa
 * número uno de "no me funciona la contraseña". 4 bloques de 4 = ~20 bits por
 * bloque, 82 bits en total. Con bcrypt detrás, eso no se rompe por fuerza
 * bruta.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generarPassword(): string {
  const bloque = () =>
    Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('')
  return [bloque(), bloque(), bloque(), bloque()].join('-')
}

function traducir(e: { code?: string; message?: string }, accion: string): string {
  if (e.code === '23505') return 'Ya existe un portal con esa dirección. Probá con otra.'
  if (e.message?.includes('no tienes permisos')) return NO_PERMISSION_MESSAGE
  if (e.message?.includes('sin sesión')) {
    return 'Tu sesión expiró. Volvé a iniciar sesión.'
  }
  return `No se pudo ${accion}. ${e.message ?? ''}`.trim()
}

/** Crea el acceso si no existe, o rota la contraseña si ya existe. */
export async function crearOrotar(
  clientId: string,
  clienteNombre: string,
  slugManual?: string
): Promise<{ ok: true; acceso: AccesoCreado } | { ok: false; mensaje: string }> {
  if (!(await isAdmin())) return { ok: false, mensaje: NO_PERMISSION_MESSAGE }
  try {
    const supabase = await createClient()
    const password = generarPassword()

    const { data, error } = await supabase.rpc('portal_guardar_acceso', {
      p_client_id: clientId,
      p_password: password,
      p_slug: slugManual?.trim() || null,
    })
    if (error) return { ok: false, mensaje: traducir(error, 'guardar el acceso') }

    revalidatePath('/portales')
    revalidatePath('/projects')
    return {
      ok: true,
      acceso: { cliente: clienteNombre, slug: data as string, password },
    }
  } catch {
    return { ok: false, mensaje: 'No se pudo guardar el acceso.' }
  }
}

/**
 * Crea el acceso para TODOS los clientes que no tengan uno.
 *
 * Se procesa uno por uno a propósito: si un cliente falla, los demás quedan
 * creados igual y el error se reporta con nombre. Un lote que se cae entero
 * por un caso raro sería peor.
 */
export async function crearTodosLosFaltantes(): Promise<
  { ok: boolean; mensaje: string; accesos: AccesoCreado[] }
> {
  if (!(await isAdmin())) return { ok: false, mensaje: NO_PERMISSION_MESSAGE, accesos: [] }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('portales_overview')
    if (error) return { ok: false, mensaje: 'No se pudo leer la lista de clientes.', accesos: [] }

    const faltantes = ((data ?? []) as { client_id: string; cliente: string; slug: string | null }[])
      .filter((p) => !p.slug)

    if (faltantes.length === 0) {
      return { ok: true, mensaje: 'Todos los clientes ya tienen portal.', accesos: [] }
    }

    const accesos: AccesoCreado[] = []
    const fallos: string[] = []

    for (const f of faltantes) {
      const r = await crearOrotar(f.client_id, f.cliente)
      if (r.ok) accesos.push(r.acceso)
      else fallos.push(f.cliente)
    }

    revalidatePath('/portales')
    revalidatePath('/projects')
    return {
      ok: fallos.length === 0,
      mensaje:
        fallos.length === 0
          ? `${accesos.length} portales creados. Copiá las contraseñas ahora: no se vuelven a mostrar.`
          : `${accesos.length} portales creados. Fallaron: ${fallos.join(', ')}.`,
      accesos,
    }
  } catch {
    return { ok: false, mensaje: 'No se pudieron crear los portales.', accesos: [] }
  }
}

export async function activarPortal(clientId: string, enabled: boolean): Promise<Resultado> {
  if (!(await isAdmin())) return { ok: false, mensaje: NO_PERMISSION_MESSAGE }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('portal_activar', {
      p_client_id: clientId,
      p_enabled: enabled,
    })
    if (error) return { ok: false, mensaje: traducir(error, 'cambiar el estado') }
    if (data !== true) return { ok: false, mensaje: 'Ese cliente no tiene portal.' }

    revalidatePath('/portales')
    revalidatePath('/projects')
    return {
      ok: true,
      mensaje: enabled
        ? 'Portal activado.'
        : 'Portal desactivado y sesiones cerradas.',
    }
  } catch {
    return { ok: false, mensaje: 'No se pudo cambiar el estado.' }
  }
}

export async function desbloquearPortal(slug: string): Promise<Resultado> {
  if (!(await isAdmin())) return { ok: false, mensaje: NO_PERMISSION_MESSAGE }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('portal_desbloquear', { p_slug: slug })
    if (error) return { ok: false, mensaje: traducir(error, 'desbloquear') }
    if (data !== true) return { ok: false, mensaje: 'No se encontró ese portal.' }
    revalidatePath('/portales')
    return { ok: true, mensaje: 'Portal desbloqueado. El cliente ya puede intentar de nuevo.' }
  } catch {
    return { ok: false, mensaje: 'No se pudo desbloquear.' }
  }
}

export async function eliminarPortal(clientId: string): Promise<Resultado> {
  if (!(await isAdmin())) return { ok: false, mensaje: NO_PERMISSION_MESSAGE }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('portal_eliminar_acceso', { p_client_id: clientId })
    if (error) return { ok: false, mensaje: traducir(error, 'eliminar el acceso') }
    if (data !== true) return { ok: false, mensaje: 'Ese cliente no tenía portal.' }
    revalidatePath('/portales')
    revalidatePath('/projects')
    return { ok: true, mensaje: 'Acceso eliminado. El enlace deja de funcionar.' }
  } catch {
    return { ok: false, mensaje: 'No se pudo eliminar el acceso.' }
  }
}
