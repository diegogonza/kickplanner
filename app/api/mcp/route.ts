import { createMcpHandler } from 'mcp-handler'
import { conSesionMcp, resolverConexion } from '@/utils/supabase/mcp'
import { registrarHerramientas } from './tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const mcp = createMcpHandler(
  (server) => {
    registrarHerramientas(server)
  },
  {
    serverInfo: { name: 'kickplanner', version: '1.0.0' },
    instructions:
      'KickPlanner es el gestor de proyectos de la agencia KickRanking (clon de Asana). ' +
      'Cada proyecto pertenece a un cliente y es de tipo seo o web. Las tareas tienen estado ' +
      'todo/doing/done y prioridad urgente/alta/media/baja. Actuas con la identidad del miembro ' +
      'que genero la conexion, asi que solo ves sus proyectos. Para actuar sobre un proyecto o una ' +
      'persona, obtene primero su id con listar_proyectos o listar_personas: nunca inventes uuids.',
  }
)

function tokenDeLaPeticion(request: Request): string {
  const cabecera = request.headers.get('authorization') ?? ''
  return cabecera.toLowerCase().startsWith('bearer ') ? cabecera.slice(7).trim() : ''
}

function json(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json', ...cabeceras },
  })
}

async function manejar(request: Request): Promise<Response> {
  const token = tokenDeLaPeticion(request)
  if (!token) {
    return json(401, { error: 'Falta el token de conexion' }, { 'www-authenticate': 'Bearer realm="kickplanner-mcp"' })
  }

  let sesion
  try {
    sesion = await resolverConexion(token)
  } catch (e) {
    // El detalle puede incluir configuracion del servidor: al log, no al cliente.
    console.error('[mcp] resolverConexion:', e)
    return json(500, { error: 'No se pudo resolver la conexion. Revisa los logs del servidor.' })
  }

  if (!sesion) {
    return json(401, {
      error: 'Conexion invalida o expirada. Genera una nueva desde Ajustes > Conexion con Claude.',
    })
  }

  return conSesionMcp(sesion, () => mcp(request))
}

export { manejar as GET, manejar as POST, manejar as DELETE }
