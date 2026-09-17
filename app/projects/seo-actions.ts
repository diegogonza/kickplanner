'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

/**
 * Acciones de la pantalla "Datos de Search Console" de un proyecto.
 *
 * Ninguna tira excepción: todas devuelven `{ ok, mensaje }` para que la
 * pantalla muestre un aviso y siga viva.
 *
 * Nota de diseño: la propiedad se ELIGE de una lista, no se escribe a mano.
 * La primera versión la pedía escrita con el argumento de que listarlas
 * obligaría a darle a la app el refresh token de la agencia. Era falso: la
 * Edge Function ya tiene las credenciales y corre fuera de la app, así que
 * puede devolver la lista sin que el token pase por Next. El costo de aquella
 * decisión fue real — "sc-domain:stevia.com.co" no existía, la propiedad era
 * "https://stevia.com.co/", y el error decía "sin permiso". Un dato que el
 * sistema puede saber solo no se le pregunta a una persona.
 */

type R = { ok: boolean; mensaje: string }

/** Formatos válidos en Search Console. */
export async function normalizarPropiedad(valor: string): Promise<string | null> {
  const v = valor.trim()
  if (!v) return null
  if (v.startsWith('sc-domain:')) {
    const d = v.slice('sc-domain:'.length).trim().toLowerCase()
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? `sc-domain:${d}` : null
  }
  if (/^https?:\/\//i.test(v)) return v.endsWith('/') ? v : `${v}/`
  // Un dominio suelto se interpreta como propiedad de dominio.
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return `sc-domain:${v.toLowerCase()}`
  return null
}

export async function vincularPropiedad(projectId: string, siteUrl: string): Promise<R> {
  try {
    const limpio = await normalizarPropiedad(siteUrl)
    if (!limpio) {
      return {
        ok: false,
        mensaje:
          'Formato no reconocido. Usá "sc-domain:ejemplo.com" para una propiedad de dominio, ' +
          'o "https://ejemplo.com/" para una de prefijo de URL.',
      }
    }

    const supabase = await createClient()
    // Cambiar de propiedad invalida el historial: se limpia backfilled_at para
    // que la próxima corrida vuelva a traer los 16 meses.
    const { error } = await supabase.from('gsc_properties').upsert(
      { project_id: projectId, site_url: limpio, backfilled_at: null, last_error: null },
      { onConflict: 'project_id' }
    )
    if (error) return { ok: false, mensaje: 'No se pudo guardar la propiedad.' }

    revalidatePath(`/projects/${projectId}/seo`)
    return {
      ok: true,
      mensaje: `Propiedad ${limpio} vinculada. Sincronizá para traer el historial.`,
    }
  } catch {
    return { ok: false, mensaje: 'No se pudo guardar la propiedad.' }
  }
}

export async function desvincularPropiedad(projectId: string): Promise<R> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('gsc_properties').delete().eq('project_id', projectId)
    if (error) return { ok: false, mensaje: 'No se pudo desvincular.' }
    revalidatePath(`/projects/${projectId}/seo`)
    revalidatePath(`/projects/${projectId}`)
    return { ok: true, mensaje: 'Propiedad desvinculada. El portal deja de mostrar datos de búsqueda.' }
  } catch {
    return { ok: false, mensaje: 'No se pudo desvincular.' }
  }
}

/**
 * Llama a la Edge Function con la sesión del usuario.
 *
 * La función exige JWT válido, así que solo la dispara alguien del equipo ya
 * autenticado; la service role key nunca entra a la app.
 */
async function llamarFuncion(
  cuerpo: Record<string, unknown>
): Promise<{ ok: false; mensaje: string } | { ok: true; datos: Record<string, unknown> }> {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: false, mensaje: 'Tu sesión expiró. Volvé a iniciar sesión.' }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return { ok: false, mensaje: 'Falta NEXT_PUBLIC_SUPABASE_URL en la configuración.' }

  const r = await fetch(`${base}/functions/v1/gsc-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  })

  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    return {
      ok: false,
      mensaje: (datos.error as string) ?? `El servicio respondió HTTP ${r.status}.`,
    }
  }
  return { ok: true, datos }
}

export type PropiedadGoogle = { siteUrl: string; permissionLevel: string }

/** Propiedades que ve la cuenta conectada, para elegir en vez de adivinar. */
export async function propiedadesDisponibles(): Promise<
  { ok: true; propiedades: PropiedadGoogle[] } | { ok: false; mensaje: string }
> {
  try {
    const r = await llamarFuncion({ mode: 'diagnostico' })
    if (!r.ok) return { ok: false, mensaje: r.mensaje }
    const lista = (r.datos.propiedades ?? []) as PropiedadGoogle[]
    if (lista.length === 0) {
      return {
        ok: false,
        mensaje: 'La cuenta de Google conectada no tiene propiedades en Search Console.',
      }
    }
    return { ok: true, propiedades: lista }
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servicio de sincronización.' }
  }
}

/** Dispara la Edge Function para este proyecto, sin esperar al cron. */
export async function sincronizarAhora(projectId: string): Promise<R> {
  try {
    const previo = await llamarFuncion({ project_id: projectId })
    if (!previo.ok) return { ok: false, mensaje: previo.mensaje }

    const j = previo.datos as {
      errores?: { error: string }[]
      resultados?: { meses: number; palabras: number }[]
    }
    if (j.errores && j.errores.length > 0) return { ok: false, mensaje: j.errores[0].error }

    const res = j.resultados?.[0]
    revalidatePath(`/projects/${projectId}/seo`)
    revalidatePath(`/projects/${projectId}`)
    return {
      ok: true,
      mensaje: res
        ? `Listo: ${res.meses} meses de tráfico y ${res.palabras} palabras clave.`
        : 'Sincronización completada, pero no llegaron datos. Revisá que la propiedad sea correcta.',
    }
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servicio de sincronización.' }
  }
}
