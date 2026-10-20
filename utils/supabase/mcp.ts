import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Identidad del servidor MCP.
 *
 * Claude se conecta por OAuth 2.1 contra el servidor OAuth de Supabase Auth: el
 * miembro inicia sesión en KickPlanner, aprueba el acceso en /oauth/consent y
 * Supabase le entrega a Claude un access token propio de ese miembro. Ese token
 * es un JWT normal de Supabase (rol `authenticated`, con `client_id`), así que
 * las consultas viajan con la identidad de la persona y se aplican las mismas
 * políticas RLS que en la interfaz. La app nunca usa la service role key, no
 * guarda contraseñas ni tokens propios.
 */

export type McpSession = { db: SupabaseClient; userId: string; clientId: string | null }

const contexto = new AsyncLocalStorage<McpSession>()

/** Ejecuta el handler MCP con la sesión del miembro que presentó el token. */
export function conSesionMcp<T>(sesion: McpSession, fn: () => T): T {
  return contexto.run(sesion, fn)
}

/** Sesión del miembro para la petición MCP en curso. */
export async function getMcpSession(): Promise<McpSession> {
  const sesion = contexto.getStore()
  if (!sesion) throw new Error('No hay sesion MCP en el contexto de la peticion')
  return sesion
}

function clienteSupabase(accessToken?: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  })
}

/**
 * Valida el access token que presenta Claude y arma el cliente de Supabase con
 * la identidad del miembro. Devuelve null si el token no es válido, expiró o no
 * es de un usuario autenticado (el MCP responde 401 y Claude lo renueva solo).
 */
export async function sesionDesdeToken(accessToken: string): Promise<McpSession | null> {
  // getClaims verifica firma y vencimiento contra el JWKS del proyecto (o contra
  // Auth si las claves son simétricas). Un error acá es un token inválido, no
  // una caída: se responde 401 para que el cliente renueve.
  const { data, error } = await clienteSupabase().auth.getClaims(accessToken)
  const claims = data?.claims
  if (error || !claims?.sub || claims.role !== 'authenticated') return null

  const clientId = typeof claims.client_id === 'string' ? claims.client_id : null
  return { db: clienteSupabase(accessToken), userId: claims.sub, clientId }
}
