import { urlPublica } from '@/app/lib/url-publica'

/**
 * Metadatos del recurso protegido (RFC 9728) para el servidor MCP.
 *
 * Responde tanto en /.well-known/oauth-protected-resource como en
 * /.well-known/oauth-protected-resource/api/mcp (la variante con la ruta del
 * recurso, que es la que piden los clientes MCP primero). Le dice a Claude que
 * el servidor de autorización es Supabase Auth.
 */

export const dynamic = 'force-dynamic'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': '*',
}

export function GET(request: Request) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
  const base = urlPublica(request)

  return Response.json(
    {
      resource: `${base}/api/mcp`,
      authorization_servers: [`${supabase}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'KickPlanner',
    },
    { headers: { ...CORS, 'cache-control': 'public, max-age=3600' } }
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
