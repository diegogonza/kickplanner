import { AsyncLocalStorage } from 'node:async_hooks'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Identidad del servidor MCP.
 *
 * Cada miembro genera su propia conexion desde /ajustes. Al crearla, la app
 * inicia una sesion independiente de Supabase con su email y contrasena (la
 * contrasena no se guarda) y almacena cifrado unicamente el refresh token. En
 * cada peticion MCP el token del cliente se traduce a esa sesion, de modo que
 * las consultas viajan con el JWT de esa persona y se aplican las mismas
 * politicas RLS que en la interfaz. La app nunca usa la service role key.
 */

export type McpSession = { db: SupabaseClient; userId: string; connectionId: string }

const contexto = new AsyncLocalStorage<McpSession>()

/** Ejecuta el handler MCP con la sesion del miembro que presento el token. */
export function conSesionMcp<T>(sesion: McpSession, fn: () => T): T {
  return contexto.run(sesion, fn)
}

/** Sesion del miembro para la peticion MCP en curso. */
export async function getMcpSession(): Promise<McpSession> {
  const sesion = contexto.getStore()
  if (!sesion) throw new Error('No hay sesion MCP en el contexto de la peticion')
  return sesion
}

/* ------------------------------- Cifrado -------------------------------- */

function claveCifrado(): Buffer {
  const raw = process.env.MCP_ENCRYPTION_KEY
  if (!raw) throw new Error('Falta MCP_ENCRYPTION_KEY en el entorno')
  const clave = Buffer.from(raw, 'base64')
  if (clave.length !== 32) throw new Error('MCP_ENCRYPTION_KEY debe ser 32 bytes en base64')
  return clave
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', claveCifrado(), iv)
  const datos = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), datos]).toString('base64')
}

export function descifrar(paquete: string): string {
  const bruto = Buffer.from(paquete, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', claveCifrado(), bruto.subarray(0, 12))
  decipher.setAuthTag(bruto.subarray(12, 28))
  return Buffer.concat([decipher.update(bruto.subarray(28)), decipher.final()]).toString('utf8')
}

/* -------------------------------- Tokens -------------------------------- */

export function generarToken(): { token: string; hash: string; prefijo: string } {
  const token = `kp_${randomBytes(32).toString('base64url')}`
  return { token, hash: hashToken(token), prefijo: token.slice(0, 11) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/* ------------------------------- Sesiones ------------------------------- */

function clienteAnonimo(cabeceras?: Record<string, string>): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(cabeceras ? { global: { headers: cabeceras } } : {}),
  })
}

type Cacheada = { db: SupabaseClient; userId: string; expiraEn: number }
const cache = new Map<string, Cacheada>()

type FilaConexion = { connection_id: string; user_id: string; refresh_token_enc: string }

type SesionRenovada = { accessToken: string; refreshToken: string; userId: string; expiraEn: number }

/** Lee la fila de la conexion. Devuelve null si el token no existe o fue desconectado. */
async function leerConexion(anon: SupabaseClient, hash: string): Promise<FilaConexion | null> {
  const { data, error } = await anon.rpc('mcp_resolve_connection', { p_token_hash: hash })
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaConexion[])[0] ?? null
}

/**
 * Canjea el refresh token guardado por una sesion nueva. Devuelve null si el
 * blob no se puede descifrar (clave rotada) o si Supabase rechaza el token.
 */
async function renovarSesion(anon: SupabaseClient, blobCifrado: string): Promise<SesionRenovada | null> {
  let refreshToken: string
  try {
    refreshToken = descifrar(blobCifrado)
  } catch {
    return null
  }

  const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session || !data.user) return null

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.user.id,
    expiraEn: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3000,
  }
}

/**
 * Traduce el token presentado por el cliente MCP a una sesion de Supabase.
 * Devuelve null si el token no existe, fue desconectado o su sesion ya no sirve.
 */
export async function resolverConexion(token: string): Promise<McpSession | null> {
  if (!token.startsWith('kp_')) return null

  const hash = hashToken(token)
  const anon = clienteAnonimo()
  const fila = await leerConexion(anon, hash)
  if (!fila) return null

  const ahora = Math.floor(Date.now() / 1000)
  const cacheada = cache.get(fila.connection_id)
  if (cacheada && cacheada.expiraEn - 120 > ahora) {
    return { db: cacheada.db, userId: cacheada.userId, connectionId: fila.connection_id }
  }

  let renovada = await renovarSesion(anon, fila.refresh_token_enc)

  // Otra instancia pudo haber rotado el refresh token entre nuestra lectura y el
  // canje. Releemos una vez y reintentamos solo si el blob guardado ya es otro.
  if (!renovada) {
    const relectura = await leerConexion(anon, hash)
    if (relectura && relectura.refresh_token_enc !== fila.refresh_token_enc) {
      renovada = await renovarSesion(anon, relectura.refresh_token_enc)
    }
  }

  if (!renovada) {
    cache.delete(fila.connection_id)
    return null
  }

  await anon.rpc('mcp_store_refresh', {
    p_token_hash: hash,
    p_refresh_token_enc: cifrar(renovada.refreshToken),
  })

  const db = clienteAnonimo({ Authorization: `Bearer ${renovada.accessToken}` })
  cache.set(fila.connection_id, { db, userId: renovada.userId, expiraEn: renovada.expiraEn })

  return { db, userId: renovada.userId, connectionId: fila.connection_id }
}

/**
 * Crea una sesion independiente de la del navegador para el miembro y devuelve
 * su refresh token cifrado, listo para guardar. La contrasena no se persiste.
 */
export async function sesionParaConexion(email: string, password: string): Promise<string> {
  const anon = clienteAnonimo()
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(error?.message ?? 'No se pudo verificar la contrasena')
  return cifrar(data.session.refresh_token)
}
