# Roadmap — Asana Clone (fase premium)

Documento de planificación técnica. Alcance acordado y ordenado según lo definido.
Base: Supabase `asana-clone` (Postgres 17), Next.js 16 + React 19.

## Alcance de esta etapa

**Dentro:**

1. Vista **Mis tareas** (qué debo entregar esta semana) — *primera fase*
2. Vista **Calendario** (solo por fecha de entrega)
3. Campo **enlace de Drive** con tarjeta de vista previa incrustada + edición en pestaña nueva
4. **Notificaciones**: menciones (@) en comentarios + historial de actividad de tarea/subtarea + vista de notificaciones

**Fuera por ahora (fase posterior):** campos personalizados en tareas, dependencias entre tareas, secciones personalizables, automatizaciones/reglas, metas/OKRs, workload, aprobaciones, reportes con gráficos.

## Punto de partida (esquema actual)

Tabla `tasks` ya tiene: `id, project_id, title, description, status (todo/doing/done), priority (baja/media/alta/urgente), due_date, assignee_id, parent_id (subtareas), created_by, created_at`.
Tabla `comments`: `id, task_id, author_id, body, created_at`.
Membresía: `project_members`, `team_members`. RLS activo en todas las tablas.

Esto significa que **Mis tareas** y **Calendario** casi no requieren cambios de base: las columnas necesarias (`assignee_id`, `due_date`) ya existen.

---

## Fase 9 — Vista "Mis tareas"

**Objetivo:** que cada persona vea, en un solo lugar, todas las tareas que le fueron asignadas en cualquier proyecto, agrupadas por urgencia de entrega.

**Base de datos:** sin tablas nuevas. Solo un índice para rendimiento:

```sql
create index if not exists idx_tasks_assignee on public.tasks (assignee_id) where assignee_id is not null;
create index if not exists idx_tasks_due on public.tasks (due_date) where due_date is not null;
```

**Backend:** una consulta (server action o RPC `my_tasks()`) que traiga las tareas con `assignee_id = auth.uid()`, unidas al nombre del proyecto. La RLS actual ("ver tareas de mis proyectos") ya lo permite. Se agrupan en el servidor o cliente en cubos: **Vencidas**, **Esta semana**, **Próximas**, **Sin fecha**, y opción de ver **Completadas**.

**Frontend:**
- Nueva ruta `/mis-tareas` y su ítem en el sidebar.
- Lista agrupada por los cubos de fecha; cada fila muestra proyecto, prioridad, fecha y checkbox para completar.
- Clic en una tarea abre el panel de detalle existente.

**Criterios de aceptación:** solo aparecen mis tareas; el cubo "Esta semana" respeta lunes–domingo; completar una tarea la mueve/oculta al instante.

**Estimación:** baja (1 migración de índices + 1 vista).

---

## Fase 10 — Vista Calendario (por fecha de entrega)

**Objetivo:** ver las tareas ubicadas en el día de su `due_date`, dentro de un proyecto.

**Base de datos:** sin cambios (usa `due_date`; índice ya creado en Fase 9).

**Backend:** consulta de tareas del proyecto con `due_date` dentro del mes visible.

**Frontend:**
- Nueva pestaña **Calendario** junto a Resumen / Lista / Tablero / Etiquetas.
- Cuadrícula mensual; cada tarea se pinta en la celda de su fecha de entrega (color por prioridad).
- Navegación mes anterior / siguiente; clic en tarea abre el panel de detalle.
- (Opcional) reutilizar el mismo componente en "Mis tareas" para un calendario global.

**Criterios de aceptación:** las tareas caen en el día correcto; cambiar de mes funciona; las tareas sin fecha no aparecen (por diseño).

**Estimación:** media (componente de calendario nuevo, sin lógica de servidor compleja).

---

## Fase 11 — Campo enlace de Drive + tarjeta de vista previa

**Objetivo:** adjuntar a una tarea un enlace de Google Drive y verlo como tarjeta con vista previa incrustada, con botón para abrir/editar en Drive en pestaña nueva.

**Base de datos:** una columna nueva en `tasks`:

```sql
alter table public.tasks add column if not exists drive_url text;
```

*(Si más adelante quieres varios archivos por tarea, se migra a una tabla `task_links`; por ahora un enlace por tarea, como acordado.)*

