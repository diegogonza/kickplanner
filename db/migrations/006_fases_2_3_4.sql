-- 006 — Fases 2, 3 y 4 del PLAN-DATOS-CLIENTES.

-- ===========================================================================
-- FASE 4 — Los clientes son de la agencia, no de quien tipeó el nombre
-- ===========================================================================
-- `clients_select` ya permitía ver un cliente si sos miembro de alguno de sus
-- proyectos, pero UPDATE y DELETE seguían siendo owner-only. Como los 28
-- clientes son de diego@, nadie más podía editarlos.
--
-- Lo grave era el modo de fallar: un UPDATE bloqueado por RLS NO devuelve
-- error, devuelve cero filas. Marcela corregía un teléfono, la pantalla decía
-- "guardado" y no se guardaba nada.

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
for update
using (
  owner_id = auth.uid()
  or exists (select 1 from projects p where p.client_id = clients.id and public.is_project_member(p.id))
)
with check (
  owner_id = auth.uid()
  or exists (select 1 from projects p where p.client_id = clients.id and public.is_project_member(p.id))
);

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
for delete
using (
  owner_id = auth.uid()
  or exists (select 1 from projects p where p.client_id = clients.id and public.is_project_member(p.id))
);

-- Contraparte en la app: las server actions ahora hacen `.select('id')` en
-- update y delete y cuentan las filas. Sin eso, el arreglo de RLS no se nota
-- y el error silencioso sigue.

-- ===========================================================================
-- FASE 2 — El sitio web vive solo en projects.url
-- ===========================================================================
-- Red de seguridad antes de tocar la columna.
update projects p
set url = c.website
from clients c
where p.client_id = c.id
  and (p.url is null or p.url = '')
  and c.website is not null and c.website <> '';

update projects
set url = case when trim(url) ~* '^https?://' then trim(url)
               else 'https://' || trim(url) end
where url is not null and url <> '';

-- La columna NO se borra: se renombra. Si algo la usaba y no lo vimos, falla
-- de inmediato y con nombre claro, y se revierte con otro rename. El drop
-- definitivo va en una migración posterior, cuando haya pasado una semana.
alter table public.clients rename column website to website_deprecated;

-- ===========================================================================
-- FASE 3 — Integridad
-- ===========================================================================
-- Unicidad sobre el nombre normalizado: "Mónica Cruz" y "  mónica cruz "
-- dejan de poder coexistir.
create unique index if not exists uq_clients_nombre
  on public.clients (lower(trim(name)));

alter table public.clients
  drop constraint if exists clients_name_no_vacio,
  add constraint clients_name_no_vacio check (length(trim(name)) > 0);

-- La URL del proyecto es la fuente de la que sale el sitio del cliente y la
-- referencia para vincular Search Console. Un valor como "En craeación" no
-- puede entrar.
alter table public.projects
  drop constraint if exists projects_url_formato,
  add constraint projects_url_formato
  check (url is null or url ~* '^https?://[^ ]+$');

alter table public.clients  add column if not exists updated_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_clients_touch on public.clients;
create trigger trg_clients_touch before update on public.clients
for each row execute function public.touch_updated_at();

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
for each row execute function public.touch_updated_at();

-- ===========================================================================
-- clients_overview(): cambia el contrato
-- ===========================================================================
-- Sale `website` (ya no existe) y entran contacto, nivel, forma de cobro y
-- `sites`: los sitios de SUS PROYECTOS. Es lo que la columna `website` fingía
-- ser cuando un cliente tenía más de un proyecto.
drop function if exists public.clients_overview();

create function public.clients_overview()
returns table(
  id uuid, name text, address text, phone text,
  contact_name text, contact_email text, tier text, billing_code text,
  num_projects integer, seo_count integer, web_count integer,
  sites text[],
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
    c.created_at
  from clients c
  where c.owner_id = auth.uid()
     or exists (select 1 from projects p where p.client_id = c.id and public.is_project_member(p.id))
  order by c.name
$function$;

-- ===========================================================================
-- Pendiente (Fases 5 y 6)
-- ===========================================================================
-- Fase 5: projects.client_id a ON DELETE RESTRICT, y que el diálogo de borrado
--         diga que también se destruye el portal_access del cliente.
-- Fase 6: projects.client_id NOT NULL. Decisión de Oscar, no técnica.
