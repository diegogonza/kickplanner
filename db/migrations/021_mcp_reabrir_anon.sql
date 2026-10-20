-- 021 · El MCP vuelve a poder resolver conexiones sin sesión.
--
-- La 008 quitó EXECUTE a anon en mcp_resolve_connection y mcp_store_refresh
-- porque en ese momento el MCP no estaba integrado ("la función no está en
-- uso"). Ahora sí lo está, y el endpoint /api/mcp las llama con la clave
-- anónima ANTES de tener sesión: es justamente lo que convierte el token kp_
-- en la sesión del miembro. Sin este grant, toda petición MCP da 500.
--
-- Por qué es aceptable exponerlas a anon:
--   · Ambas exigen el SHA-256 del token kp_ (256 bits aleatorios): no se
--     pueden sondear por fuerza bruta.
--   · Lo único que devuelve mcp_resolve_connection es el refresh token
--     CIFRADO con AES-256-GCM; sin MCP_ENCRYPTION_KEY (solo en el servidor)
--     no sirve para nada.
--   · mcp_store_refresh solo reemplaza el blob de la conexión cuyo hash se
--     presenta.
-- El linter de Supabase las marcará como "security definer llamable por
-- anon": es intencional, igual que las portal_*.

grant execute on function public.mcp_resolve_connection(text) to anon;
grant execute on function public.mcp_store_refresh(text, text) to anon;
