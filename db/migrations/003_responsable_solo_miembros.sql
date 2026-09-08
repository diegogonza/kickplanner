-- 003 — El responsable de una tarea tiene que ser miembro del proyecto
--
-- YA APLICADA en Supabase (proyecto nowiyhgvlaskihnugotr) el 2026-09-08,
-- versión 20260908010115. Se versiona acá para que el repo refleje la base.
--
-- set_task_assignee aceptaba cualquier uuid. Por RLS, una tarea asignada a
-- alguien de afuera del proyecto es invisible para esa persona: quedaba con
-- dueño nominal y sin nadie que la pueda abrir. No era alcanzable desde la
-- interfaz (el selector solo lista miembros), pero la vista Semana del equipo
-- permite arrastrar tareas entre personas, así que la validación va en la base.
--
-- Al aplicarla, las 846 tareas existentes cumplían la regla (0 violaciones).

create or replace function public.set_task_assignee(p_task_id uuid, p_assignee uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare prev uuid;
begin
  if not public.can_access_task(p_task_id) then raise exception 'forbidden'; end if;

  -- null = desasignar, siempre permitido
  if p_assignee is not null and not exists (
    select 1 from tasks t
    join project_members pm on pm.project_id = t.project_id
    where t.id = p_task_id and pm.user_id = p_assignee
  ) then
    raise exception 'el responsable no es miembro del proyecto';
  end if;

  select assignee_id into prev from tasks where id = p_task_id;
  update tasks set assignee_id = p_assignee where id = p_task_id;
  if p_assignee is distinct from prev then
    insert into task_activity (task_id, actor_id, type, meta)
      values (p_task_id, auth.uid(), 'assignee', jsonb_build_object('to', p_assignee));
    if p_assignee is not null and p_assignee <> auth.uid() then
      insert into notifications (user_id, actor_id, task_id, type)
        values (p_assignee, auth.uid(), p_task_id, 'assigned');
    end if;
  end if;
end; $function$;

revoke execute on function public.set_task_assignee(uuid,uuid) from public, anon;
grant  execute on function public.set_task_assignee(uuid,uuid) to authenticated;
