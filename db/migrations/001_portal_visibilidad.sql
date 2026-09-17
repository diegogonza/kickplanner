-- 001 — Portal de clientes: visibilidad tarea por tarea
-- Fase 1 del MVP. Ver PLAN-PORTAL-CLIENTES.md apartados 4.3 y 4.4.
--
-- NO APLICADA TODAVÍA. Requiere visto bueno.
--
-- Es aditiva y reversible: agrega dos columnas con default false y un índice
-- parcial. No modifica ninguna fila existente ni ninguna política.
-- Después de aplicarla, el portal sigue sin existir y nada cambia para el equipo
-- hasta que se construya la interfaz de marcado.

begin;

-- 1. Visibilidad en tareas. Por defecto NADA es visible: las 799 tareas
--    actuales quedan invisibles a propósito.
alter table public.tasks
  add column if not exists client_visible boolean not null default false;

-- 2. Mismo campo en las plantillas, para que apply_template() lo propague y el
--    flujo normal de la agencia deje premarcados los entregables estándar.
alter table public.template_tasks
  add column if not exists client_visible boolean not null default false;

-- 3. Índice parcial: las consultas del portal siempre filtran por
--    project_id + client_visible, y las visibles serán una minoría.
create index if not exists idx_tasks_client_visible
  on public.tasks (project_id)
  where client_visible;

commit;


-- ---------------------------------------------------------------------------
-- CONSULTA DE ARRANQUE — NO se ejecuta con la migración.
--
-- Problema: marcar 330 tareas principales a mano no va a ocurrir, y un portal
-- vacío parece roto.
--
-- Primera idea (descartada): marcar las tareas completadas con drive_url.
-- Se probó y devuelve 3 filas. No resuelve nada.
--
-- Eje elegido: LAS ETIQUETAS. Las 245 asignaciones de etiqueta están todas
-- sobre tareas principales, y los nombres ya separan trabajo de cara al
-- cliente de trabajo interno:
--
--     On-page     58     Backlog     29   <- interno
--     Inbound     41     Proposals    5   <- interno
--     Reports     40     Local        3
--     UI/UX       36
--     Technical   33
--
-- Son 8 decisiones en vez de 330, y cubren el 74% de las tareas principales.
--
-- Paso 1: ver qué hay dentro de cada etiqueta antes de decidir.
-- ---------------------------------------------------------------------------
-- select g.name as etiqueta, t.title, count(*) over (partition by g.name) as total
-- from task_tags tt
-- join tags g  on g.id = tt.tag_id
-- join tasks t on t.id = tt.task_id
-- where t.parent_id is null
-- order by g.name, t.title;
--
-- Paso 2: marcar las etiquetas que el equipo decida que son de cara al
--         cliente. Ajustar la lista antes de ejecutar.
-- ---------------------------------------------------------------------------
-- update tasks t set client_visible = true
-- where t.parent_id is null
--   and exists (
--     select 1 from task_tags tt join tags g on g.id = tt.tag_id
--     where tt.task_id = t.id
--       and g.name in ('Reports')       -- <- LISTA A DEFINIR CON EL EQUIPO
--   );
--
-- Paso 3: revisar el resto. Quedan ~85 tareas principales sin etiqueta, más
--         las de etiquetas no elegidas. Se resuelven con la acción masiva de
--         la vista Lista, proyecto por proyecto.
-- ---------------------------------------------------------------------------
-- select p.name, t.title from tasks t
-- join projects p on p.id = t.project_id
-- where t.parent_id is null and not t.client_visible
--   and not exists (select 1 from task_tags tt where tt.task_id = t.id)
-- order by p.name, t.title;


-- ---------------------------------------------------------------------------
-- REVERSIÓN
-- ---------------------------------------------------------------------------
-- begin;
--   drop index if exists idx_tasks_client_visible;
--   alter table public.template_tasks drop column if exists client_visible;
--   alter table public.tasks          drop column if exists client_visible;
-- commit;
