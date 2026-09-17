// Módulo ÚNICO de lectura del portal de clientes.
//
// Regla: ninguna página del portal consulta Supabase por su cuenta. Todo pasa
// por acá, y todo pasa por una función `portal_*` de Postgres que resuelve el
// token de sesión a un client_id y filtra por él. El navegador del cliente
// nunca habla con Supabase: estas llamadas corren siempre en el servidor.
//
// No hace falta la service role key: las funciones son SECURITY DEFINER y
// exigen un token de sesión válido (32 bytes aleatorios guardados en
// portal_sessions), así que la clave anónima por sí sola no devuelve nada.

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/utils/supabase/server'

export const PORTAL_COOKIE = 'kp_portal'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export type PortalMe = { client_id: string; client_name: string; slug: string }

export type PortalProject = {
  id: string
  name: string
  type: string
  start_date: string | null
  total: number
  done: number
  running: number
  files: number
  pct: number
}

export type PortalTask = {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done'
  due_date: string | null
  drive_url: string | null
  closed_on: string | null
  /** Etiqueta interna del equipo. La traducción a "categoría" de cara al
   *  cliente vive en activities.tsx. */
  tag: string | null
}

export type PortalDetail = {
  project: { id: string; name: string; type: string; start_date: string | null }
  total: number
  done: number
  running: number
  pct: number
  tasks: PortalTask[]
}

/** Valida la contraseña y abre sesión. Devuelve el token, o null. */
export async function portalLogin(slug: string, password: string): Promise<string | null> {
  const { data, error } = await sb().rpc('portal_login', {
    p_slug: slug,
    p_password: password,
  })
  if (error) return null
  return (data as string | null) ?? null
}

export async function portalLogout(token: string): Promise<void> {
  await sb().rpc('portal_logout', { p_token: token })
}

/** Quién es el dueño de esta sesión. null si el token venció o se revocó. */
export async function portalMe(token: string): Promise<PortalMe | null> {
  const { data, error } = await sb().rpc('portal_me', { p_token: token })
  if (error) return null
  const rows = (data ?? []) as PortalMe[]
  return rows[0] ?? null
}

export async function portalProjects(token: string): Promise<PortalProject[]> {
  const { data, error } = await sb().rpc('portal_projects', { p_token: token })
  if (error) return []
  return (data ?? []) as PortalProject[]
}

export async function portalProject(
  token: string,
  projectId: string
): Promise<PortalDetail | null> {
  const { data, error } = await sb().rpc('portal_project', {
    p_token: token,
    p_project_id: projectId,
  })
  if (error || !data) return null
  return data as PortalDetail
}

// ---------- Formato ----------

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '2026-09-11' → '11 sep 2026'. Sin Date, para no correr la fecha por zona horaria. */
export function fechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`
}

/** '2026-02-10' → 'febrero de 2026' */
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
export function mesLargo(iso: string | null): string | null {
  if (!iso) return null
  const [y, m] = iso.split('-')
  return `${MESES_LARGOS[Number(m) - 1]} de ${y}`
}

/** Meses transcurridos desde el inicio, para el subtítulo del proyecto. */
export function mesesDesde(iso: string | null): number | null {
  if (!iso) return null
  const [y, m] = iso.split('-').map(Number)
  const hoy = new Date()
  return (hoy.getUTCFullYear() - y) * 12 + (hoy.getUTCMonth() + 1 - m)
}

// ---------- Search Console ----------

/**
 * Datos de búsqueda del proyecto para el portal.
 *
 * portal_seo() nunca falla: si no hay propiedad vinculada o todavía no llegaron
 * datos devuelve un estado, no un error. Igual se envuelve en try/catch y se
 * devuelve null ante cualquier problema de red: la tarjeta no se dibuja y el
 * portal sigue mostrando actividades.
 */
export async function portalSeo(
  token: string,
  projectId: string
): Promise<import('./seo-card').DatosSeo | null> {
  try {
    const { data, error } = await sb().rpc('portal_seo', {
      p_token: token,
      p_project_id: projectId,
    })
    if (error || !data) return null
    return data as import('./seo-card').DatosSeo
  } catch {
    return null
  }
}


/** Una palabra clave del detalle. */
export type KeywordPortal = {
  query: string
  clics: number
  impresiones: number
  posicion: number
}

export type KeywordsPortal = {
  estado: 'ok' | 'sin_datos'
  mes?: string
  tope?: number
  /** Primera y última posición de la banda que se está mostrando (4 y 10, por
   *  ejemplo). Las tarjetas son acumuladas; el desplegable NO. */
  desde?: number
  hasta?: number
  filas?: KeywordPortal[]
}

/**
 * Ejemplos de palabras clave de una banda de posición.
 *
 * Dos cosas que no son obvias:
 *
 * 1. La banda es EXCLUSIVA. La tarjeta "Top 10" cuenta de forma acumulada
 *    (incluye a las del Top 3), pero la lista devuelve solo las posiciones 4 a
 *    10. Cuando filtraba igual que la tarjeta, las cuatro listas mostraban las
 *    mismas palabras: las de más clics son justamente las mejor posicionadas.
 *
 * 2. Son EJEMPLOS, no la lista completa: la API de Search Console devuelve como
 *    mucho 1000 filas por consulta, así que lo guardado es la punta del iceberg
 *    ordenada por clics. Por eso la interfaz no muestra un conteo acá — chocaría
 *    con el número de la tarjeta, que sí es el total real.
 */
export async function portalKeywords(
  token: string,
  projectId: string,
  tope: number
): Promise<KeywordsPortal | null> {
  try {
    const { data, error } = await sb().rpc('portal_keywords', {
      p_token: token,
      p_project_id: projectId,
      p_tope: tope,
    })
    if (error || !data) return null
    return data as KeywordsPortal
  } catch {
    return null
  }
}

// ---------- Vista de equipo ----------

/**
 * Abre una sesión de portal para un miembro del equipo, sin contraseña.
 *
 * Usa el cliente CON COOKIES (no el anónimo del resto de este archivo): la
 * autorización la hace Postgres con auth.uid(), comprobando que esa persona
 * sea dueña del cliente o miembro de alguno de sus proyectos. Estar logueado
 * no alcanza.
 *
 * Devuelve null si no corresponde, y la puerta de contraseña sigue su curso.
 */
export async function abrirSesionEquipo(slug: string): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase.rpc('portal_sesion_equipo', { p_slug: slug })
    if (error) return null
    return (data as string | null) ?? null
  } catch {
    return null
  }
}

/** ¿Es alguien del equipo mirando, o el cliente? Decide si se avisa en pantalla. */
export async function esSesionDeEquipo(token: string): Promise<boolean> {
  try {
    const { data, error } = await sb().rpc('portal_es_equipo', { p_token: token })
    if (error) return false
    return data === true
  } catch {
    return false
  }
}

/** ¿La persona logueada puede ver este portal sin contraseña? */
export async function puedeVerComoEquipo(slug: string): Promise<boolean> {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { data } = await supabase
      .from('portal_access')
      .select('client_id')
      .eq('slug', slug.trim().toLowerCase())
      .maybeSingle()
    return Boolean(data?.client_id)
  } catch {
    return false
  }
}
