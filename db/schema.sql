-- ============================================================
--  Asana Clone — Esquema colaborativo
--  Modelo: tasks dentro de projects; acceso por membresia.
--  Correr en Supabase → SQL Editor.
-- ============================================================

-- Limpieza por si existia el modelo anterior
drop table if exists tasks cascade;
drop table if exists project_members cascade;
drop table if exists projects cascade;

-- ---------- TABLAS ----------

create table projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member',   -- 'owner' | 'member'
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  status      text not null default 'todo' check (status in ('todo','doing','done')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- FUNCIONES AUXILIARES ----------
-- SECURITY DEFINER: corren con permisos elevados y SALTAN el RLS por dentro,
-- lo que evita la recursion infinita al chequear membresia dentro de las policies.

create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from projects
    where id = p_project_id and owner_id = auth.uid()
  );
$$;

-- Crea un proyecto y agrega al creador como miembro 'owner', de forma atomica.
create or replace function public.create_project(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  insert into projects (name, owner_id) values (p_name, auth.uid())
    returning id into new_id;
  insert into project_members (project_id, user_id, role)
    values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

-- ---------- ROW LEVEL SECURITY ----------

alter table projects        enable row level security;
alter table project_members enable row level security;
alter table tasks           enable row level security;

-- PROJECTS: ves un proyecto si sos miembro; lo editas/borras si sos dueño.
create policy "ver proyectos donde soy miembro"
  on projects for select using (public.is_project_member(id));
create policy "el dueno edita el proyecto"
  on projects for update using (public.is_project_owner(id));
create policy "el dueno borra el proyecto"
  on projects for delete using (public.is_project_owner(id));

-- PROJECT_MEMBERS: los miembros ven la lista; el dueño agrega/quita miembros.
create policy "ver miembros de mis proyectos"
  on project_members for select using (public.is_project_member(project_id));
create policy "el dueno agrega miembros"
  on project_members for insert with check (public.is_project_owner(project_id));
create policy "el dueno quita miembros"
  on project_members for delete using (public.is_project_owner(project_id));

-- TASKS: cualquier miembro del proyecto puede ver y hacer CRUD de sus tareas.
create policy "ver tareas de mis proyectos"
  on tasks for select using (public.is_project_member(project_id));
create policy "crear tareas en mis proyectos"
  on tasks for insert with check (public.is_project_member(project_id));
create policy "editar tareas de mis proyectos"
  on tasks for update using (public.is_project_member(project_id));
create policy "borrar tareas de mis proyectos"
  on tasks for delete using (public.is_project_member(project_id));
