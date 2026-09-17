import { randomBytes } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { urlDeConsentimiento } from '@/app/lib/google'

/**
 * Arranca el flujo de OAuth con Google.
 *
 * Nunca devuelve un error crudo: cualquier problema vuelve a /ajustes con un
 * mensaje legible en ?google_error=, que la página muestra como aviso.
 */
export async function GET(request: NextRequest) {
  const volver = (msg: string) =>
    NextResponse.redirect(new URL(`/ajustes?google_error=${encodeURIComponent(msg)}`, request.url))

  try {
    // Solo el equipo puede conectar la cuenta de la agencia.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', request.url))

    const url = urlDeConsentimiento('')
    if (!url.ok) return volver(url.error)

    // state contra CSRF: se compara en el callback con la cookie.
    const state = randomBytes(16).toString('hex')
    const conState = urlDeConsentimiento(state)
    if (!conState.ok) return volver(conState.error)

    const res = NextResponse.redirect(conState.data)
    res.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/google',
      maxAge: 600, // 10 minutos: lo que dura razonablemente dar el consentimiento
    })
    return res
  } catch {
    return volver('No se pudo iniciar la conexión con Google. Intentá de nuevo.')
  }
}
