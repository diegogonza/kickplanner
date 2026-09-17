'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  PORTAL_COOKIE,
  abrirSesionEquipo,
  portalKeywords,
  portalLogin,
  portalLogout,
  type KeywordsPortal,
} from './data'

const TREINTA_DIAS = 60 * 60 * 24 * 30
const OCHO_HORAS = 60 * 60 * 8

export async function entrarAlPortal(formData: FormData) {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!slug) redirect('/portal')

  const token = await portalLogin(slug, password)
  if (!token) redirect(`/portal/${slug}?e=1`)

  const store = await cookies()
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/portal',
    maxAge: TREINTA_DIAS,
  })
  redirect(`/portal/${slug}`)
}

export async function salirDelPortal(formData: FormData) {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const store = await cookies()
  const token = store.get(PORTAL_COOKIE)?.value
  if (token) await portalLogout(token)
  store.delete({ name: PORTAL_COOKIE, path: '/portal' })
  redirect(`/portal/${slug}`)
}


/**
 * Entrada del equipo, sin contraseña.
 *
 * Por qué es un botón y no automático: en Next.js una cookie solo se puede
 * escribir desde una server action o un route handler, nunca mientras se
 * dibuja una página. Y la cookie hace falta para que el resto del portal
 * funcione igual que para el cliente, sin duplicar una sola consulta.
 *
 * El clic tiene además un beneficio: deja explícito que estás entrando a la
 * vista del CLIENTE, no a una pantalla interna.
 */
export async function entrarComoEquipo(formData: FormData) {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  if (!slug) redirect('/portal')

  const token = await abrirSesionEquipo(slug)
  if (!token) redirect(`/portal/${slug}?e=1`)

  const store = await cookies()
  store.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/portal',
    maxAge: OCHO_HORAS,
  })
  redirect(`/portal/${slug}`)
}


/**
 * Detalle de palabras clave de un rango, para el desplegable de la tarjeta.
 *
 * El token NO viaja como argumento: se lee de la cookie httpOnly acá adentro.
 * Una server action es un endpoint POST que cualquiera puede llamar, así que si
 * el token viniera del cliente bastaría con mandar el de otro para ver sus
 * datos. Además portal_keywords() comprueba en Postgres que el proyecto sea de
 * ese cliente, así que un id de proyecto ajeno devuelve null.
 */
export async function verKeywords(
  projectId: string,
  tope: number
): Promise<KeywordsPortal | null> {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value
  if (!token) return null
  return portalKeywords(token, projectId, tope)
}
