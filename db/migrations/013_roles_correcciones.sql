-- 013 · Correcciones de la revisión de roles (aplicada como 013_roles_correcciones)
--
-- 1. change_project_fee exigía ser miembro, no admin: un miembro podía cambiar
--    el fee (y los pagos pendientes) llamando la función directo.
-- 2. Pagos: los admin ven TODOS los proyectos (antes solo aquellos donde eran
--    miembros; Oscar veía 24 de 28 y los totales salían mal).
-- 3. fee_changes (historial comercial): lectura solo admin.
-- 4. Reglas de 012 con (select is_admin()): se evalúa una vez por consulta.

create or replace function public.change_project_fee(p_project_id uuid, p_new numeric, p_effective date, p_note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_old numeric; v_cur text;
begin
  if not public.is_admin() then raise exception 'no tienes permisos para cambiar el fee'; end if;
  if not exists (select 1 from public.projects where id = p_project_id) then raise exception 'proyecto no encontrado'; end if;
  select fee, coalesce(currency,'COP') into v_old, v_cur from public.projects where id = p_project_id;

  insert into public.fee_changes (project_id, old_amount, new_amount, currency, effective_date, changed_by, note)
  values (p_project_id, v_old, p_new, v_cur, p_effective, auth.uid(), nullif(p_note, ''));

  update public.projects set fee = p_new where id = p_project_id;

  update public.client_payments
     set amount = p_new
   where project_id = p_project_id and kind = 'recurring' and status = 'pending' and period >= p_effective;
end $$;

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
        from projects p
    ) c), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(row_to_json(pay) order by pay.project_id, pay.kind, pay.seq) from (
        select cp.id, cp.project_id, cp.seq, cp.period, cp.amount, cp.currency, cp.status, cp.paid_on, cp.kind, cp.note
        from client_payments cp
    ) pay), '[]'::jsonb),
    'fee_history', coalesce((select jsonb_agg(row_to_json(h) order by h.created_at desc) from (
        select fc.project_id, fc.old_amount, fc.new_amount, fc.currency, fc.effective_date, fc.created_at
        from fee_changes fc
    ) h), '[]'::jsonb)
  ) end
$$;

create or replace function public.generate_client_payments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then return; end if;
  insert into public.client_payments (project_id, period, seq, amount, currency, kind)
  select p.id,
         (p.start_date + ((g.k - 1) || ' months')::interval)::date,
         g.k,
         coalesce(p.fee, 0),
         coalesce(p.currency, 'COP'),
         'recurring'
  from public.projects p
  cross join lateral generate_series(
     1,
     (extract(year from age(current_date, p.start_date)) * 12
      + extract(month from age(current_date, p.start_date)))::int + 1
  ) as g(k)
  where p.type = 'seo' and p.start_date is not null
    and (p.start_date + ((g.k - 1) || ' months')::interval)::date <= current_date
  on conflict (project_id, period) do nothing;
end $$;

create or replace function public.seed_web_installments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then return; end if;
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

drop policy if exists "ver fees de mis proyectos" on public.fee_changes;
create policy "admin ve fees" on public.fee_changes for select using ((select public.is_admin()));

alter policy "admin edita proyectos" on public.projects using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admin borra proyectos" on public.projects using ((select public.is_admin()));
alter policy "admin agrega miembros" on public.project_members with check ((select public.is_admin()));
alter policy "admin quita miembros" on public.project_members using ((select public.is_admin()));
alter policy clients_delete on public.clients using ((select public.is_admin()));
alter policy "admin borra pagos" on public.client_payments using ((select public.is_admin()));
alter policy "admin crea pagos" on public.client_payments with check ((select public.is_admin()));
alter policy "admin edita pagos" on public.client_payments using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admin ve pagos" on public.client_payments using ((select public.is_admin()));
alter policy portal_access_admin_write on public.portal_access using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy google_oauth_admin_write on public.google_oauth using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "admin borra equipos" on public.teams using ((select public.is_admin()));
alter policy templates_update on public.templates
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));
alter policy templates_delete on public.templates using (owner_id = (select auth.uid()) or (select public.is_admin()));
alter policy templates_insert on public.templates with check (owner_id = (select auth.uid()));
alter policy template_tasks_write on public.template_tasks
  using (exists (select 1 from templates t where t.id = template_tasks.template_id
                 and (t.owner_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from templates t where t.id = template_tasks.template_id
                 and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
alter policy template_task_tags_write on public.template_task_tags
  using (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                 where tt.id = template_task_tags.template_task_id
                   and (t.owner_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                 where tt.id = template_task_tags.template_task_id
                   and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
