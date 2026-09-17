-- 004 — clients_overview(): mostrar los clientes del equipo, no solo los propios.
--
-- Síntoma: cuatro de los cinco integrantes veían la lista de clientes vacía,
-- aunque trabajan todos los días en los proyectos de esos mismos clientes.
--
-- Causa: la función filtraba por `owner_id = auth.uid()`, más estricto que la
-- política RLS de la propia tabla `clients`, que ya permite ver un cliente si
-- sos miembro de alguno de sus proyectos. Los 4 clientes los había creado
-- diego@, así que para el resto la lista no existía.
--
-- Esto NO amplía permisos: el permiso ya estaba concedido en la política. La
-- función simplemente no lo usaba. La inconsistencia entre las dos reglas es
-- la señal de que la función quedó sin actualizar cuando se escribió la
-- política.

create or replace function public.clients_overview()
returns table(id uuid, name text, address text, phone text, website text,
              num_projects integer, seo_count integer, web_count integer,
              created_at timestamp with time zone)
language sql
security definer
set search_path to 'public'
as $function$
  select
    c.id, c.name, c.address, c.phone, c.website,
    (select count(*) from projects p where p.client_id = c.id)::int as num_projects,
    (select count(*) from projects p where p.client_id = c.id and p.type = 'seo')::int as seo_count,
    (select count(*) from projects p where p.client_id = c.id and p.type = 'web')::int as web_count,
    c.created_at
  from clients c
  where c.owner_id = auth.uid()
     or exists (
       select 1 from projects p
       where p.client_id = c.id and public.is_project_member(p.id)
     )
  order by c.name
$function$;
