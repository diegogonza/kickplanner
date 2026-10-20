/**
 * Origen público de la app (sin barra final).
 *
 * Usa NEXT_PUBLIC_SITE_URL cuando está configurada: la cabecera Host la
 * controla quien hace la petición y no conviene armar con ella URLs que
 * terminan en manos de un cliente OAuth. Sin la variable, cae al origen de la
 * propia petición (en Vercel es el dominio real).
 */
export function urlPublica(request?: Request): string {
  const sitio = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  if (sitio) return sitio
  if (request) return new URL(request.url).origin
  return 'http://localhost:3000'
}
