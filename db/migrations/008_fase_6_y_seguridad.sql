-- 008 — Fase 6 del PLAN-DATOS-CLIENTES + deuda de seguridad + cron semanal.

-- ===========================================================================
-- FASE 6 — "proyecto sin cliente" pasa a ser un estado imposible
-- ===========================================================================
-- Decisión de Oscar: lo ideal es que todo proyecto tenga cliente. Se aplica.
--
-- create_project() insertaba SIN cliente y la app lo asignaba después con un
-- UPDATE. Con NOT NULL eso revienta en el INSERT, así que el cliente entra
-- ahora en la misma operación.
--
-- La firma vieja se BORRA explícitamente: dos versiones con el mismo nombre
-- hacen que PostgREST no pueda elegir candidato. Ya pasó hoy con
-- google_oauth_guardar y costó una hora.
drop function if exists public.create_project(text);

create or replace function public.create_project(p_name text, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_client_id is null then
    raise exception 'Todo proyecto necesita un cliente asignado';
  end if;
  if not exists (select 1 from clients c where c.id = p_client_id) then
    raise exception 'El cliente indicado no existe';
  end if;

  insert into projects (name, owner_id, client_id)
  values (p_name, auth.uid(), p_client_id)
  returning id into new_id;

  insert into project_members (project_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$function$;

alter table public.projects alter column client_id set not null;

-- En la app: el selector de cliente es `required` al crear y al editar, y se
-- eliminó el filtro "Sin cliente" de la vista de proyectos, que ya no puede
-- devolver nada.

-- ===========================================================================
-- CRON SEMANAL — lunes 07:00 Colombia
-- ===========================================================================
-- La clave de servicio se lee de Vault. No pasa por el chat, ni por un
-- archivo, ni por el código.
create or replace function public.gsc_sync_cron()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
  v_url text := 'https://nowiyhgvlaskihnugotr.supabase.co/functions/v1/gsc-sync';
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'service_role_key';

  if v_key is null then
    raise notice 'gsc_sync_cron: falta el secreto service_role_key en Vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || v_key),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $function$;

revoke execute on function public.gsc_sync_cron() from public, anon, authenticated;

-- Colombia es UTC-5 todo el año (sin horario de verano), así que 12:00 UTC
-- son siempre las 07:00 locales.
select cron.schedule('gsc-sync-semanal', '0 12 * * 1', $$ select public.gsc_sync_cron() $$);

-- Al pasar de diario a semanal hay que mover el umbral de "desactualizado":
-- con 3 días, el portal habría dicho "datos desactualizados" cuatro de cada
-- siete días y el aviso del panel se habría encendido todas las semanas. Un
-- aviso que suena siempre es un aviso que se ignora. Ahora son 8 días, un día
-- más que el intervalo del cron, en portal_seo y en las dos pantallas.

-- ===========================================================================
-- SEGURIDAD
-- ===========================================================================

-- 1) touch_updated_at() quedó sin search_path fijo (bug introducido hoy en la
--    migración 006). En SECURITY DEFINER eso permite secuestrar la función
--    creando un objeto homónimo en un esquema que el llamador controle.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 2) Funciones del equipo que eran llamables SIN sesión.
--
--    OJO: Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva,
--    y `anon` hereda de ahí. Un `revoke ... from anon` NO hace nada mientras
--    PUBLIC lo conserve — hay que quitárselo a PUBLIC y volver a conceder.
revoke execute on function public.clients_overview() from public, anon;
grant  execute on function public.clients_overview() to authenticated, service_role;

revoke execute on function public.create_project(text, uuid) from public, anon;
grant  execute on function public.create_project(text, uuid) to authenticated, service_role;

-- mcp_resolve_connection() resuelve un hash de token a una conexión y era
-- llamable sin sesión: cualquiera con la clave anónima (pública, va en el
-- navegador) podía sondearla. La tabla está vacía, la función no está en uso.
revoke execute on function public.mcp_resolve_connection(text) from public, anon;
grant  execute on function public.mcp_resolve_connection(text) to authenticated, service_role;

revoke execute on function public.mcp_store_refresh(text, text) from public, anon;
grant  execute on function public.mcp_store_refresh(text, text) to authenticated, service_role;

-- 3) Las portal_* SIGUEN siendo llamables por anon, a propósito: el portal del
--    cliente entra con la clave anónima. Están protegidas por el token de
--    sesión, no por el rol. Documentado en los COMMENT de la base para que
--    nadie las "arregle".

-- ===========================================================================
-- Revisado y NO cambiado, con motivo
-- ===========================================================================
-- · profiles: "perfiles visibles para autenticados" (qual = true) NO es un
--   agujero en esta arquitectura. Es un espacio de trabajo único de 5
--   personas que necesitan verse entre sí para asignar tareas y mencionarse.
--   Era un riesgo cuando el plan era que los CLIENTES se autenticaran; desde
--   que el portal no usa Supabase Auth, dejó de serlo.
--   PERO depende de que el registro público esté deshabilitado en Auth. Si
--   cualquiera puede crearse una cuenta, entonces sí puede leer todo el
--   equipo. A verificar en el panel.
--
-- · portal_sessions y mcp_connection_secrets tienen RLS activo y CERO
--   políticas. El linter lo marca; es deliberado y ahora está documentado en
--   un COMMENT de tabla.
--
-- · pg_net vive en el esquema public y el linter sugiere moverlo. No se movió:
--   gsc_sync_cron() depende de net.http_post y el beneficio no justifica el
--   riesgo de romper el cron.
--
-- · Las ~46 funciones SECURITY DEFINER llamables por `authenticated` son el
--   diseño de esta app: cada una hace su propio control con auth.uid(). No se
--   tocan en bloque.

-- ===========================================================================
-- Resuelto fuera de SQL (15/09/2026)
-- ===========================================================================
-- · service role key: guardada en Vault como 'service_role_key'. El cron se
--   probó a mano de punta a punta: HTTP 200, las 2 propiedades actualizadas.
--
-- · Registro público de cuentas: CONFIRMADO DESHABILITADO. Esto es lo que
--   sostiene la decisión de dejar la política de `profiles` como está: los
--   únicos `authenticated` posibles son las 5 cuentas del equipo, creadas a
--   mano. Si alguna vez se habilita el registro abierto, HAY QUE volver a
--   revisar esa política antes.
--
-- · Leaked password protection: NO se habilita. Requiere plan Pro y el
--   proyecto está en Free. Riesgo residual bajo por la misma razón de arriba:
--   sin registro público no hay forma de que entre una cuenta desconocida, y
--   las 5 existentes son de gente identificada. Queda anotado para revisar si
--   alguna vez se pasa a Pro.
