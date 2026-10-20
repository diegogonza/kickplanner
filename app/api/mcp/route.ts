import { createMcpHandler } from 'mcp-handler'
import { conSesionMcp, sesionDesdeToken } from '@/utils/supabase/mcp'
import { urlPublica } from '@/app/lib/url-publica'
import { registrarHerramientas } from './tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const mcp = createMcpHandler(
  (server) => {
    registrarHerramientas(server)
  },
  {
    serverInfo: { name: 'kickplanner', version: '2.0.0' },
    instructions:
      'KickPlanner es el gestor de proyectos de la agencia KickRanking (clon de Asana). ' +
      'Cada proyecto pertenece a un cliente y es de tipo seo o web. Las tareas tienen estado ' +
      'todo/doing/done y prioridad urgente/alta/media/baja. Actuas con la identidad del miembro ' +
      'que autorizo la conexion, asi que solo ves sus proyectos. Para actuar sobre un proyecto o una ' +
      'persona, obtene primero su id con listar_proyectos o listar_personas: nunca inventes uuids.',
  }
)

function tokenDeLaPeticion(request: Request): string {
  const cabecera = request.headers.get('authorization') ?? ''
  return cabecera.toLowerCase().startsWith('bearer ') ? cabecera.slice(7).trim() : ''
}

/**
 * 401 con el puntero a los metadatos del recurso protegido (RFC 9728). Es lo
 * que dispara el flujo OAuth en Claude: lee esa URL, descubre que el servidor
 * de autorización es Supabase Auth y abre el login.
 */
function noAutorizado(request: Request, mensaje: string, codigo = 'invalid_token') {
  const metadatos = `${urlPublica(request)}/.well-known/oauth-protected-resource/api/mcp`
  return new Response(JSON.stringify({ error: codigo, error_description: mensaje }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer realm="kickplanner", error="${codigo}", resource_metadata="${metadatos}"`,
    },
  })
}

async function manejar(request: Request): Promise<Response> {
  const token = tokenDeLaPeticion(request)
  if (!token) return noAutorizado(request, 'Falta el token de acceso', 'invalid_request')

  let sesion
  try {
    sesion = await sesionDesdeToken(token)
  } catch (e) {
    // El detalle puede incluir configuración del servidor: al log, no al cliente.
    console.error('[mcp] sesionDesdeToken:', e)
    return new Response(JSON.stringify({ error: 'server_error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!sesion) return noAutorizado(request, 'Token inválido o vencido')

  return conSesionMcp(sesion, () => mcp(request))
}

export { manejar as GET, manejar as POST, manejar as DELETE }
