-- 015 · Vista de proyectos: fecha de la operación, rendimiento y permisos
-- explícitos (aplicada el 22-sep-2026 como 015_proyectos_fecha_y_rendimiento).
--
-- Tres cosas, derivadas de ANALISIS-VISTA-PROYECTOS.md:
--
-- 1. `overdue` comparaba contra `current_date`, y la base corre en UTC: el día
--    cambia a las 19:00 de Bogotá. Entre esa hora y medianoche, una tarea que
--    vence HOY ya se contaba como vencida, así que la columna "Vencidas" y el
--    triángulo rojo de la lista mentían cinco horas al día. La app ya define
--    TZ = 'America/Bogota' en app/projects/statuses.ts justamente para que
--    servidor, cliente y base no se contradigan; esto alinea la base.
--
-- 2. `projects_overview` hace dos conteos sobre `tasks` filtrando por
--    project_id y no había índice por esa columna: un scan por proyecto.
--    Con 914 tareas no se nota; conviene antes de que se note.
--
-- 3. `set_project_status` valida `is_project_member`, no `is_admin`, mientras
--    la política UPDATE de `projects` es admin-only. Es deliberado —el equipo
--    reporta cómo va su proyecto— pero no estaba escrito en ningún lado.

-- 1 · Fecha de la operación en el conteo de vencidas -------------------------
create or replace function public.projects_overview()
returns table(
  id uuid, name text, client_id uuid, client text, description text,
  status text, type text, status_note text, overdue integer,
  created_at timestamp with time zone, last_activity timestamp with time zone,
  favorite boolean, num_tasks integer, manager_id uuid, manager text,
  manager_avatar text, start_date date, fee numeric, currency text, url text
)
language sql
security definer
set search_path to 'public'
as $function$
  select p.id, p.name, p.client_id, c.name as client, p.description, p.status, p.type,
    (select u.note from project_status_updates u where u.project_id = p.id order by u.created_at desc limit 1) as status_note,
    -- Vencida = con fecha anterior a HOY EN BOGOTÁ y sin terminar.
    -- No usar current_date: la base está en UTC y adelanta el día a las 19:00.
    (select count(*) from tasks t
      where t.project_id = p.id
        and t.due_date < (now() at time zone 'America/Bogota')::date
        and t.status <> 'done')::int as overdue,
    p.created_at,
    greatest(p.created_at, coalesce((select max(a.created_at) from task_activity a join tasks t on t.id = a.task_id where t.project_id = p.id), p.created_at)) as last_activity,
    exists(select 1 from project_favorites f where f.project_id = p.id and f.user_id = auth.uid()) as favorite,
    (select count(*) from tasks t where t.project_id = p.id and t.parent_id is null)::int as num_tasks,
    p.manager_id,
    (select coalesce(mp.full_name, mu.email::text) from auth.users mu left join profiles mp on mp.id = mu.id where mu.id = p.manager_id) as manager,
    (select mp.avatar_url from profiles mp where mp.id = p.manager_id) as manager_avatar,
    p.start_date, p.fee, coalesce(p.currency,'COP') as currency, p.url
  from projects p
  left join clients c on c.id = p.client_id
  where public.is_project_member(p.id)
  order by favorite desc, last_activity desc
$function$;

comment on function public.projects_overview() is
  'Lista de proyectos visibles para quien consulta (is_project_member), con sus agregados. "overdue" se calcula con la fecha de America/Bogota, no con current_date (la base corre en UTC). El orden depende de auth.uid() porque "favorite" es por usuario.';

-- 2 · Índice para los dos conteos por proyecto -------------------------------
create index if not exists idx_tasks_project on public.tasks (project_id);

-- 3 · Dejar escrito quién puede cambiar el estado ----------------------------
comment on function public.set_project_status(uuid, text, text) is
  'Cambia el estado del proyecto y lo registra en project_status_updates. DELIBERADAMENTE valida is_project_member y no is_admin: reportar como va un proyecto es trabajo del equipo, no solo de administracion. Por eso es SECURITY DEFINER: la politica UPDATE de projects es admin-only y esta funcion la sortea a proposito, solo para la columna status. Si alguna vez se restringe a admin, hay que actualizar tambien la pildora de estado en app/components/projects-view.tsx.';
