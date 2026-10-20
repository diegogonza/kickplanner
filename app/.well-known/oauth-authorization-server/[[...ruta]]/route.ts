/**
 * Respaldo para clientes MCP antiguos que buscan los metadatos del servidor de
 * autorización en el mismo dominio del recurso, en vez de seguir
 * /.well-known/oauth-protected-resource. Devuelve tal cual los de Supabase Auth.
 */

export const revalidate = 3600

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': '*',
}

export async function GET() {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')
  const res = await fetch(`${supabase}/.well-known/oauth-authorization-server/auth/v1`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return Response.json({ error: 'authorization_server_unavailable' }, { status: 502, headers: CORS })
  }
  return Response.json(await res.json(), { headers: CORS })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
