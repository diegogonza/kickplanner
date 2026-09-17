-- 002 — Portal de clientes: acceso, sesiones y funciones de lectura
--
-- APLICADA el 2026-09-14 (migraciones Supabase `portal_clientes_v1` y
-- `portal_login_fix_pgcrypto_schema`). Este archivo es el registro de lo que
-- quedó en la base; no hace falta volver a ejecutarlo.
--
-- Decisión de arquitectura: NO se usa la service role key. Las funciones son
-- SECURITY DEFINER y exigen un token de sesión de 32 bytes aleatorios guardado
-- en portal_sessions, así que la clave anónima por sí sola no devuelve nada.
-- Esto reemplaza lo que decía el plan v3 en el apartado 4.2.

-- 1. Visibilidad tarea por tarea. Todo arranca invisible a propósito.
alter table public.tasks
  add column if not exists client_visible boolean not null default false;
alter table public.template_tasks
  add column if not exists client_visible boolean not null default false;
create index if not exists idx_tasks_client_visible
  on public.tasks (project_id) where client_visible;

-- 2. Acceso por cliente: slug + contraseña compartida (bcrypt vía pgcrypto).
create table if not exists public.portal_access (
  client_id       uuid primary key references public.clients(id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  password_hash   text not null,
  enabled         boolean not null default true,   -- interruptor de emergencia
  failed_attempts int not null default 0,
  locked_until    timestamptz,                     -- bloqueo tras 8 fallos
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz
);

-- 3. Sesiones. El token vive en una cookie httpOnly, nunca en la URL: la
--    pantalla enlaza a Google Drive y un token en la URL se filtraría por la
--    cabecera Referer al hacer clic.
create table if not exists public.portal_sessions (
  token      text primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  last_seen  timestamptz not null default now()
);
create index if not exists idx_portal_sessions_client on public.portal_sessions (client_id);

alter table public.portal_access   enable row level security;
alter table public.portal_sessions enable row level security;

-- portal_access: la administra el equipo. portal_sessions no tiene políticas a
-- propósito: nadie la lee por tabla, solo las funciones SECURITY DEFINER.
create policy portal_access_staff on public.portal_access
  for all to authenticated using (true) with check (true);

-- 4..7 — Funciones portal_login / portal_session_client / portal_me /
--        portal_logout / portal_projects / portal_project.
--        Ver la definición vigente en la base; el detalle está en
--        BITACORA-PORTAL.md, entrada del 14-sep-2026.
--
-- Nota de implementación: pgcrypto vive en el esquema `extensions`, no en
-- `public`. Como las funciones fijan `search_path = public`, hay que llamar
-- extensions.crypt() y extensions.gen_random_bytes() calificados o fallan en
-- ejecución (no al crearse).

-- 8. Exposición: solo estas cinco funciones, y portal_session_client revocada.
-- revoke all on function public.portal_session_client(text) from public, anon, authenticated;
-- grant execute on function public.portal_login(text, text)   to anon, authenticated;
-- grant execute on function public.portal_me(text)            to anon, authenticated;
-- grant execute on function public.portal_logout(text)        to anon, authenticated;
-- grant execute on function public.portal_projects(text)      to anon, authenticated;
-- grant execute on function public.portal_project(text, uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- ALTA DE UN CLIENTE EN EL PORTAL
-- ---------------------------------------------------------------------------
-- insert into portal_access (client_id, slug, password_hash)
-- select c.id, 'vitaliah', extensions.crypt('LA-CONTRASEÑA', extensions.gen_salt('bf', 10))
-- from clients c where c.name = 'Vitaliah SAS'
-- on conflict (client_id) do update
--   set password_hash = excluded.password_hash, rotated_at = now();

-- ROTAR la contraseña de un cliente
-- update portal_access set
--   password_hash = extensions.crypt('NUEVA', extensions.gen_salt('bf', 10)),
--   rotated_at = now(), failed_attempts = 0, locked_until = null
-- where slug = 'vitaliah';
-- delete from portal_sessions where client_id = (select client_id from portal_access where slug='vitaliah');

-- APAGAR el portal de un cliente (o de todos) sin desplegar nada
-- update portal_access set enabled = false where slug = 'vitaliah';


-- ---------------------------------------------------------------------------
-- MARCADO DE VISIBILIDAD — por etiquetas
-- ---------------------------------------------------------------------------
-- Aplicado al piloto: todo menos Backlog y Proposals → 47 de 53 tareas raíz.
--
-- update tasks t set client_visible = true
-- from projects p, clients c
-- where t.project_id = p.id and p.client_id = c.id and c.name = 'Vitaliah SAS'
--   and t.parent_id is null
--   and exists (
--     select 1 from task_tags tt join tags g on g.id = tt.tag_id
--     where tt.task_id = t.id
--       and g.name in ('Reports','On-page','UI/UX','Inbound','Technical','Local')
--   );
--
-- Ver qué queda oculto en un proyecto:
-- select t.title, coalesce(string_agg(g.name, ', '), 'sin etiqueta')
-- from tasks t
-- left join task_tags tt on tt.task_id = t.id
-- left join tags g on g.id = tt.tag_id
-- where t.project_id = '<uuid>' and t.parent_id is null and not t.client_visible
-- group by t.id, t.title order by t.title;


-- ---------------------------------------------------------------------------
-- REVERSIÓN COMPLETA
-- ---------------------------------------------------------------------------
-- drop function if exists public.portal_project(text, uuid);
-- drop function if exists public.portal_projects(text);
-- drop function if exists public.portal_me(text);
-- drop function if exists public.portal_logout(text);
-- drop function if exists public.portal_login(text, text);
-- drop function if exists public.portal_session_client(text);
-- drop table if exists public.portal_sessions;
-- drop table if exists public.portal_access;
-- drop index if exists public.idx_tasks_client_visible;
-- alter table public.template_tasks drop column if exists client_visible;
-- alter table public.tasks          drop column if exists client_visible;
