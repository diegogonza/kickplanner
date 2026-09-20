-- Reversión COMPLETA de 012_roles.sql + 012b + 012c + 013_roles_correcciones
-- + 014_politicas_por_operacion.
-- Deja la base exactamente como estaba el 2026-09-19, antes de los roles.
-- Se conserva la columna profiles.role (inofensiva) para no perder la
-- asignación si se vuelve a aplicar.
--
-- Ejecutar completo, en una sola transacción, desde el SQL editor de Supabase.

begin;

-- ---------- Trigger de rol ----------
drop trigger if exists trg_profiles_guard_role on public.profiles;
drop function if exists public.profiles_guard_role();

-- ---------- Reglas de acceso ----------
drop policy if exists "admin edita proyectos" on public.projects;
drop policy if exists "admin borra proyectos" on public.projects;
create policy "el dueno edita el proyecto" on public.projects for update using (is_project_owner(id));
create policy "el dueno borra el proyecto" on public.projects for delete using (is_project_owner(id));

drop policy if exists "admin agrega miembros" on public.project_members;
drop policy if exists "admin quita miembros" on public.project_members;
create policy "el dueno agrega miembros" on public.project_members for insert with check (is_project_owner(project_id));
create policy "el dueno quita miembros" on public.project_members for delete using (is_project_owner(project_id));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete using (
  owner_id = auth.uid() or exists (select 1 from projects p where p.client_id = clients.id and is_project_member(p.id)));

drop policy if exists "admin borra pagos" on public.client_payments;
drop policy if exists "admin crea pagos" on public.client_payments;
drop policy if exists "admin edita pagos" on public.client_payments;
drop policy if exists "admin ve pagos" on public.client_payments;
create policy "borrar pagos de mis proyectos" on public.client_payments for delete using (is_project_member(project_id));
create policy "crear pagos de mis proyectos" on public.client_payments for insert with check (is_project_member(project_id));
create policy "editar pagos de mis proyectos" on public.client_payments for update using (is_project_member(project_id));
create policy "ver pagos de mis proyectos" on public.client_payments for select using (is_project_member(project_id));

drop policy if exists "admin ve fees" on public.fee_changes;
create policy "ver fees de mis proyectos" on public.fee_changes for select using (is_project_member(project_id));

drop policy if exists portal_access_select on public.portal_access;
drop policy if exists portal_access_admin_write on public.portal_access;
drop policy if exists portal_access_admin_insert on public.portal_access;
drop policy if exists portal_access_admin_update on public.portal_access;
drop policy if exists portal_access_admin_delete on public.portal_access;
comment on table public.portal_access is null;
create policy portal_access_staff on public.portal_access for all to authenticated using (true) with check (true);
grant select, insert, update, delete, truncate, references, trigger on public.portal_access to anon, authenticated;

drop policy if exists google_oauth_select on public.google_oauth;
drop policy if exists google_oauth_admin_write on public.google_oauth;
drop policy if exists google_oauth_admin_insert on public.google_oauth;
drop policy if exists google_oauth_admin_update on public.google_oauth;
drop policy if exists google_oauth_admin_delete on public.google_oauth;
create policy gsc_oauth_staff on public.google_oauth for all to authenticated using (true) with check (true);

drop policy if exists "admin borra equipos" on public.teams;
create policy "borrar equipos" on public.teams for delete using (is_team_member(id));

drop policy if exists templates_select on public.templates;
drop policy if exists templates_insert on public.templates;
drop policy if exists templates_update on public.templates;
drop policy if exists templates_delete on public.templates;
create policy templates_all on public.templates for all using (owner_id = auth.uid());
drop policy if exists template_tasks_select on public.template_tasks;
drop policy if exists template_tasks_write on public.template_tasks;
drop policy if exists template_tasks_insert on public.template_tasks;
drop policy if exists template_tasks_update on public.template_tasks;
drop policy if exists template_tasks_delete on public.template_tasks;
create policy template_tasks_all on public.template_tasks for all using (exists (
  select 1 from templates t where t.id = template_tasks.template_id and t.owner_id = auth.uid()));
