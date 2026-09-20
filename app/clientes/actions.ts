'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { isAdmin, NO_PERMISSION_MESSAGE } from '@/app/lib/permissions'

/**
 * Acciones de la ficha de cliente.
 *
 * Todas devuelven `{ ok, mensaje }`. Antes devolvían void y descartaban el
 * error de Supabase: el modal se cerraba igual, con lo cual un alta que fallaba
 * era indistinguible de una que funcionaba. Así estuvo fallando la creación de
 * clientes sin que nada lo dijera — el insert mandaba una columna `nap_name`
 * que no existe en la tabla y PostgREST lo rechazaba entero.
 */

export type Resultado = { ok: boolean; mensaje: string }

function clean(v: FormDataEntryValue | null): string | null {
  const s = ((v as string) ?? '').trim()
  return s || null
}

/** Traduce el error de Postgres a algo accionable, sin esconderlo. */
function traducir(e: { code?: string; message?: string }, accion: string): string {
  if (e.code === '23505') return 'Ya existe un cliente con ese nombre.'
  if (e.code === '23514') return 'Algún dato tiene un formato que la base no acepta.'
  // 23503 = violación de clave foránea. Con ON DELETE RESTRICT es lo que pasa
  // al intentar borrar un cliente que todavía tiene proyectos.
  if (e.code === '23503') {
    return 'No se puede eliminar: el cliente todavía tiene proyectos. Reasignalos primero.'
  }
  if (e.code === '42501' || e.code === 'PGRST301') {
    return 'Tu sesión no tiene permiso para esta operación. Volvé a iniciar sesión.'
  }
  // PGRST204 = columna inexistente; es un bug del código, no del usuario.
  return `No se pudo ${accion}. ${e.code ?? ''} ${e.message ?? ''}`.trim()
}

export async function createCliente(formData: FormData): Promise<Resultado> {
  const name = (formData.get('name') as string)?.trim()
  if (!name) return { ok: false, mensaje: 'El nombre del cliente es obligatorio.' }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, mensaje: 'Tu sesión expiró. Volvé a iniciar sesión.' }

    const { error } = await supabase.from('clients').insert({
      owner_id: user.id,
      name,
      address: clean(formData.get('address')),
      phone: clean(formData.get('phone')),
      contact_name: clean(formData.get('contact_name')),
      contact_email: clean(formData.get('contact_email')),
      tier: clean(formData.get('tier')),
      billing_code: clean(formData.get('billing_code')),
    })
    if (error) return { ok: false, mensaje: traducir(error, 'crear el cliente') }

    revalidatePath('/clientes')
    revalidatePath('/projects')
    return { ok: true, mensaje: `Cliente "${name}" creado.` }
  } catch {
    return { ok: false, mensaje: 'No se pudo crear el cliente.' }
  }
}

export async function updateCliente(formData: FormData): Promise<Resultado> {
  const id = formData.get('id') as string
  const name = (formData.get('name') as string)?.trim()
  if (!id || !name) return { ok: false, mensaje: 'Falta el nombre del cliente.' }

  try {
    const supabase = await createClient()
    const { data: datos, error } = await supabase
      .from('clients')
      .update({
        name,
        address: clean(formData.get('address')),
        phone: clean(formData.get('phone')),
        contact_name: clean(formData.get('contact_name')),
        contact_email: clean(formData.get('contact_email')),
        tier: clean(formData.get('tier')),
        billing_code: clean(formData.get('billing_code')),
      })
      .eq('id', id)
      // `.select()` es lo que permite contar filas. Sin esto, un UPDATE que
      // RLS bloquea devuelve cero filas SIN error y la pantalla dice "guardado".
      .select('id')
    if (error) return { ok: false, mensaje: traducir(error, 'guardar los cambios') }
    if (!datos || datos.length === 0) {
      return { ok: false, mensaje: 'No se guardó nada: no tenés permiso sobre este cliente.' }
    }

    revalidatePath('/clientes')
    revalidatePath('/')
    revalidatePath('/projects')
    return { ok: true, mensaje: 'Cambios guardados.' }
  } catch {
    return { ok: false, mensaje: 'No se pudieron guardar los cambios.' }
  }
}

export async function deleteCliente(formData: FormData): Promise<Resultado> {
  if (!(await isAdmin())) return { ok: false, mensaje: NO_PERMISSION_MESSAGE }
  const id = formData.get('id') as string
  if (!id) return { ok: false, mensaje: 'Falta el cliente a eliminar.' }

  try {
    const supabase = await createClient()
    // La FK es ON DELETE RESTRICT: si quedan proyectos, Postgres lo rechaza
    // y el error 23503 se traduce a un mensaje entendible.
    const { data: datos, error } = await supabase
      .from('clients').delete().eq('id', id).select('id')
    if (error) return { ok: false, mensaje: traducir(error, 'eliminar el cliente') }
    if (!datos || datos.length === 0) {
      return { ok: false, mensaje: NO_PERMISSION_MESSAGE }
    }

    revalidatePath('/clientes')
    revalidatePath('/')
    revalidatePath('/projects')
    return { ok: true, mensaje: 'Cliente eliminado.' }
  } catch {
    return { ok: false, mensaje: 'No se pudo eliminar el cliente.' }
  }
}
