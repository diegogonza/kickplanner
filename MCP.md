# Servidor MCP de KickPlanner

Expone el gestor de proyectos a Claude (Claude Code, Cowork, Claude Desktop) como
un servidor MCP remoto que vive dentro de la propia app Next.js.

- **Endpoint:** `POST /api/mcp` (transporte Streamable HTTP, sin estado)
- **Autenticacion:** cabecera `Authorization: Bearer kp_...`, donde el token lo
  genera cada miembro desde **Ajustes > Conexion con Claude**.
- **Identidad:** cada token esta atado a la persona que lo creo. El servidor
  ejecuta las consultas con **el JWT de ese miembro**, asi que se aplican las
  mismas politicas RLS que en la interfaz: Claude ve y modifica exactamente lo
  que ve y modifica esa persona, ni mas ni menos. La app **no usa la service
  role key** en ningun punto.

## Como funciona la conexion

1. En `/ajustes` el miembro escribe un nombre para la conexion y **su
   contrasena**. La app abre con ella una sesion de Supabase independiente de la
   del navegador (la contrasena no se guarda en ningun lado).
2. Se guarda el `refresh_token` de esa sesion **cifrado con AES-256-GCM**
   (`MCP_ENCRYPTION_KEY`) en `mcp_connection_secrets`, una tabla con RLS activo y
   sin politicas: solo la alcanzan las funciones `security definer`.
3. Se genera un token `kp_...`, se guarda **solo su hash SHA-256** y se muestra
   una unica vez.
4. En cada peticion MCP: hash del token -> `mcp_resolve_connection` -> refresh de
   la sesion -> cliente de Supabase con ese JWT -> herramientas.

Como la sesion del MCP es independiente de la del navegador, cerrar sesion en la
web no rompe la conexion (`signOut` usa `scope: 'local'`). Si aun asi la sesion
caduca, el MCP responde 401 con un mensaje claro y basta con volver a conectar
desde Ajustes.

## Archivos

| Archivo | Que hace |
| --- | --- |
| `app/api/mcp/route.ts` | Traduce el Bearer token a la sesion del miembro y delega en `mcp-handler` |
| `app/api/mcp/tools.ts` | Definicion de las 13 herramientas |
| `utils/supabase/mcp.ts` | Cifrado, generacion de tokens, resolucion de conexiones y contexto por peticion |
| `app/components/mcp-connections.tsx` | UI de "Conexion con Claude" en Ajustes |
| `app/ajustes/actions.ts` | `conectarClaude` / `desconectarClaude` |
| `db/migrations/002_mcp_connections.sql` | Tablas `mcp_connections` y `mcp_connection_secrets` + RPCs |
| `db/migrations/003_mcp_connections_hardening.sql` | Throttle de `last_used_at` y tope de 10 conexiones por persona |
| `utils/supabase/middleware.ts` | Excluye `/api/mcp` del redirect a `/login` |

## Configuracion

En `.env.local` y en el hosting:

```
MCP_ENCRYPTION_KEY=<32 bytes en base64>   # obligatoria
NEXT_PUBLIC_SITE_URL=https://tu-dominio   # opcional pero recomendada
```

`NEXT_PUBLIC_SITE_URL` fija el endpoint que se muestra en Ajustes. Sin ella se
usa la cabecera `Host`, que la controla quien hace la peticion: con un `Host`
falsificado el comando que copias (token incluido) podria apuntar a otro
dominio.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Si se cambia esta clave, todos los miembros tienen que volver a conectar Claude.

## Herramientas

**Lectura**

| Herramienta | Para que sirve |
| --- | --- |
| `listar_proyectos` | Proyectos con cliente, estado, tipo, responsable, tareas y vencidas |
| `buscar_tareas` | Busqueda con filtros de texto, proyecto, estado, responsable y vencimiento |
| `mis_tareas` | Tareas abiertas del miembro, agrupadas por vencidas / hoy / semana / despues |
| `detalle_tarea` | Tarea completa con subtareas, comentarios e historial |
| `historial_estados_proyecto` | Ultimas actualizaciones de estado de un proyecto |
| `listar_personas` | Personas del workspace (para traducir nombre a id) |
| `listar_clientes` | Clientes con su numero de proyectos SEO y web |
| `resumen_pagos` | Cuotas recurrentes e installments por proyecto |
| `panel_agencia` | Resumen ejecutivo del workspace |

**Escritura**

| Herramienta | Para que sirve |
| --- | --- |
| `crear_tarea` | Crea tarea o subtarea en un proyecto |
| `actualizar_tarea` | Cambia titulo, descripcion, estado, prioridad, fecha, responsable, Drive |
| `completar_tarea` | Marca como completada o reabre |
| `comentar_tarea` | Publica comentario, con menciones opcionales |
| `actualizar_estado_proyecto` | Publica una actualizacion de estado del proyecto |

Las escrituras quedan registradas en `task_activity` a nombre del miembro, igual
que si las hubiera hecho desde la interfaz.

## Probarlo

```bash
npm run dev
# genera un token en http://localhost:3000/ajustes y pegalo aqui
TOKEN=kp_...
curl -s -X POST http://localhost:3000/api/mcp \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Sin cabecera `authorization`, o con un token revocado, debe responder `401`.

Para probar una herramienta:

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"listar_proyectos","arguments":{}}}'
```

## Conectarlo a Claude

### Claude Code / Cowork

El propio Ajustes te da el comando listo para copiar:

```bash
claude mcp add --transport http kickplanner https://TU-DOMINIO/api/mcp \
  --header "Authorization: Bearer kp_..."
```

### Claude Desktop

Los conectores personalizados esperan OAuth, asi que para un token fijo se usa el
puente `mcp-remote` en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kickplanner": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://TU-DOMINIO/api/mcp",
        "--header", "Authorization: Bearer kp_..."
      ]
    }
  }
}
```

## Notas de seguridad

- El token se guarda hasheado (SHA-256); en la lista de Ajustes solo se ve su
  prefijo. Si se pierde, se desconecta y se genera otro.
- `mcp_resolve_connection` y `mcp_store_refresh` son `security definer` y estan
  abiertas al rol `anon` porque el endpoint las llama con la anon key. Ambas
  exigen el hash del token, que no es adivinable (256 bits de aleatoriedad), y
  lo unico que devuelven es un refresh token cifrado, inservible sin
  `MCP_ENCRYPTION_KEY`. El linter de Supabase las marca por esto: es
  intencional.
- Desconectar en Ajustes borra la fila y su secreto: el token deja de servir en
  la siguiente peticion, aunque la sesion siga cacheada en memoria (cada
  peticion resuelve contra la base antes de mirar la cache).
- Cada persona puede tener hasta 10 conexiones vivas.
- Si otra instancia rota el refresh token entre la lectura y el canje, el
  servidor relee y reintenta una vez antes de responder 401.
- Servir siempre por HTTPS: el token viaja en la cabecera.