drop policy if exists template_task_tags_select on public.template_task_tags;
drop policy if exists template_task_tags_write on public.template_task_tags;
drop policy if exists template_task_tags_insert on public.template_task_tags;
drop policy if exists template_task_tags_update on public.template_task_tags;
drop policy if exists template_task_tags_delete on public.template_task_tags;
create policy template_task_tags_all on public.template_task_tags for all using (exists (
  select 1 from template_tasks tt join templates t on t.id = tt.template_id
  where tt.id = template_task_tags.template_task_id and t.owner_id = auth.uid()));

-- ---------- Funciones: definiciones previas a 012 ----------
create or replace function public.create_project(p_name text, p_client_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  if p_client_id is null then raise exception 'Todo proyecto necesita un cliente asignado'; end if;
  if not exists (select 1 from clients c where c.id = p_client_id) then
    raise exception 'El cliente indicado no existe';
  end if;
  insert into projects (name, owner_id, client_id) values (p_name, auth.uid(), p_client_id)
  returning id into new_id;
  insert into project_members (project_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end; $$;

create or replace function public.invite_member(p_project_id uuid, p_email text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare target uuid;
begin
  if not public.is_project_owner(p_project_id) then return 'forbidden'; end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if target is null then return 'not_found'; end if;
  insert into project_members (project_id, user_id, role) values (p_project_id, target, 'member')
  on conflict (project_id, user_id) do nothing;
  return 'ok';
end; $$;

create or replace function public.payments_data()
returns jsonb language sql security definer set search_path to 'public' as $$
  select jsonb_build_object(
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
  )
$$;

create or replace function public.generate_client_payments()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.client_payments (project_id, period, seq, amount, currency, kind)
  select p.id, (p.start_date + ((g.k - 1) || ' months')::interval)::date, g.k,
         coalesce(p.fee, 0), coalesce(p.currency, 'COP'), 'recurring'
  from public.projects p
  cross join lateral generate_series(1,
     (extract(year from age(current_date, p.start_date)) * 12
      + extract(month from age(current_date, p.start_date)))::int + 1) as g(k)
  where p.type = 'seo' and p.start_date is not null
    and (p.start_date + ((g.k - 1) || ' months')::interval)::date <= current_date
  on conflict (project_id, period) do nothing;
end $$;

create or replace function public.seed_web_installments()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.client_payments (project_id, period, seq, amount, currency, kind, note)
  select p.id, p.start_date, 1, round(coalesce(p.fee,0) * 0.5), coalesce(p.currency,'COP'), 'installment', 'Anticipo (50%)'
  from public.projects p
  where p.type = 'web' and coalesce(p.fee,0) > 0
    and not exists (select 1 from public.client_payments cp where cp.project_id = p.id and cp.kind = 'installment');
  insert into public.client_payments (project_id, period, seq, amount, currency, kind, note)
  select p.id, null, 2, coalesce(p.fee,0) - round(coalesce(p.fee,0) * 0.5), coalesce(p.currency,'COP'), 'installment', 'Saldo contra entrega (50%)'
  from public.projects p
  where p.type = 'web' and coalesce(p.fee,0) > 0
    and not exists (select 1 from public.client_payments cp where cp.project_id = p.id and cp.kind = 'installment' and cp.seq = 2);
end $$;

create or replace function public.change_project_fee(p_project_id uuid, p_new numeric, p_effective date, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_old numeric; v_cur text;
begin
  if not public.is_project_member(p_project_id) then raise exception 'no autorizado'; end if;
  select fee, coalesce(currency,'COP') into v_old, v_cur from public.projects where id = p_project_id;
  insert into public.fee_changes (project_id, old_amount, new_amount, currency, effective_date, changed_by, note)
  values (p_project_id, v_old, p_new, v_cur, p_effective, auth.uid(), nullif(p_note, ''));
  update public.projects set fee = p_new where id = p_project_id;
  update public.client_payments set amount = p_new
   where project_id = p_project_id and kind = 'recurring' and status = 'pending' and period >= p_effective;
end $$;

create or replace function public.portal_guardar_acceso(p_client_id uuid, p_password text, p_slug text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_slug text; v_existe boolean;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  if length(coalesce(p_password, '')) < 12 then raise exception 'La contraseña generada es demasiado corta'; end if;
  if not exists (select 1 from clients c where c.id = p_client_id) then raise exception 'El cliente no existe'; end if;
  select true into v_existe from portal_access where client_id = p_client_id;
  if v_existe then
    update portal_access set
      password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      rotated_at = now(), failed_attempts = 0, locked_until = null, enabled = true
    where client_id = p_client_id returning slug into v_slug;
  else
    v_slug := coalesce(nullif(trim(lower(p_slug)), ''),
                       public.portal_slug_sugerido((select name from clients where id = p_client_id)));
    insert into portal_access (client_id, slug, password_hash)
    values (p_client_id, v_slug, extensions.crypt(p_password, extensions.gen_salt('bf', 10)));
  end if;
  return v_slug;
end $$;

create or replace function public.portal_activar(p_client_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  update portal_access set enabled = p_enabled where client_id = p_client_id;
  if not found then return false; end if;
  if not p_enabled then delete from portal_sessions where client_id = p_client_id; end if;
  return true;
end $$;

create or replace function public.portal_desbloquear(p_slug text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_ok boolean;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  update portal_access set failed_attempts = 0, locked_until = null
  where slug = lower(trim(p_slug)) returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

create or replace function public.portal_eliminar_acceso(p_client_id uuid)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  delete from portal_access where client_id = p_client_id;
  return found;
end $$;

create or replace function public.google_oauth_guardar(p_refresh_token text, p_email text default null, p_client_id text default null, p_client_secret text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_cs uuid;
begin
  if coalesce(trim(p_refresh_token), '') = '' then raise exception 'refresh token vacío'; end if;
  select secret_id, client_secret_id into v_id, v_cs from google_oauth where id = 1;
  if v_id is null then
    v_id := vault.create_secret(p_refresh_token, 'kickplanner_google_refresh', 'Refresh token de Google para Search Console');
    if coalesce(p_client_secret,'') <> '' then
      v_cs := vault.create_secret(p_client_secret, 'kickplanner_google_client_secret', 'Client secret de OAuth para Search Console');
    end if;
    insert into google_oauth (id, secret_id, client_secret_id, client_id, email, connected_at)
    values (1, v_id, v_cs, p_client_id, p_email, now());
  else
    perform vault.update_secret(v_id, p_refresh_token);
    if coalesce(p_client_secret,'') <> '' then
      if v_cs is null then
        v_cs := vault.create_secret(p_client_secret, 'kickplanner_google_client_secret', 'Client secret de OAuth para Search Console');
      else
        perform vault.update_secret(v_cs, p_client_secret);
      end if;
    end if;
    update google_oauth set client_secret_id = coalesce(v_cs, client_secret_id),
      client_id = coalesce(p_client_id, client_id), email = coalesce(p_email, email), connected_at = now()
    where id = 1;
  end if;
end $$;

create or replace function public.google_oauth_desconectar()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_cs uuid;
begin
  select secret_id, client_secret_id into v_id, v_cs from google_oauth where id = 1;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
  if v_cs is not null then delete from vault.secrets where id = v_cs; end if;
  delete from google_oauth where id = 1;
  update gsc_properties set last_error = 'Cuenta de Google desconectada';
end $$;

create or replace function public.apply_template(p_template_id uuid, p_project_id uuid, p_start date default current_date)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_count int := 0; r record; v_new uuid;
begin
  if not exists (select 1 from templates t where t.id = p_template_id and t.owner_id = v_uid) then
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

create or replace function public.templates_overview()
returns table(id uuid, name text, description text, type text, num_tasks integer, created_at timestamptz)
language sql security definer set search_path to 'public' as $$
  select t.id, t.name, t.description, t.type,
    (select count(*) from template_tasks tt where tt.template_id = t.id)::int, t.created_at
  from templates t where t.owner_id = auth.uid() order by t.name
$$;

-- is_admin() se deja: ya nada la usa y no concede nada por sí sola.

commit;

-- IMPORTANTE: la app (código) asume los roles. Si se revierte la base, hay
-- que volver también el código a la versión previa, o los admin verán avisos
-- de "sin permisos" que la base ya no aplica (y viceversa).
