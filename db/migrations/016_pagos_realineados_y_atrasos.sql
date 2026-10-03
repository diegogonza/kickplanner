-- 016 · Pagos: realinear cobros al cambiar la fecha de inicio, pausar cobros de
-- proyectos detenidos y exponer el atraso en la lista de proyectos (solo admin).
-- Aplicada en partes el 02-oct-2026 (016a backup, 016b realineación + trigger,
-- 016c generación, 016d atraso, 016e pausa, 016f generación+resumen). Las partes con DELETE piden confirmación en Supabase. Contexto y decisiones en PLAN-MEJORAS-PROYECTOS.md.
--
-- Problema que corrige: generate_client_payments() crea un cobro por mes en
-- start_date + k meses y usa ON CONFLICT (project_id, period) DO NOTHING. Si
-- la fecha de inicio cambia, los cobros viejos se quedan en sus fechas y se
-- generan otros nuevos: cada mes queda cobrado dos veces (había 21 cobros
-- huérfanos en 7 proyectos) y, peor, un historial PAGADO queda desalineado y
-- se regenera como pendiente.

-- 0 · Copia de seguridad (esquema no expuesto por la API) ---------------------
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.client_payments_20261002 as
  select * from public.client_payments;

-- 1 · Realinear los cobros mensuales de un proyecto ---------------------------
create or replace function public.realign_project_payments(p_project uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_start date;
  v_hoy   date := (now() at time zone 'America/Bogota')::date;
begin
  select start_date into v_start from projects where id = p_project and type = 'seo';
  if v_start is null then return; end if;

  -- a) Un cobro por mes (seq). Se conserva el pagado; si no hay, el que ya cae
  --    en la fecha correcta; si tampoco, el más reciente. Nunca se borra un
  --    cobro pagado.
  delete from client_payments cp
  using (
    select id, status,
           row_number() over (
             partition by seq
             order by (status = 'paid') desc,
                      -- 016g: un anulado gana a un pendiente (se anuló a propósito)
                      (status = 'void') desc,
                      (period = (v_start + ((seq - 1) || ' months')::interval)::date) desc,
                      created_at desc
           ) as rn
    from client_payments
    where project_id = p_project and kind = 'recurring'
  ) d
  where cp.id = d.id and d.rn > 1 and d.status <> 'paid';

  -- Dos cobros PAGADOS del mismo mes: no se adivina cuál vale. Se deja todo
  -- como está para revisarlo a mano en /pagos.
  if exists (
    select 1 from client_payments
    where project_id = p_project and kind = 'recurring'
    group by seq having count(*) > 1
  ) then
    raise notice 'realign_project_payments(%): hay meses con dos cobros pagados; no se realinea', p_project;
    return;
  end if;

  -- b) Mover cada cobro a inicio + (seq - 1) meses. Se pasa antes por una
  --    fecha temporal porque UNIQUE (project_id, period) no es diferible y un
  --    corrimiento puede pisar la fecha que otro cobro está dejando libre.
  update client_payments
     set period = date '3000-01-01' + seq
   where project_id = p_project and kind = 'recurring'
     and period is distinct from (v_start + ((seq - 1) || ' months')::interval)::date;

  update client_payments
     set period = (v_start + ((seq - 1) || ' months')::interval)::date
   where project_id = p_project and kind = 'recurring'
     and period >= date '3000-01-01';

  -- c) Si el inicio se movió hacia adelante, los pendientes que ahora caen en
  --    el futuro sobran: generate_client_payments() los crea cuando toque.
  --    Un pagado en el futuro es un pago adelantado y se respeta.
  delete from client_payments
   where project_id = p_project and kind = 'recurring'
     and status <> 'paid' and period > v_hoy;
end
$function$;

revoke all on function public.realign_project_payments(uuid) from public, anon, authenticated;

comment on function public.realign_project_payments(uuid) is
  'Deja un cobro mensual por seq y lo mueve a start_date + (seq-1) meses, conservando el estado de pago. La llama el trigger trg_projects_realign_payments al cambiar start_date. No ejecutable desde la API.';

-- 2 · Trigger: realinear cuando cambia la fecha de inicio ---------------------
create or replace function public.tg_projects_realign_payments()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.realign_project_payments(new.id);
  return null;
end
$function$;

revoke all on function public.tg_projects_realign_payments() from public, anon, authenticated;

drop trigger if exists trg_projects_realign_payments on public.projects;
create trigger trg_projects_realign_payments
  after update of start_date on public.projects
  for each row
  when (old.start_date is distinct from new.start_date and new.type = 'seo')
  execute function public.tg_projects_realign_payments();

