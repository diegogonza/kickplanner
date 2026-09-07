-- 002 — Comentarios y menciones: correctitud + cierre de permisos
--
-- YA APLICADA en Supabase (proyecto nowiyhgvlaskihnugotr) el 2026-09-07.
-- Se versiona acá para que el repo refleje el estado real de la base.
-- Es independiente de 001_portal_visibilidad.sql (esa sigue sin aplicar).
--
-- Contenido:
--   1. Cierre de EXECUTE para `anon` en las funciones SECURITY DEFINER
--   2. Validación de cuerpo y largo en post_comment / edit_comment
--   3. Higiene: handle_new_user fuera del API, search_path fijo en set_project_color

-- ---------------------------------------------------------------------------
-- 1. Las funciones SECURITY DEFINER corren con los permisos del dueño y saltan
--    RLS. Estaban ejecutables por PUBLIC (herencia), o sea también por la clave
--    anónima del cliente. Se cierra: solo sesiones autenticadas y service_role.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  nombres text[] := array[
    'apply_template','change_project_fee','clients_overview','generate_client_payments',
    'my_collaborators','payments_data','pm_dashboard','project_members_list',
    'project_status_history','projects_overview','search_tasks','search_tasks_adv',
    'seed_web_installments','set_project_status','set_task_assignee','task_activity_feed',
    'team_members_list','templates_overview','workspace_members'
  ];
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.proname = any(nombres)
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('revoke execute on function %s from anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. El compositor corta a 5000 caracteres de texto, pero eso es cosmético: el
--    cliente puede llamar el RPC directo. El tope real va acá (20k de HTML deja
--    aire de sobra para un comentario de 5000 caracteres con marcado) y se
--    rechaza el cuerpo vacío, que hasta ahora entraba como comentario en blanco.
-- ---------------------------------------------------------------------------
create or replace function public.post_comment(p_task_id uuid, p_body text, p_mentions uuid[] default '{}'::uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare new_id uuid; m uuid;
begin
  if not public.can_access_task(p_task_id) then raise exception 'forbidden'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception 'cuerpo vacio'; end if;
  if length(p_body) > 20000 then raise exception 'comentario demasiado largo'; end if;

  insert into comments (task_id, author_id, body) values (p_task_id, auth.uid(), p_body) returning id into new_id;
  insert into task_activity (task_id, actor_id, type, meta) values (p_task_id, auth.uid(), 'comment', '{}'::jsonb);

  if p_mentions is not null then
    foreach m in array p_mentions loop
      if m is null then continue; end if;
      -- Solo miembros del proyecto de la tarea
      if not exists (
        select 1 from tasks t
        join project_members pm on pm.project_id = t.project_id
        where t.id = p_task_id and pm.user_id = m
      ) then continue; end if;

      insert into comment_mentions (comment_id, user_id) values (new_id, m) on conflict do nothing;
      if m <> auth.uid() then
        insert into notifications (user_id, actor_id, task_id, comment_id, type)
        values (m, auth.uid(), p_task_id, new_id, 'mention');
      end if;
    end loop;
  end if;
  return new_id;
end; $function$;

create or replace function public.edit_comment(p_comment_id uuid, p_body text, p_mentions uuid[] default '{}'::uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_task uuid; m uuid; ya_estaba boolean;
begin
  select task_id into v_task from comments where id = p_comment_id and author_id = auth.uid();
  if v_task is null then raise exception 'forbidden'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception 'cuerpo vacio'; end if;
  if length(p_body) > 20000 then raise exception 'comentario demasiado largo'; end if;

  update comments set body = p_body, edited_at = now() where id = p_comment_id;

  -- Se quitan las menciones que el texto editado ya no incluye
  delete from comment_mentions
  where comment_id = p_comment_id
    and not (user_id = any(coalesce(p_mentions, '{}'::uuid[])));

  if p_mentions is not null then
    foreach m in array p_mentions loop
      if m is null then continue; end if;
      if not exists (
        select 1 from tasks t
        join project_members pm on pm.project_id = t.project_id
        where t.id = v_task and pm.user_id = m
      ) then continue; end if;

      select exists(select 1 from comment_mentions where comment_id = p_comment_id and user_id = m) into ya_estaba;
      insert into comment_mentions (comment_id, user_id) values (p_comment_id, m) on conflict do nothing;

      -- Solo se avisa a quien no estaba mencionado antes
      if not ya_estaba and m <> auth.uid() then
        insert into notifications (user_id, actor_id, task_id, comment_id, type)
        values (m, auth.uid(), v_task, p_comment_id, 'mention');
      end if;
    end loop;
  end if;
end; $function$;

revoke execute on function public.post_comment(uuid,text,uuid[]) from public, anon;
grant  execute on function public.post_comment(uuid,text,uuid[]) to authenticated;
revoke execute on function public.edit_comment(uuid,text,uuid[]) from public, anon;
grant  execute on function public.edit_comment(uuid,text,uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Higiene
-- ---------------------------------------------------------------------------
-- handle_new_user es el trigger de alta de usuario: lo dispara supabase_auth_admin,
-- nadie debería poder llamarlo como RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant  execute on function public.handle_new_user() to supabase_auth_admin, service_role;

-- search_path fijo: sin esto la función resuelve nombres según el search_path
-- de quien la llama.
alter function public.set_project_color() set search_path = public;
