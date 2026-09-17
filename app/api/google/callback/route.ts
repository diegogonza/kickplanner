import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { canjearCodigo, correoDeLaCuenta } from '@/app/lib/google'

/**
 * Vuelta del consentimiento de Google.
 *
 * Todas las salidas terminan en /ajustes con un mensaje: ?google_ok=1 si salió
 * bien, ?google_error=<texto> si no. La página nunca recibe una excepción.
 *
 * El refresh token no se escribe en ningún archivo ni en ninguna tabla en
 * texto plano: va a Supabase Vault vía google_oauth_guardar().
 */
export async function GET(request: NextRequest) {
  const aAjustes = (params: string) =>
    NextResponse.redirect(new URL(`/ajustes?${params}`, request.url))
  const conError = (msg: string) => {
    const res = aAjustes(`google_error=${encodeURIComponent(msg)}`)
    res.cookies.delete({ name: 'google_oauth_state', path: '/api/google' })
    return res
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))

    const url = new URL(request.url)
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    // El usuario apretó "Cancelar" en la pantalla de Google.
    if (error) {
      return conError(
        error === 'access_denied'
          ? 'Cancelaste la conexión con Google. No se guardó nada.'
          : `Google devolvió un error: ${error}`
      )
    }
    if (!code) return conError('Google no devolvió el código de autorización.')

    const esperado = request.cookies.get('google_oauth_state')?.value
    if (!esperado || !state || state !== esperado) {
      return conError(
        'La solicitud no coincide con la que iniciamos (puede haber expirado). Probá conectar de nuevo.'
      )
    }

    const tokens = await canjearCodigo(code)
    if (!tokens.ok) return conError(tokens.error)

    // Si falla, no es grave: se guarda la conexión sin correo asociado.
    const email = await correoDeLaCuenta(tokens.data.accessToken)

    // El client id/secret viajan junto al refresh token para que el job de
    // ingesta, que corre fuera de la app y no ve .env.local, pueda pedir
    // access tokens sin duplicar la configuración en dos lugares.
    const { error: dbError } = await supabase.rpc('google_oauth_guardar', {
      p_refresh_token: tokens.data.refreshToken,
      p_email: email,
      p_client_id: process.env.GOOGLE_CLIENT_ID ?? null,
      p_client_secret: process.env.GOOGLE_CLIENT_SECRET ?? null,
    })
    if (dbError) {
      // El mensaje genérico dejaba este punto imposible de diagnosticar: Google
      // ya había autorizado y no quedaba rastro de POR QUÉ falló el guardado.
      // El detalle va completo a la consola del servidor y resumido a pantalla.
      // Es una pantalla del equipo, no del cliente, y el error de Postgres no
      // contiene el refresh token: nunca viaja en el mensaje.
      console.error('[google/callback] google_oauth_guardar falló:', dbError)
      const detalle = [dbError.code, dbError.message].filter(Boolean).join(' · ').slice(0, 180)
      return conError(
        `Google autorizó, pero no se pudo guardar la conexión.${detalle ? ` (${detalle})` : ''}`
      )
    }

    const ok = aAjustes('google_ok=1')
    ok.cookies.delete({ name: 'google_oauth_state', path: '/api/google' })
    return ok
  } catch {
    return conError('Ocurrió un problema al conectar con Google. No se guardó nada.')
  }
}
