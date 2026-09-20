-- 012 · Roles de la agencia: admin / member
--
-- admin  → Diego y Oscar. Gestionan proyectos, clientes, pagos, portales,
--          conexión con Google, equipos y plantillas.
-- member → el resto. Trabajan dentro de los proyectos (tareas, comentarios,
--          estado, Search Console, aplicar plantillas).
--
-- La app muestra las mismas opciones a todos y avisa "sin permisos"; la
-- barrera real es esta migración (RLS + chequeos en las funciones).

-- ---------- 1. Columna de rol ------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

-- Perfiles que falten (nadie queda sin rol)
insert into public.profiles (id)
select u.id from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

update public.profiles p set role = 'admin'
from auth.users u
where u.id = p.id
  and u.email in ('diego@kickranking.com', 'oscar@kickranking.com');

-- ---------- 2. is_admin() ----------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- 3. El rol solo lo cambia un admin --------------------------------
-- Cada persona puede editar su propio perfil (nombre, foto…). Sin esto podría
-- ponerse role = 'admin' a sí misma.
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.uid() nulo = service role / SQL del dashboard: se permite.
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.role is distinct from 'member' and not public.is_admin() then
      raise exception 'no tienes permisos para asignar roles';
    end if;
  elsif new.role is distinct from old.role and not public.is_admin() then
    raise exception 'no tienes permisos para cambiar roles';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard_role on public.profiles;
create trigger trg_profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_role();

-- ---------- 4. Proyectos -----------------------------------------------------
drop policy if exists "el dueno edita el proyecto" on public.projects;
create policy "admin edita proyectos" on public.projects
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "el dueno borra el proyecto" on public.projects;
create policy "admin borra proyectos" on public.projects
  for delete using (public.is_admin());

create or replace function public.create_project(p_name text, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if not public.is_admin() then
    raise exception 'no tienes permisos para crear proyectos';
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
$$;

-- Miembros del proyecto (botón Compartir)
drop policy if exists "el dueno agrega miembros" on public.project_members;
create policy "admin agrega miembros" on public.project_members
  for insert with check (public.is_admin());
drop policy if exists "el dueno quita miembros" on public.project_members;
create policy "admin quita miembros" on public.project_members
  for delete using (public.is_admin());

-- ---------- 5. Clientes: borrar solo admin -----------------------------------
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete using (public.is_admin());

-- ---------- 6. Pagos ---------------------------------------------------------
drop policy if exists "borrar pagos de mis proyectos" on public.client_payments;
drop policy if exists "crear pagos de mis proyectos" on public.client_payments;
drop policy if exists "editar pagos de mis proyectos" on public.client_payments;
create policy "admin borra pagos" on public.client_payments
  for delete using (public.is_admin());
create policy "admin crea pagos" on public.client_payments
  for insert with check (public.is_admin());
create policy "admin edita pagos" on public.client_payments
  for update using (public.is_admin()) with check (public.is_admin());

-- Lectura de pagos: solo admin (antes: cualquier miembro del proyecto)
drop policy if exists "ver pagos de mis proyectos" on public.client_payments;
create policy "admin ve pagos" on public.client_payments
  for select using (public.is_admin());

create or replace function public.payments_data()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select case when not public.is_admin() then
    jsonb_build_object('clients', '[]'::jsonb, 'payments', '[]'::jsonb, 'fee_history', '[]'::jsonb)
  else jsonb_build_object(
    'clients', coalesce((select jsonb_agg(row_to_json(c) order by c.name) from (
        select p.id as project_id, p.name, p.type, coalesce(p.currency, 'COP') as currency, p.start_date,
               coalesce(p.fee, 0) as fee
        from projects p where is_project_member(p.id)
    ) c), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(row_to_json(pay) order by pay.project_id, pay.kind, pay.seq) from (
        select cp.id, cp.project_id, cp.seq, cp.period, cp.amount, cp.currency, cp.status, cp.paid_on, cp.kind, cp.note
        from client_payments cp where is_project_member(cp.project_id)
    ) pay), '[]'::jsonb),
    'fee_history', coalesce((select jsonb_agg(row_to_json(h) order by h.created_at desc) from (
        select fc.project_id, fc.old_amount, fc.new_amount, fc.currency, fc.effective_date, fc.created_at
        from fee_changes fc where is_project_member(fc.project_id)
    ) h), '[]'::jsonb)
  ) end
$$;

-- ---------- 7. Portales de clientes -----------------------------------------
-- password_hash deja de ser legible desde la app: solo lo tocan las funciones.
drop policy if exists portal_access_staff on public.portal_access;
create policy portal_access_select on public.portal_access
  for select to authenticated using (true);
