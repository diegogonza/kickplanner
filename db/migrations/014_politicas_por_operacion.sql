-- 014 · Reglas de escritura separadas por operación (aplicada como
-- 014_politicas_por_operacion). Las reglas "for all" de 012 se superponían
-- con las de lectura: Postgres evaluaba ambas en cada SELECT (aviso
-- multiple_permissive_policies de Supabase). Mismo efecto, sin superposición.

comment on table public.portal_access is
  'Accesos al portal de clientes. La app (rol authenticated) solo puede LEER las columnas client_id, slug y enabled (grant por columna, migración 012_roles): un select(''*'') falla con permission denied. password_hash solo lo tocan las funciones portal_*. Escritura: solo admin.';

drop policy if exists portal_access_admin_write on public.portal_access;
create policy portal_access_admin_insert on public.portal_access for insert to authenticated with check ((select public.is_admin()));
create policy portal_access_admin_update on public.portal_access for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy portal_access_admin_delete on public.portal_access for delete to authenticated using ((select public.is_admin()));

drop policy if exists google_oauth_admin_write on public.google_oauth;
create policy google_oauth_admin_insert on public.google_oauth for insert to authenticated with check ((select public.is_admin()));
create policy google_oauth_admin_update on public.google_oauth for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy google_oauth_admin_delete on public.google_oauth for delete to authenticated using ((select public.is_admin()));

drop policy if exists template_tasks_write on public.template_tasks;
create policy template_tasks_insert on public.template_tasks for insert to authenticated
  with check (exists (select 1 from templates t where t.id = template_tasks.template_id
                      and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
create policy template_tasks_update on public.template_tasks for update to authenticated
  using (exists (select 1 from templates t where t.id = template_tasks.template_id
                 and (t.owner_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from templates t where t.id = template_tasks.template_id
                      and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
create policy template_tasks_delete on public.template_tasks for delete to authenticated
  using (exists (select 1 from templates t where t.id = template_tasks.template_id
                 and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));

drop policy if exists template_task_tags_write on public.template_task_tags;
create policy template_task_tags_insert on public.template_task_tags for insert to authenticated
  with check (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                      where tt.id = template_task_tags.template_task_id
                        and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
create policy template_task_tags_update on public.template_task_tags for update to authenticated
  using (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                 where tt.id = template_task_tags.template_task_id
                   and (t.owner_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                      where tt.id = template_task_tags.template_task_id
                        and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
create policy template_task_tags_delete on public.template_task_tags for delete to authenticated
  using (exists (select 1 from template_tasks tt join templates t on t.id = tt.template_id
                 where tt.id = template_task_tags.template_task_id
                   and (t.owner_id = (select auth.uid()) or (select public.is_admin()))));
