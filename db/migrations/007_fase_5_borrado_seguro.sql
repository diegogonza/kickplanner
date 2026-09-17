-- 007 — Fase 5 del PLAN-DATOS-CLIENTES: borrar un cliente deja de ser
-- silenciosamente destructivo.
--
-- Antes, borrar un cliente hacía tres cosas y el diálogo solo mencionaba una:
--   projects.client_id  → SET NULL   (los proyectos quedaban huérfanos)
--   portal_access       → CASCADE    (el cliente PERDÍA el acceso al portal)
--   portal_sessions     → CASCADE    (se cerraban sus sesiones)
--
-- Recuperarse de eso significa regenerarle slug y contraseña al cliente y
-- volver a enviárselos. Por un clic.

alter table public.projects
  drop constraint if exists projects_client_id_fkey;

alter table public.projects
  add constraint projects_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete restrict;

-- clients_overview() suma has_portal para poder avisar ANTES de borrar.
drop function if exists public.clients_overview();

create function public.clients_overview()
returns table(
  id uuid, name text, address text, phone text,
  contact_name text, contact_email text, tier text, billing_code text,
  num_projects integer, seo_count integer, web_count integer,
  sites text[], has_portal boolean,
  created_at timestamp with time zone
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    c.id, c.name, c.address, c.phone,
    c.contact_name, c.contact_email, c.tier, c.billing_code,
    (select count(*) from projects p where p.client_id = c.id)::int,
    (select count(*) from projects p where p.client_id = c.id and p.type = 'seo')::int,
    (select count(*) from projects p where p.client_id = c.id and p.type = 'web')::int,
    (select array_agg(distinct p.url) from projects p
      where p.client_id = c.id and p.url is not null and p.url <> ''),
    exists (select 1 from portal_access pa where pa.client_id = c.id),
    c.created_at
  from clients c
  where c.owner_id = auth.uid()
     or exists (select 1 from projects p where p.client_id = c.id and public.is_project_member(p.id))
  order by c.name
$function$;

-- Contraparte en la app:
--   · el botón Eliminar aparece deshabilitado si el cliente tiene proyectos,
--     en vez de dejar apretar algo que solo puede fallar;
--   · el diálogo de confirmación nombra al cliente y, si tiene portal, avisa
--     que también se destruye el acceso;
--   · el error 23503 se traduce a un mensaje entendible.
--
-- NOTA: con los 28 proyectos asignados, hoy NINGÚN cliente se puede borrar
-- directamente. Es el comportamiento buscado, no un efecto secundario.
