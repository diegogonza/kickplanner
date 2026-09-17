/**
 * Cliente de Google OAuth + Search Console.
 *
 * Regla de esta capa: NINGUNA función tira una excepción hacia arriba. Todas
 * devuelven `{ ok: true, ... }` o `{ ok: false, error }` con un mensaje ya
 * escrito para mostrarle a una persona. Quien las llama decide qué hacer;
 * nunca recibe un stack trace ni una pantalla rota.
 */

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

/** Falta alguna variable de entorno: se avisa una sola vez y con nombre propio. */
export function configuracionGoogle(): Resultado<{
  clientId: string
  clientSecret: string
  redirectUri: string
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  const faltan = [
    !clientId && 'GOOGLE_CLIENT_ID',
    !clientSecret && 'GOOGLE_CLIENT_SECRET',
    !redirectUri && 'GOOGLE_REDIRECT_URI',
  ].filter(Boolean)

  if (faltan.length > 0) {
    return {
      ok: false,
      error: `Falta configurar ${faltan.join(', ')} en .env.local. Sin eso no se puede conectar Google.`,
    }
  }
  return { ok: true, data: { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri! } }
}

/** URL de consentimiento. `prompt=consent` fuerza que Google mande refresh
 *  token incluso si la cuenta ya autorizó antes. */
export function urlDeConsentimiento(state: string): Resultado<string> {
  const cfg = configuracionGoogle()
  if (!cfg.ok) return cfg

  const p = new URLSearchParams({
    client_id: cfg.data.clientId,
    redirect_uri: cfg.data.redirectUri,
    response_type: 'code',
    scope: `${GOOGLE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return { ok: true, data: `${AUTH_URL}?${p.toString()}` }
}

async function postForm(url: string, body: Record<string, string>): Promise<Resultado<Record<string, unknown>>> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      cache: 'no-store',
    })
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      const desc = (json.error_description ?? json.error ?? `HTTP ${r.status}`) as string
      return { ok: false, error: `Google respondió: ${desc}` }
    }
    return { ok: true, data: json }
  } catch {
    return { ok: false, error: 'No se pudo contactar a Google. Revisá la conexión e intentá de nuevo.' }
  }
}

/** Canjea el código del callback por tokens. */
export async function canjearCodigo(
  code: string
): Promise<Resultado<{ refreshToken: string; accessToken: string }>> {
  const cfg = configuracionGoogle()
  if (!cfg.ok) return cfg

  const r = await postForm(TOKEN_URL, {
    code,
    client_id: cfg.data.clientId,
    client_secret: cfg.data.clientSecret,
    redirect_uri: cfg.data.redirectUri,
    grant_type: 'authorization_code',
  })
  if (!r.ok) return r

  const refreshToken = r.data.refresh_token as string | undefined
  const accessToken = r.data.access_token as string | undefined

  if (!refreshToken) {
    // Pasa cuando la cuenta ya autorizó y Google decide no reenviarlo. Con
    // prompt=consent no debería, pero si ocurre hay que decir qué hacer.
    return {
      ok: false,
      error:
        'Google no devolvió un token de refresco. Quitá el acceso de KickPlanner en ' +
        'la cuenta de Google (myaccount.google.com/permissions) y volvé a conectar.',
    }
  }
  if (!accessToken) return { ok: false, error: 'Google no devolvió un token de acceso.' }

  return { ok: true, data: { refreshToken, accessToken } }
}

/** Con qué cuenta quedó conectado. Si falla, no es grave: se guarda sin correo. */
export async function correoDeLaCuenta(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!r.ok) return null
    const j = (await r.json()) as { email?: string }
    return j.email ?? null
  } catch {
    return null
  }
}

/** Access token nuevo a partir del refresh token. Lo usa el job de ingesta. */
export async function refrescarAccessToken(refreshToken: string): Promise<Resultado<string>> {
  const cfg = configuracionGoogle()
  if (!cfg.ok) return cfg

  const r = await postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: cfg.data.clientId,
    client_secret: cfg.data.clientSecret,
    grant_type: 'refresh_token',
  })
  if (!r.ok) {
    // invalid_grant = el token murió (revocado, o la app volvió a modo prueba).
    if (r.error.includes('invalid_grant')) {
      return {
        ok: false,
        error: 'La conexión con Google expiró o fue revocada. Hay que volver a conectarla desde Ajustes.',
      }
    }
    return r
  }
  const at = r.data.access_token as string | undefined
  return at ? { ok: true, data: at } : { ok: false, error: 'Google no devolvió un token de acceso.' }
}

/** Propiedades de Search Console a las que la cuenta conectada tiene acceso. */
export async function listarPropiedades(
  accessToken: string
): Promise<Resultado<{ siteUrl: string; permiso: string }[]>> {
  try {
    const r = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!r.ok) {
      return { ok: false, error: `No se pudieron listar las propiedades (HTTP ${r.status}).` }
    }
    const j = (await r.json()) as {
      siteEntry?: { siteUrl: string; permissionLevel: string }[]
    }
    const sitios = (j.siteEntry ?? [])
      .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
      .map((s) => ({ siteUrl: s.siteUrl, permiso: s.permissionLevel }))
    return { ok: true, data: sitios }
  } catch {
    return { ok: false, error: 'No se pudo contactar a Search Console.' }
  }
}
