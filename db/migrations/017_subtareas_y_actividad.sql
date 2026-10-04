-- 017 — Subtareas (orden) y actividad registrada por la base
-- 2026-10-04 · Plan de mejoras del modal de tareas
--
-- ESTADO:
--   Parte A (posiciones normalizadas, reorder_subtasks, task_ancestors) YA ESTÁ
--   APLICADA en producción desde Claude. Se deja acá para que el repo refleje
--   la base; es idempotente, volver a correrla no cambia nada.
--   Parte B (triggers) FALTA: la herramienta no pudo crear triggers. Correr este
--   archivo completo en Supabase → SQL Editor.
--
-- Es seguro aplicarlo ANTES o DESPUÉS de desplegar el código nuevo: mientras el
-- cliente siga insertando la actividad a mano, el trigger de deduplicación
-- descarta el segundo registro idéntico.

-- ============================== PARTE A ==============================

-- Orden 1..N por padre, respetando el orden que ya se veía
with r as (
  select id, row_number() over (partition by parent_id order by position nulls last, created_at, id) as rn
  from public.tasks
  where parent_id is not null
)
update public.tasks t
set position = r.rn
from r
where r.id = t.id and t.position is distinct from r.rn;

-- Reordenar subtareas en una sola llamada (SECURITY INVOKER: aplica la RLS)
create or replace function public.reorder_subtasks(p_parent_id uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.tasks t
  set position = x.ord
  from unnest(p_ids) with ordinality as x(id, ord)
  where t.id = x.id and t.parent_id = p_parent_id and t.position is distinct from x.ord;
$$;
revoke execute on function public.reorder_subtasks(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_subtasks(uuid, uuid[]) to authenticated;

-- Cadena de ancestros en una consulta (raíz primero). SECURITY INVOKER.
create or replace function public.task_ancestors(p_task_id uuid)
returns table (id uuid, title text, depth int)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive up as (
    select p.id, p.title, p.parent_id, 1 as depth
    from public.tasks c join public.tasks p on p.id = c.parent_id
    where c.id = p_task_id
    union all
    select p.id, p.title, p.parent_id, up.depth + 1
    from up join public.tasks p on p.id = up.parent_id
    where up.depth < 20
  )
  select up.id, up.title, up.depth from up order by up.depth desc;
$$;
revoke execute on function public.task_ancestors(uuid) from public, anon;
grant execute on function public.task_ancestors(uuid) to authenticated;


-- Completar una tarea con sus subtareas (aviso de confirmación en el cliente).
-- YA APLICADO. Cuenta las subtareas abiertas a cualquier profundidad:
create or replace function public.task_open_descendants(p_task_id uuid)
returns integer
language sql stable security invoker set search_path = public
as $$
  with recursive tree as (
    select id from public.tasks where parent_id = p_task_id
    union
    select t.id from public.tasks t join tree on t.parent_id = tree.id
  )
  select count(*)::int from public.tasks
  where id in (select id from tree) and status <> 'done';
$$;

-- Marca la tarea y todas sus subtareas abiertas como hechas en una sola
-- operación y registra la actividad de cada una. Devuelve cuántas cambió.
create or replace function public.complete_task_tree(p_task_id uuid)
returns integer
language sql security invoker set search_path = public
as $$
  with recursive tree as (
    select id from public.tasks where id = p_task_id
    union
    select t.id from public.tasks t join tree on t.parent_id = tree.id
  ),
  upd as (
    update public.tasks set status = 'done'
    where id in (select id from tree) and status <> 'done'
    returning id
  ),
  act as (
    insert into public.task_activity (task_id, type, meta)
    select id, 'status', '{"to":"done"}'::jsonb from upd
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke execute on function public.task_open_descendants(uuid) from public, anon;
revoke execute on function public.complete_task_tree(uuid) from public, anon;
grant execute on function public.task_open_descendants(uuid) to authenticated;
grant execute on function public.complete_task_tree(uuid) to authenticated;


-- Cuántas subtareas (a cualquier profundidad) se pierden al eliminar una tarea:
-- lo usa el diálogo de confirmación de borrado. YA APLICADO.
create or replace function public.task_descendant_count(p_task_id uuid)
returns integer
language sql stable security invoker set search_path = public
as $$
  with recursive tree as (
    select id from public.tasks where parent_id = p_task_id
    union
    select t.id from public.tasks t join tree on t.parent_id = tree.id
  )
  select count(*)::int from tree;
$$;
revoke execute on function public.task_descendant_count(uuid) from public, anon;
grant execute on function public.task_descendant_count(uuid) to authenticated;

-- ============================== PARTE B ==============================

-- Subtarea nueva sin posición -> al final de sus hermanas (cubre todos los
-- caminos de alta: modal, lista, plantillas, duplicar)
create or replace function public.subtask_default_position()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is not null and new.position is null then
    select coalesce(max(position), 0) + 1 into new.position
    from public.tasks where parent_id = new.parent_id;
  end if;
  return new;
end $$;

drop trigger if exists tasks_subtask_default_position on public.tasks;
create trigger tasks_subtask_default_position
before insert on public.tasks
for each row execute function public.subtask_default_position();

-- Actividad de estado / prioridad / fecha registrada por la base: queda rastro
-- venga el cambio de donde venga (modal, Lista, Tablero, Mis tareas) y es
-- atómica con el cambio. SECURITY DEFINER para que nunca bloquee el UPDATE.
create or replace function public.log_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.task_activity (task_id, actor_id, type, meta)
    values (new.id, auth.uid(), 'status', jsonb_build_object('to', new.status));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_activity (task_id, actor_id, type, meta)
    values (new.id, auth.uid(), 'priority', jsonb_build_object('to', new.priority));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_activity (task_id, actor_id, type, meta)
    values (new.id, auth.uid(), 'due', jsonb_build_object('to', new.due_date::text));
  end if;
  return null;
end $$;

drop trigger if exists tasks_log_change on public.tasks;
create trigger tasks_log_change
after update of status, priority, due_date on public.tasks
for each row execute function public.log_task_change();

-- Red de seguridad: si el cliente además inserta la actividad a mano, el
-- segundo registro idéntico (misma tarea, tipo, valor y autor, < 15 s) se
-- descarta. Compara solo con el ÚLTIMO evento de ese tipo, así
-- "hecho -> por hacer -> hecho" sigue registrando los tres.
create or replace function public.task_activity_dedupe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_row record;
begin
  if new.type not in ('status', 'priority', 'due') then
    return new;
  end if;
  select a.actor_id, a.meta, a.created_at into last_row
  from public.task_activity a
  where a.task_id = new.task_id and a.type = new.type
  order by a.created_at desc
  limit 1;
  if found
     and last_row.actor_id is not distinct from coalesce(new.actor_id, auth.uid())
     and (last_row.meta -> 'to') is not distinct from (new.meta -> 'to')
     and last_row.created_at > now() - interval '15 seconds' then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists task_activity_dedupe on public.task_activity;
create trigger task_activity_dedupe
before insert on public.task_activity
for each row execute function public.task_activity_dedupe();

revoke execute on function public.subtask_default_position() from public, anon, authenticated;
revoke execute on function public.log_task_change() from public, anon, authenticated;
revoke execute on function public.task_activity_dedupe() from public, anon, authenticated;

-- Verificación (debe devolver 3 filas):
-- select tgname from pg_trigger where tgname in
--   ('tasks_subtask_default_position','tasks_log_change','task_activity_dedupe');