**Backend:** al guardar, se valida que el host sea `drive.google.com` o `docs.google.com` (evita incrustar dominios arbitrarios) y se extrae el ID del archivo para construir:
- URL de vista previa: `https://drive.google.com/file/d/{ID}/preview` (o el `/preview` de Docs/Sheets/Slides).
- URL de edición: el `/edit` original, abierto con `target="_blank"`.

**Frontend (panel de detalle de la tarea):**
- Campo para pegar el enlace.
- Tarjeta con vista previa incrustada (`<iframe>` con `sandbox`) del archivo.
- Botón **"Abrir/editar en Drive"** que abre la edición en pestaña nueva.
- Aviso: para que la vista previa cargue, el archivo debe estar compartido como *"cualquiera con el enlace"*.

**Nota técnica:** Google **no permite editar un archivo incrustado** dentro de otra web; la edición siempre ocurre en la pestaña de Drive. La app da vista previa (lectura) + acceso directo a editar.

**Criterios de aceptación:** pegar un enlace válido muestra la vista previa; un enlace no-Drive se rechaza; el botón abre la edición en Drive.

**Estimación:** media (parsing de URL + iframe + validación de seguridad).

---

## Fase 12 — Notificaciones: menciones, historial de actividad y bandeja

La fase más grande. Se divide en tres piezas que se apoyan entre sí.

### 12a. Historial de actividad (tarea y subtarea)

**Base de datos:**

```sql
create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references auth.users(id),
  type text not null,          -- created | status | assignee | due | priority | comment | subtask
  meta jsonb,                  -- valores antes/después
  created_at timestamptz not null default now()
);
create index idx_activity_task on public.task_activity (task_id, created_at);
```

Se registran los eventos mediante **triggers** en `tasks` y `comments` (más fiable que hacerlo en el código de la app). Cada cambio de estado, responsable, fecha o prioridad, y cada comentario, genera una línea de actividad.

### 12b. Menciones (@) en comentarios

**Base de datos:**

```sql
create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  primary key (comment_id, user_id)
);
```

**Frontend:** el compositor de comentarios detecta `@` y muestra un desplegable con los **miembros del proyecto** (ya existe `project_members_list`). Al enviar, se guardan las menciones y se generan notificaciones.

### 12c. Bandeja de notificaciones

**Base de datos:**

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),   -- destinatario
  actor_id uuid references auth.users(id),           -- quien la origina
  task_id uuid references public.tasks(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  type text not null,          -- mention | assigned | activity
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notif_user on public.notifications (user_id, read, created_at);
```

Se crea una notificación cuando: te **mencionan** en un comentario, o te **asignan** una tarea. (La actividad general se ve en la tarea; opcionalmente también puede notificar.)

**RLS:** cada quien ve solo sus notificaciones (`user_id = auth.uid()`); la actividad es visible para miembros del proyecto.

**Frontend:**
- Campana en la barra superior con contador de no leídas.
- Vista `/notificaciones` con la lista (menciones, asignaciones); clic abre la tarea y marca como leída.
- El historial de actividad se muestra en el panel de la tarea, intercalado con los comentarios en orden cronológico.
- (Opcional) Supabase Realtime para que el contador se actualice en vivo.

**Criterios de aceptación:** mencionar a alguien le crea notificación; asignar una tarea notifica al nuevo responsable; la actividad aparece en la tarea; la bandeja lista y marca como leído.

**Estimación:** alta (3 tablas + triggers + autocompletado + bandeja + badge).

---

## Higiene técnica (a incluir en el camino)

- **Actualizar `db/schema.sql`** tras cada migración — hoy tiene 3 tablas y la base real tiene 12+.
- **Activar protección de contraseñas filtradas** en Supabase Auth (chequeo contra HaveIBeenPwned) — está desactivada.
- Revisar las funciones `SECURITY DEFINER` que el linter marca (`invite_member`, `add_team_member`, `create_project`) para confirmar que validan al llamante.
- Índices ya contemplados en cada fase.

## Orden de ejecución y dependencias

1. **Fase 9 — Mis tareas** (independiente, rápida, alto valor)
2. **Fase 10 — Calendario** (independiente)
3. **Fase 11 — Campo Drive** (independiente)
4. **Fase 12 — Notificaciones** (la mayor; 12a→12b→12c)

Ninguna fase bloquea a otra, así que se pueden entregar y commitear una por una.
