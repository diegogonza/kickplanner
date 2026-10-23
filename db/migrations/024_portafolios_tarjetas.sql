-- 024 · Portafolios: tarjetas, portada, descripción y visibilidad para admins
--
-- 1. portfolios gana description, cover (portada predefinida) y updated_at.
-- 2. Los administradores ven y gestionan todos los portafolios (antes solo el
--    creador). is_portfolio_owner/owns_field cubren también a los admins, así
--    que proyectos, campos y valores de un portafolio ajeno también se ven.
-- 3. portfolios_cards(): todo lo que pinta la tarjeta en una sola consulta.
--    Los fees solo se devuelven a administradores.

alter table public.portfolios
  add column if not exists description text,
  add column if not exists cover text not null default 'bosque',
  add column if not exists updated_at timestamptz not null default now();

alter table public.portfolios drop constraint if exists portfolios_cover_check;
alter table public.portfolios
  add constraint portfolios_cover_check
  check (cover in ('bosque', 'noche', 'esmeralda', 'oxido', 'menta', 'carbon'));

alter table public.portfolios drop constraint if exists portfolios_description_len;
alter table public.portfolios
  add constraint portfolios_description_len check (char_length(description) <= 280);

create or replace function public.portfolios_touch_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists portfolios_touch on public.portfolios;
create trigger portfolios_touch before update on public.portfolios
  for each row execute function public.portfolios_touch_updated_at();

-- Dueño o administrador
create or replace function public.is_portfolio_owner(p_portfolio_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from portfolios
    where id = p_portfolio_id and (owner_id = auth.uid() or public.is_admin())
  );
$$;

create or replace function public.owns_field(p_field_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from portfolio_fields pf
    join portfolios p on p.id = pf.portfolio_id
    where pf.id = p_field_id and (p.owner_id = auth.uid() or public.is_admin())
  );
$$;

drop policy if exists "ver mis portfolios" on public.portfolios;
drop policy if exists "editar mis portfolios" on public.portfolios;
drop policy if exists "borrar mis portfolios" on public.portfolios;

create policy "ver mis portfolios" on public.portfolios
  for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "editar mis portfolios" on public.portfolios
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy "borrar mis portfolios" on public.portfolios
  for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

-- Datos de las tarjetas de /portfolios
create or replace function public.portfolios_cards()
returns table (
  id uuid,
  name text,
  description text,
  cover text,
  owner_id uuid,
  owner_name text,
  created_at timestamptz,
  last_activity timestamptz,
  project_count int,
  active_count int,
  seo_count int,
  web_count int,
  open_tasks int,
  overdue_tasks int,
  managers jsonb,
  clients jsonb,
  seo_fees jsonb
)
language sql stable security definer set search_path to 'public' as $$
  select
    v.id, v.name, v.description, v.cover, v.owner_id, op.full_name, v.created_at,
    greatest(v.updated_at, c.last_link, t.last_task, a.last_act),
    coalesce(c.project_count, 0), coalesce(c.active_count, 0),
    coalesce(c.seo_count, 0), coalesce(c.web_count, 0),
    coalesce(t.open_tasks, 0), coalesce(t.overdue_tasks, 0),
    mg.managers, cl.clients, fe.seo_fees
  from portfolios v
  left join profiles op on op.id = v.owner_id
  left join lateral (
    select count(*)::int as project_count,
           count(*) filter (where p.status in ('on_track', 'at_risk'))::int as active_count,
           count(*) filter (where p.type = 'seo')::int as seo_count,
           count(*) filter (where p.type = 'web')::int as web_count,
           max(x.created_at) as last_link
    from portfolio_projects x join projects p on p.id = x.project_id
    where x.portfolio_id = v.id
  ) c on true
  left join lateral (
    select count(*) filter (where tk.status <> 'done')::int as open_tasks,
           count(*) filter (where tk.status <> 'done'
             and tk.due_date < (now() at time zone 'America/Bogota')::date)::int as overdue_tasks,
           max(tk.created_at) as last_task
    from portfolio_projects x join tasks tk on tk.project_id = x.project_id
    where x.portfolio_id = v.id and tk.parent_id is null
  ) t on true
  left join lateral (
    select max(ac.created_at) as last_act
    from portfolio_projects x
    join tasks tk on tk.project_id = x.project_id
    join task_activity ac on ac.task_id = tk.id
    where x.portfolio_id = v.id
  ) a on true
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.full_name, 'avatar_url', m.avatar_url)
             order by m.full_name), '[]'::jsonb) as managers
    from (
      select distinct pr.id, pr.full_name, pr.avatar_url
      from portfolio_projects x
      join projects p on p.id = x.project_id
      join profiles pr on pr.id = p.manager_id
      where x.portfolio_id = v.id
    ) m
  ) mg on true
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'url', p.url) order by p.name), '[]'::jsonb) as clients
    from portfolio_projects x join projects p on p.id = x.project_id
    where x.portfolio_id = v.id
  ) cl on true
  left join lateral (
    select case when public.is_admin() then jsonb_object_agg(f.currency, f.total) end as seo_fees
    from (
      select coalesce(p.currency, 'COP') as currency, sum(p.fee) as total
      from portfolio_projects x join projects p on p.id = x.project_id
      where x.portfolio_id = v.id and p.type = 'seo' and p.fee is not null and p.status <> 'on_hold'
      group by 1
    ) f
  ) fe on true
  where v.owner_id = auth.uid() or public.is_admin()
  order by v.name;
$$;

revoke all on function public.portfolios_cards() from public, anon;
grant execute on function public.portfolios_cards() to authenticated;
