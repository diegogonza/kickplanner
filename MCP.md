# Servidor MCP de KickPlanner

Expone el gestor de proyectos a Claude como un servidor MCP remoto que vive
dentro de la propia app Next.js. Se conecta **como cualquier conector**: una
URL y un "Autorizar". Sin contraseñas ni tokens que copiar.

- **Endpoint:** `/api/mcp` (Streamable HTTP, sin estado)
- **Autenticación:** OAuth 2.1 con PKCE, usando el **servidor OAuth de Supabase
  Auth** (beta). Claude se registra solo (registro dinámico de clientes).
- **Identidad:** el access token es un JWT normal de Supabase del miembro que
  autorizó (rol `authenticated`, con `client_id`). Se aplican las mismas RLS que
  en la interfaz: Claude ve y modifica exactamente lo que ve esa persona. La app
  **no usa la service role key** en ningún punto.

## Cómo funciona la conexión

1. En Claude: Ajustes → Conectores → Agregar conector personalizado → URL
   `https://TU-DOMINIO/api/mcp`.
2. Claude llama a `/api/mcp` sin token y recibe `401` con
   `WWW-Authenticate: ... resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`.
3. Esos metadatos (RFC 9728) dicen que el servidor de autorización es
   `https://<ref>.supabase.co/auth/v1`. Claude lee su discovery, se registra y
   abre el flujo de autorización.
4. Supabase manda al miembro a `/oauth/consent?authorization_id=…`. Si no tiene
   sesión, pasa por `/login?next=…` y vuelve.
5. El miembro pulsa **Autorizar** → Supabase devuelve el código a Claude → Claude
   obtiene access + refresh token y los renueva solo.
6. En cada petición, `/api/mcp` valida el JWT con `auth.getClaims()` y arma un
   cliente de Supabase con ese token.

Quitar el acceso: **Ajustes → Conexión con Claude → Quitar acceso**
(`auth.oauth.revokeGrant`). Supabase invalida los tokens de ese cliente.

Cerrar sesión en la web usa `signOut({ scope: 'local' })` para no tumbar el
acceso de Claude ni otras sesiones.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `app/api/mcp/route.ts` | Valida el Bearer, responde 401 con `resource_metadata` y delega en `mcp-handler` |
| `app/api/mcp/tools.ts` | Definición de las 14 herramientas |
| `utils/supabase/mcp.ts` | Validación del token (`sesionDesdeToken`) y contexto por petición (AsyncLocalStorage) |
| `app/.well-known/oauth-protected-resource/[[...ruta]]/route.ts` | Metadatos del recurso protegido |
| `app/.well-known/oauth-authorization-server/[[...ruta]]/route.ts` | Respaldo: reexpone el discovery de Supabase para clientes antiguos |
| `app/oauth/consent/` | Pantalla de consentimiento y acciones aprobar/rechazar |
| `app/components/conexion-claude.tsx` | Tarjeta en Ajustes: URL del conector y aplicaciones con acceso |
| `app/login/` | Soporta `?next=` (solo rutas internas) para volver al consentimiento |
| `utils/supabase/middleware.ts` | Deja pasar `/api/mcp` y `/.well-known/*`; manda `/oauth/*` al login con `next` |
| `app/lib/url-publica.ts` | Origen público (usa `NEXT_PUBLIC_SITE_URL` si existe) |

Migraciones históricas del método anterior (token `kp_`): `019`, `020`, `021`
(aplicadas) y `022` (cierra otra vez el acceso anónimo). Las tablas
`mcp_connections` y `mcp_connection_secrets` quedan sin uso y se retiran cuando
OAuth esté confirmado en producción.

## Configuración en Supabase (una vez)

1. **Authentication → OAuth Server**: activar el servidor OAuth 2.1.
2. Activar **Dynamic client registration** (Claude se registra solo).
3. **Authorization path**: `/oauth/consent`.
4. **Authentication → URL Configuration → Site URL**: el dominio de producción
   (la pantalla de consentimiento es Site URL + authorization path).
5. Recomendado: claves de firma JWT asimétricas (Authentication → JWT Keys),
   así `getClaims()` valida localmente sin ir a Supabase en cada petición.

Variables de entorno:

```
NEXT_PUBLIC_SITE_URL=https://tu-dominio   # recomendada
```

`MCP_ENCRYPTION_KEY` ya no se usa.

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

Sin token debe responder `401` con la cabecera `www-authenticate`:

```bash
curl -i -X POST https://TU-DOMINIO/api/mcp -H 'content-type: application/json' -d '{}'
curl https://TU-DOMINIO/.well-known/oauth-protected-resource/api/mcp
```

La prueba completa es agregarlo como conector en Claude: OAuth necesita que la
app esté publicada con HTTPS (claude.ai se conecta desde la nube, no llega a
`localhost`).

## Notas de seguridad

- El registro dinámico deja que cualquier cliente se registre, pero ninguno
  obtiene acceso sin que un miembro inicie sesión y pulse **Autorizar**. La
  pantalla muestra qué aplicación pide acceso y a dónde vuelve.
- `next` en el login solo acepta rutas internas (`/algo`), nunca `//dominio`
  ni URLs absolutas: no es una redirección abierta.
- Servir siempre por HTTPS.