create policy portal_access_admin_write on public.portal_access
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke select on public.portal_access from anon, authenticated;
grant select (client_id, slug, enabled) on public.portal_access to authenticated;
revoke insert, update, delete, truncate on public.portal_access from anon;

create or replace function public.portal_guardar_acceso(p_client_id uuid, p_password text, p_slug text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_slug text; v_existe boolean;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if not public.is_admin() then
    raise exception 'no tienes permisos para gestionar portales';
  end if;
  if length(coalesce(p_password, '')) < 12 then
    raise exception 'La contraseña generada es demasiado corta';
  end if;
  if not exists (select 1 from clients c where c.id = p_client_id) then
    raise exception 'El cliente no existe';
  end if;

  select true into v_existe from portal_access where client_id = p_client_id;

  if v_existe then
    -- Rotación: el slug NO cambia (rompería el enlace del cliente).
    update portal_access set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      rotated_at = now(),
      failed_attempts = 0,
      locked_until = null,
      enabled = true
    where client_id = p_client_id
    returning slug into v_slug;
  else
    v_slug := coalesce(nullif(trim(lower(p_slug)), ''),
                       public.portal_slug_sugerido((select name from clients where id = p_client_id)));
    insert into portal_access (client_id, slug, password_hash)
    values (p_client_id, v_slug,
            extensions.crypt(p_password, extensions.gen_salt('bf', 10)));
  end if;

  return v_slug;
end $$;

create or replace function public.portal_activar(p_client_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  if not public.is_admin() then raise exception 'no tienes permisos para gestionar portales'; end if;

  update portal_access set enabled = p_enabled where client_id = p_client_id;
  if not found then return false; end if;

  if not p_enabled then
    delete from portal_sessions where client_id = p_client_id;
  end if;
  return true;
end $$;

create or replace function public.portal_desbloquear(p_slug text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ok boolean;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  if not public.is_admin() then raise exception 'no tienes permisos para gestionar portales'; end if;

  update portal_access
  set failed_attempts = 0, locked_until = null
  where slug = lower(trim(p_slug))
  returning true into v_ok;

  return coalesce(v_ok, false);
end $$;

create or replace function public.portal_eliminar_acceso(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  if not public.is_admin() then raise exception 'no tienes permisos para gestionar portales'; end if;
  delete from portal_access where client_id = p_client_id;
  return found;
end $$;

-- ---------- 8. Conexión con Google ------------------------------------------
-- Los tokens viven en Vault; esta tabla solo guarda referencias. Aun así,
-- conectar/desconectar la cuenta de la agencia es de admin.
drop policy if exists gsc_oauth_staff on public.google_oauth;
create policy google_oauth_select on public.google_oauth
  for select to authenticated using (true);
create policy google_oauth_admin_write on public.google_oauth
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.google_oauth_guardar(p_refresh_token text, p_email text default null, p_client_id text default null, p_client_secret text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_cs uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'no tienes permisos para conectar la cuenta de Google';
  end if;
  if coalesce(trim(p_refresh_token), '') = '' then
    raise exception 'refresh token vacío';
  end if;

  select secret_id, client_secret_id into v_id, v_cs from google_oauth where id = 1;

  if v_id is null then
    v_id := vault.create_secret(p_refresh_token, 'kickplanner_google_refresh',
                                'Refresh token de Google para Search Console');
    if coalesce(p_client_secret,'') <> '' then
      v_cs := vault.create_secret(p_client_secret, 'kickplanner_google_client_secret',
                                  'Client secret de OAuth para Search Console');
    end if;
    insert into google_oauth (id, secret_id, client_secret_id, client_id, email, connected_at)
    values (1, v_id, v_cs, p_client_id, p_email, now());
  else
    perform vault.update_secret(v_id, p_refresh_token);
    if coalesce(p_client_secret,'') <> '' then
      if v_cs is null then
        v_cs := vault.create_secret(p_client_secret, 'kickplanner_google_client_secret',
                                    'Client secret de OAuth para Search Console');
      else
        perform vault.update_secret(v_cs, p_client_secret);
      end if;
    end if;
    update google_oauth set
      client_secret_id = coalesce(v_cs, client_secret_id),
      client_id = coalesce(p_client_id, client_id),
      email = coalesce(p_email, email),
      connected_at = now()
    where id = 1;
  end if;
end $$;

-- ---------- 9. Equipos: borrar solo admin -----------------------------------
drop policy if exists "borrar equipos" on public.teams;
create policy "admin borra equipos" on public.teams
  for delete using (public.is_admin());

-- ---------- 10. Plantillas --------------------------------------------------
-- Todos ven y aplican cualquier plantilla; el autor o un admin la edita.
drop policy if exists templates_all on public.templates;
create policy templates_select on public.templates
  for select to authenticated using (true);
create policy templates_insert on public.templates
  for insert to authenticated with check (owner_id = auth.uid());
create policy templates_update on public.templates
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy templates_delete on public.templates
  for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

drop policy if exists template_tasks_all on public.template_tasks;
create policy template_tasks_select on public.template_tasks
  for select to authenticated using (true);
create policy template_tasks_write on public.template_tasks
  for all to authenticated
  using (exists (select 1 from templates t where t.id = template_tasks.template_id
                 and (t.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from templates t where t.id = template_tasks.template_id
                 and (t.owner_id = auth.uid() or public.is_admin())));

drop policy if exists template_task_tags_all on public.template_task_tags;
create policy template_task_tags_select on public.template_task_tags
  for select to authenticated using (true);
create policy template_task_tags_write on public.template_task_tags
  for all to authenticated
  using (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                 where tt.id = template_task_tags.template_task_id
                   and (t.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                 where tt.id = template_task_tags.template_task_id
                   and (t.owner_id = auth.uid() or public.is_admin())));

-- Aplicar: cualquier plantilla, en un proyecto donde seas miembro.
create or replace function public.apply_template(p_template_id uuid, p_project_id uuid, p_start date default current_date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_count int := 0; r record; v_new uuid;
begin
  if v_uid is null then raise exception 'sin sesión'; end if;
  if not exists (select 1 from templates t where t.id = p_template_id) then
    raise exception 'plantilla no encontrada';
  end if;
  if not public.is_project_member(p_project_id) then raise exception 'no autorizado'; end if;
  create temp table _tmap (old uuid primary key, new uuid) on commit drop;
  loop
    for r in
      select tt.* from template_tasks tt
      where tt.template_id = p_template_id and tt.id not in (select old from _tmap)
        and (tt.parent_id is null or tt.parent_id in (select old from _tmap))
      order by tt.position, tt.created_at
    loop
      insert into tasks (title, project_id, parent_id, status, priority, due_date, description, drive_url, assignee_id, created_by)
      values (r.title, p_project_id,
        case when r.parent_id is null then null else (select new from _tmap where old = r.parent_id) end,
        'todo', r.priority,
        case when r.due_offset_days is null then null else p_start + r.due_offset_days end,
        r.description, r.drive_url, r.assignee_id, v_uid)
      returning id into v_new;
      insert into _tmap(old, new) values (r.id, v_new);
      insert into task_tags (task_id, tag_id) select v_new, x.tag_id from template_task_tags x where x.template_task_id = r.id on conflict do nothing;
      insert into task_activity (task_id, type, meta) values (v_new, 'created', '{}'::jsonb);
      v_count := v_count + 1;
    end loop;
    exit when not found;
  end loop;
  return v_count;
end $$;

-- Listado de plantillas: todas (antes solo las propias)
create or replace function public.templates_overview()
returns table(id uuid, name text, description text, type text, num_tasks integer, created_at timestamptz)
language sql
security definer
set search_path to 'public'
as $$
  select t.id, t.name, t.description, t.type,
    (select count(*) from template_tasks tt where tt.template_id = t.id)::int, t.created_at
  from templates t
  where auth.uid() is not null
  order by t.name
$$;

-- Invitar a un proyecto (botón Compartir): solo admin
create or replace function public.invite_member(p_project_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare target uuid;
begin
  if not public.is_admin() then
    return 'forbidden';
  end if;

  select id into target
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if target is null then
    return 'not_found';
  end if;

  insert into project_members (project_id, user_id, role)
  values (p_project_id, target, 'member')
  on conflict (project_id, user_id) do nothing;

  return 'ok';
end;
$$;

-- Ajustes posteriores (aplicados como 012c_roles_ajustes)
-- La función del trigger no debe poder llamarse por /rpc.
revoke execute on function public.profiles_guard_role() from public, anon, authenticated;

-- Desconectar la cuenta de Google: solo admin
create or replace function public.google_oauth_desconectar()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_cs uuid;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'no tienes permisos para desconectar la cuenta de Google';
  end if;
  select secret_id, client_secret_id into v_id, v_cs from google_oauth where id = 1;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
  if v_cs is not null then delete from vault.secrets where id = v_cs; end if;
  delete from google_oauth where id = 1;
  update gsc_properties set last_error = 'Cuenta de Google desconectada';
end $$;