-- 3 · Generación: fecha de Bogotá y sin cobros en meses detenidos (016c+016f)
create or replace function public.generate_client_payments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if not public.is_admin() then return; end if;
  insert into public.client_payments (project_id, period, seq, amount, currency, kind)
  select p.id, x.periodo, g.k, coalesce(p.fee, 0), coalesce(p.currency, 'COP'), 'recurring'
  from public.projects p
  cross join lateral generate_series(
     1,
     (extract(year from age(v_hoy, p.start_date)) * 12
      + extract(month from age(v_hoy, p.start_date)))::int + 1
  ) as g(k)
  cross join lateral (select (p.start_date + ((g.k - 1) || ' months')::interval)::date as periodo) x
  where p.type = 'seo' and p.start_date is not null
    -- Detenido hoy = no se cobra.
    and p.status <> 'on_hold'
    and x.periodo <= v_hoy
    -- Detenido en la fecha de ese cobro (historial) = tampoco. Sin esto, al
    -- reactivar un proyecto se rellenaban como pendientes los meses de la pausa.
    and (
      select u.status from public.project_status_updates u
      where u.project_id = p.id
        and (u.created_at at time zone 'America/Bogota')::date <= x.periodo
      order by u.created_at desc limit 1
    ) is distinct from 'on_hold'
    -- Un mes ya registrado (por número) no se vuelve a crear en otra fecha.
    and not exists (
      select 1 from public.client_payments c
      where c.project_id = p.id and c.kind = 'recurring' and c.seq = g.k
    )
  on conflict (project_id, period) do nothing;
end $function$;

-- 4 · Atraso de pagos por proyecto (solo admin) ------------------------------
-- Función aparte y no columnas nuevas en projects_overview(): cambiar el tipo
-- de retorno obliga a DROP FUNCTION, y projects_overview también la usan
-- /buscar y la búsqueda avanzada, que no necesitan datos financieros.
create or replace function public.payments_overdue_by_project()
returns table(project_id uuid, overdue_count integer, overdue_amount numeric, overdue_since date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Cobros sin pagar cuya fecha ya pasó (mes anticipado: vence el mismo día,
  -- atraso desde el siguiente). Mismo criterio que el "Vencido" de /pagos.
  -- Información financiera: solo admin; para el resto no devuelve filas.
  select cp.project_id, count(*)::int, sum(cp.amount), min(cp.period)
  from client_payments cp
  where public.is_admin()
    and cp.status = 'pending'
    and cp.period is not null
    and cp.period < (now() at time zone 'America/Bogota')::date
    -- 016e · La deuda llega hasta la pausa: no cuenta un cobro si en su fecha
    -- el proyecto estaba detenido (último cambio de project_status_updates
    -- hasta ese día, fecha de Bogotá). Si se reactiva, vuelve a contar.
    and (
      select u.status
      from project_status_updates u
      where u.project_id = cp.project_id
        and (u.created_at at time zone 'America/Bogota')::date <= cp.period
      order by u.created_at desc
      limit 1
    ) is distinct from 'on_hold'
  group by cp.project_id
$function$;

revoke all on function public.payments_overdue_by_project() from public, anon;
grant execute on function public.payments_overdue_by_project() to authenticated, service_role;

-- 4b · Resumen para /projects (016f): atraso con la regla de la pausa y último
-- mes recurrente pagado (paid_through), para que la cuenta regresiva salte los
-- cobros ya pagados. Reemplaza a payments_overdue_by_project() en la app; esa
-- función queda sin uso y se puede eliminar.
create or replace function public.payments_summary_by_project()
returns table(project_id uuid, overdue_count integer, overdue_amount numeric, overdue_since date, paid_through date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select cp.*,
      (cp.status = 'pending'
        and cp.period is not null
        and cp.period < (now() at time zone 'America/Bogota')::date
        and (
          select u.status from project_status_updates u
          where u.project_id = cp.project_id
            and (u.created_at at time zone 'America/Bogota')::date <= cp.period
          order by u.created_at desc limit 1
        ) is distinct from 'on_hold') as vencido
    from client_payments cp
    where public.is_admin()
  )
  select project_id,
    (count(*) filter (where vencido))::int,
    sum(amount) filter (where vencido),
    min(period) filter (where vencido),
    max(period) filter (where status = 'paid' and kind = 'recurring')
  from base
  group by project_id
$function$;

revoke all on function public.payments_summary_by_project() from public, anon;
grant execute on function public.payments_summary_by_project() to authenticated, service_role;

-- 4c · Cobros anulados (016g) ------------------------------------------------
-- "Eliminar" un cobro mensual en /pagos lo anula (status = 'void') en vez de
-- borrarlo, porque generate_client_payments() recrearía el mes que falte. Las
-- funciones de atraso cuentan status = 'pending' (no "<> 'paid'").
comment on column public.client_payments.status is
  'pending | paid | void. void = cobro anulado desde /pagos: el mes queda registrado (no se regenera) pero no se cobra ni cuenta como deuda.';

-- 5 · Limpieza única: realinear todos los SEO con fecha de inicio ------------
select public.realign_project_payments(p.id)
from public.projects p
where p.type = 'seo' and p.start_date is not null;
