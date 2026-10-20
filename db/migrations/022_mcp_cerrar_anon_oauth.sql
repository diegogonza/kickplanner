-- 022 · El MCP pasa a OAuth: se vuelve a cerrar el acceso anónimo.
--
-- Desde que Claude se conecta por OAuth 2.1 contra Supabase Auth, /api/mcp
-- recibe un access token normal de Supabase y ya no resuelve tokens kp_ con
-- la clave anónima. El grant que reabrió la 021 deja de hacer falta, así que
-- se revierte y queda como lo había dejado la 008.
--
-- Las tablas mcp_connections / mcp_connection_secrets y sus funciones siguen
-- existiendo hasta confirmar que OAuth funciona en producción; se retiran en
-- una migración aparte.

revoke execute on function public.mcp_resolve_connection(text) from anon;
revoke execute on function public.mcp_store_refresh(text, text) from anon;
