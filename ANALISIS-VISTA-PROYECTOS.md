# Vista `/projects` — análisis funcional y técnico

> **Fecha:** 22-sep-2026 · **Repo:** `asana-clone` @ `main` · **Stack:** Next 16.2.12 · React 19.2.4 · Supabase `nowiyhgvlaskihnugotr`
> **Alcance:** todo lo que ocurre en la ruta `/projects` (la lista, no `/projects/[id]`) con un usuario del equipo **ya autenticado**.
> Verificado contra el código en disco y contra la base real (RPC, políticas RLS, índices, zona horaria).
>
> **Estado (22-sep-2026):** los hallazgos marcados ✅ ya están implementados —ver
> `PLAN-MEJORAS-PROYECTOS.md`—, así que las secciones 2 a 7 describen la vista
> **antes** de esa tanda en los puntos que cambiaron. **F-02 quedó anulado: era
> un error mío, no un fallo del repo.**

---

## 1. Mapa de archivos

| Archivo | Líneas | Rol |
|---|---:|---|
| `app/projects/page.tsx` | 63 | Server Component. Sesión, 4 consultas, filtro por cliente, chrome de la página. |
| `app/components/projects-view.tsx` | 764 | Client Component. Toda la interacción: filtros, agrupación, tabla, asistente de creación. |
| `app/projects/actions.ts` | 688 | Server Actions. Las 6 primeras son de proyecto; el resto (tareas, etiquetas, comentarios) no se usan aquí. |
| `app/projects/statuses.ts` | 158 | Catálogos (estados, tipos, prioridades) y utilidades de fecha y moneda. |
| `app/components/project-edit-modal.tsx` | ~280 | Modal de edición, compartido con la vista de proyecto. Se monta con portal en `<body>`. |
| `app/components/new-project-trigger.tsx` | 17 | Botón del header. Dispara un evento de `window`. |
| `app/components/use-sticky-head.ts` | 62 | Detecta si el encabezado de la tabla ya quedó fijo (clase `is-stuck`). |
| `app/components/avatar.tsx` | 50 | Avatar con foto o inicial coloreada por hash del correo. |
| `app/components/toast.tsx` | ~110 | Avisos flotantes por evento de `window`; `<Toaster/>` vive en el layout raíz. |
| `app/lib/session.ts` | 43 | `getSessionProfile()`, cacheado por request con `cache()` de React. |
| `app/lib/permissions.ts` | 30 | `isAdmin()`, `OK`, `DENIED`, `failed()`, tipo `ActionResult`. |
| `app/projects/drive.ts` | 58 | **No lo usa esta vista** (es del detalle de tarea). |
| `app/globals.css` | — | Clases `.projtable*`, `.projfilters`, `.proj-pill`, `.wizard-*`, `.proj-age`, `.risk-hint`. |

En la base: `projects_overview()`, `workspace_members()`, `create_project()`, `set_project_status()`, `apply_template()`, `is_admin()`, `is_project_member()`.

---

## 2. Qué ocurre, paso a paso

### 2.1 Antes de que corra la página

1. **No hay `middleware.ts` en el proyecto.** `utils/supabase/middleware.ts` exporta `updateSession()`, pero `grep -rn "updateSession" app utils` solo devuelve su propia definición: **nadie la importa**. No existe guardia global ni refresco de sesión en el borde. Ver `F-02`.
2. `app/layout.tsx` monta el shell: `AppChrome`, `GlobalSearch` (dentro de `Suspense`) y `Toaster`. `<html>` y `<body>` llevan `suppressHydrationWarning`.
3. No hay `loading.tsx` para `/projects` (sí existe para `/projects/[id]`), así que la navegación se bloquea hasta que la página resuelve entera.

### 2.2 Render en el servidor (`app/projects/page.tsx`)

La página es `async` y usa `cookies()` a través de `createClient()`, así que es dinámica siempre (sin caché de ruta).

1. `await searchParams` → lee `?client=<uuid>`.
2. `getSessionProfile()`:
   - `supabase.auth.getClaims()` verifica la firma del JWT de la cookie (local, sin viaje a Supabase, si el proyecto usa claves asimétricas).
   - Sin `claims.sub` → `redirect('/login')`. **Esta es la única barrera de autenticación de la ruta.**
   - Con sesión, consulta `profiles` → `full_name`, `avatar_url`, `role`. `isAdmin = role === 'admin'`.
   - Va envuelto en `cache()`: el `Sidebar` lo vuelve a pedir y no repite la consulta.
3. **Cuatro consultas, una detrás de otra (no en paralelo):**

   | # | Llamada | Devuelve |
   |---|---|---|
   | 1 | `rpc('projects_overview')` | la lista completa de proyectos visibles, ya agregada |
   | 2 | `from('clients').select('id, name').order('name')` | opciones del selector de cliente |
   | 3 | `from('templates').select('id, name, type').order('name')` | plantillas del asistente de creación |
   | 4 | `rpc('workspace_members')` | todo el equipo, para el selector de encargado |

4. Filtro por cliente **en memoria**: `all.filter(p => p.client_id === clientFilter)`. No baja a la base.
5. Render: `<Sidebar active="projects" />`, `topbar` con el conteo y `<NewProjectTrigger/>`, barra de "Filtrado por cliente X" si venía el parámetro, y `<ProjectsView …/>`.

### 2.3 Hidratación en el cliente

`ProjectsView` es `'use client'`, así que se renderiza primero en el servidor y luego hidrata. En ese momento:

- Se monta el listener `window.addEventListener('open-new-project', …)` que conecta el botón del header con el modal de creación.
- `useStickyHead()` engancha un `IntersectionObserver` sobre un centinela de 1px puesto encima del encabezado, con `root` = el ancestro con `overflow-y: auto` (`.viewscroll`).
- Todo el filtrado, el conteo de las píldoras y la agrupación pasan a ser estado de React. **Ninguna interacción de filtrado vuelve al servidor.**

### 2.4 Ciclo de una acción

Todas las acciones de la fila son `<form action={serverAction}>` (sin JS de por medio para el envío):

```
clic → Server Action → isAdmin() (donde aplica) → escritura Supabase (RLS)
     → { count } para detectar el rechazo silencioso de RLS
     → revalidatePath('/', '/projects', '/projects/[id]')
     → React re-renderiza el Server Component → toastIfFailed() muestra el error si lo hubo
```

`revalidatePath('/')` es correcto: `app/panel/page.tsx` hoy solo hace `redirect('/')`, la portada real es `app/page.tsx`.

---

## 3. La consulta que sostiene la vista: `projects_overview()`

`SECURITY DEFINER`, `search_path = public`, lenguaje SQL.

```sql
from projects p
left join clients c on c.id = p.client_id
where public.is_project_member(p.id)
order by favorite desc, last_activity desc
```

Devuelve 20 columnas. Seis se calculan con **subconsultas correlacionadas, una por proyecto**:

| Columna | Cómo se calcula | ¿La usa la vista? |
|---|---|---|
| `status_note` | última nota de `project_status_updates` | ❌ no se muestra |
| `overdue` | `count(tasks)` con `due_date < current_date and status <> 'done'` | ✅ columna "Vencidas" |
| `last_activity` | `greatest(p.created_at, max(task_activity.created_at))` vía join con `tasks` | ✅ columna "Actividad" |
| `favorite` | `exists(project_favorites … user_id = auth.uid())` | ✅ estrella y orden |
| `num_tasks` | `count(tasks)` con `parent_id is null` | ❌ nunca se renderiza |
| `manager` / `manager_avatar` | `auth.users` + `profiles` | ✅ columna "Encargado" |

`description`, `client_id` y `type` sí se usan; `created_at` no.

**Visibilidad:** `is_project_member(p.id)` = estar en `project_members` **o** pertenecer al `team_members` del equipo del proyecto. No hay rol de solo lectura: quien ve, potencialmente escribe (ver `F-06`).

**Orden:** fijo en la base y **dependiente del usuario** (`favorite` sale de `auth.uid()`), así que el resultado no es cacheable entre personas.

---

## 4. Catálogo de funciones

### 4.1 Servidor — página

| Función | Archivo | Qué hace |
|---|---|---|
| `Home({ searchParams })` | `page.tsx` | Único Server Component de la ruta. Sesión, 4 consultas, filtro por cliente, layout. |
| `getSessionProfile()` | `lib/session.ts` | Valida el JWT y resuelve perfil + `isAdmin`. Cacheada por request. |
| `isAdmin()` | `lib/permissions.ts` | Azúcar sobre la anterior. |
| `createClient()` | `utils/supabase/server.ts` | Cliente SSR con cookies. **`setAll` está envuelto en `try/catch` vacío**: desde un Server Component no puede escribir cookies y lo ignora en silencio. |

### 4.2 Servidor — Server Actions usadas por esta vista

| Acción | Guarda | Valida | Escribe | Revalida | Devuelve |
|---|---|---|---|---|---|
| `createProject(fd)` | `isAdmin()` | nombre no vacío, `client_id` obligatorio, `parseFee`, `parseUrl` | `rpc create_project` → `update projects` → `rpc set_project_status` → `rpc apply_template` | `/`, `/projects` | `ActionResult` (con lista de pendientes si falló un paso) |
| `updateProject(fd)` | `isAdmin()` | idem + solo aplica los campos **presentes** en el FormData | `update projects` + `rpc set_project_status` si cambió el estado | `/`, `/projects`, `/projects/:id` | `ActionResult` |
| `setProjectManager(fd)` | `isAdmin()` | — | `update projects.manager_id` | `/`, `/projects`, `/projects/:id` | `ActionResult` |
| `setProjectStatus(fd)` | **ninguna** | estado dentro del enum | `rpc set_project_status` | `/`, `/projects`, `/projects/:id` | `void` |
| `toggleFavorite(fd)` | **ninguna** | — | `insert`/`delete` en `project_favorites` | `/`, `/projects` | `void` |
| `deleteProject(fd)` | `isAdmin()` | — | `delete projects` (cascada a tareas) | `/`, `/projects` | `ActionResult` |
| `setProjectUrl(fd)` | `isAdmin()` | `parseUrl` | `update projects.url` | `/`, `/projects`, `/projects/:id` | `ActionResult` — **definida pero no invocada desde esta vista** (la celda de URL abre el modal completo) |

Helpers privados de `actions.ts`:

- `parseUrl(raw)` — vacío → `null`; sin esquema asume `https://`; **rechaza todo lo que no sea `http:`/`https:`**. Esto es lo que impide un `javascript:` en el `href` de la columna URL.
- `parseFee(raw)` — vacío → `null`; un valor inválido **no** se convierte en `null`, devuelve error.

### 4.3 Cliente — `projects-view.tsx`

**Utilidades de módulo**

| Función | Qué hace | Nota |
|---|---|---|
| `memberName(m)` | `full_name` o, si falta, el correo | |
| `ageInfo(start)` | `{ month, days }` con bloques de **30 días** desde `start_date` | ver `F-11` |
| `fmtDate(iso)` | fecha larga en `es` para el tooltip | usa `toLocaleDateString` del navegador |
| `activeAgo(iso)` | "Activo recién / hace N min / h / días" | usa `Date.now()`, ver `F-03` |
| `Star({on})` | SVG de la estrella | |

**Subcomponentes (declarados dentro del componente, se recrean en cada render)**

`StatusPill` · `ManagerCell` · `RiskHint` · `TypeBadge` · `UrlCell` · `AgeCell` · `StarBtn` · `Menu` · `Row`.

> El propio `use-sticky-head.ts` advierte en su comentario que un componente declarado así remonta su subárbol en cada render. Aquí no rompe nada porque el centinela vive suelto en el contenedor, pero sí implica remontar 12 celdas por fila en cada tecla del buscador.

**Memos y derivados**

| Nombre | Depende de | Qué calcula |
|---|---|---|
| `filtered` | proyectos + los 6 filtros | la lista que se pinta |
| `baseForCounts` | proyectos + todos los filtros **menos** el de estado | base de los contadores de las píldoras |
| `statusCount(key)` | `baseForCounts` | cuántos hay por estado (recorre el array una vez por píldora) |
| `groups` | `filtered` | agrupación por encargado; "Sin encargado" siempre al final |
| `tplFor(type)` | `templates` | plantillas del tipo elegido más las `general` |
| `canAdvance` | `step`, `createName` | validación manual del paso 1 |
| `anyFilter` | los 6 filtros | muestra u oculta "Limpiar" |

### 4.4 Base de datos

| Función | Tipo | Chequeo interno |
|---|---|---|
| `projects_overview()` | `SECURITY DEFINER` | `is_project_member(p.id)` por fila |
| `workspace_members()` | `SECURITY DEFINER` | **ninguno** — devuelve todo `auth.users` a cualquier autenticado |
| `create_project(name, client_id)` | `SECURITY DEFINER` | sesión + `is_admin()` + cliente existente. Inserta el proyecto y agrega al creador como `owner` en `project_members` |
| `set_project_status(id, status, note)` | `SECURITY DEFINER` | `is_project_member()` (**no** `is_admin`) + enum de estados |
| `apply_template(tpl, project, start)` | `SECURITY DEFINER` | sesión + plantilla existe + `is_project_member()` |
| `is_admin()` | `STABLE SECURITY DEFINER` | `profiles.role = 'admin'` |
| `is_project_member(id)` | `SECURITY DEFINER` | `project_members` o `team_members` del equipo del proyecto |

**Políticas RLS relevantes**

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `projects` | `is_project_member(id)` | *(sin política: solo vía RPC)* | `is_admin()` | `is_admin()` |
| `project_favorites` | `user_id = auth.uid()` | `user_id = auth.uid()` **y** `is_project_member` | — | `user_id = auth.uid()` |
| `clients` | dueño **o** miembro de un proyecto del cliente | `owner_id = auth.uid()` | dueño **o** miembro de un proyecto | `is_admin()` |
| `templates` | `true` (cualquier autenticado) | dueño | dueño o admin | dueño o admin |
| `profiles` | `true` (cualquier autenticado) | propio | propio | — |
| `project_status_updates` | `is_project_member` | `is_project_member` y autoría propia | — | — |

---

## 5. Estado del cliente

| Estado | Inicial | Para qué |
|---|---|---|
| `createType` | `'seo'` | tipo elegido en el asistente; filtra las plantillas y cambia el copy del fee |
| `createOpen` / `step` / `createName` | `false` / `0` / `''` | asistente de creación |
| `editing` | `null` | proyecto abierto en el modal de edición |
| `menuOpen` / `statusOpen` / `managerOpen` | `null` | id de la fila con ese desplegable abierto |
| `groupBy` | `false` | agrupar por encargado |
| `advancedOpen` | `false` | panel de filtros avanzados |
| `fName` `fClient` `fManager` `fType` `statusSel` `fOverdue` | vacíos | los 6 filtros (`statusSel` es un `Set`, multi-selección) |
| `sentinel` / `stuck` (en el hook) | `null` / `false` | encabezado fijo |

Nada de esto se persiste: recargar la página los reinicia todos. El único filtro que sobrevive a una recarga es `?client=` de la URL, y **no** está conectado con `fClient`.

---

## 6. Interacciones, una por una

| Elemento | Dispara | Quién autoriza | Efecto |
|---|---|---|---|
| Buscador | `setFName` | — | filtra por `name` en memoria |
| "Advanced Search" | `setAdvancedOpen` | — | despliega 4 selectores |
| Selectores cliente / encargado / tipo / vencidas | estado local | — | filtran en memoria; `__none__` = "sin asignar" |
| Píldoras de estado | `toggleStatus` | — | multi-selección; "Todos" vacía el `Set` |
| "Agrupar por encargado" | `setGroupBy` | — | inserta cabeceras de grupo |
| Estrella | `toggleFavorite` (form) | RLS: propio + miembro | favorito por usuario; **reordena la lista** al revalidar |
| Icono de URL | `<a target="_blank" rel="noopener noreferrer">` o abre el modal si no hay URL | — | la URL ya viene saneada por `parseUrl` al guardarse |
| Nombre | `<Link href="/projects/:id">` | — | navega al detalle |
| Celda "Antigüedad" vacía | abre el modal de edición | `isAdmin` dentro del modal | "Definir inicio" |
| Avatar del encargado | abre desplegable | `isAdmin` o toast de "sin permisos" | `setProjectManager` |
| Píldora de estado | abre desplegable | **sin chequeo en la UI** | `setProjectStatus` |
| Triángulo de vencidas | `<Link href="/projects/:id?view=lista&overdue=1">` | — | lleva al detalle ya filtrado |
| Menú ⋯ → Editar | `setEditing(p)` | `isAdmin` o toast | abre `ProjectEditModal` |
| Menú ⋯ → Eliminar | `confirm()` nativo + `deleteProject` | `isAdmin` + RLS | borra el proyecto y sus tareas |
| Botón del header | `window.dispatchEvent(new Event('open-new-project'))` | `isAdmin` o toast | abre el asistente |

**Asistente de creación (3 pasos).** Todos los campos siguen montados y solo se ocultan con `[hidden]`, para que el `FormData` del envío final llegue completo. Enter avanza de paso en vez de enviar. La validación es manual (solo el nombre es obligatorio para avanzar).

**Modal de edición.** Se monta con `createPortal` en `<body>` para no heredar los estilos de la barra oscura del detalle. Los pasos son navegables en cualquier orden y "Guardar" está disponible siempre. Si el estado no cambió, **borra `status` del FormData** para no ensuciar el historial. Los selectores de cliente y encargado van `disabled` mientras las listas no cargaron (un `<select disabled>` no viaja en el FormData, así que guardar no los pisa con `null`).

---

## 7. Matriz de permisos

| Acción | `admin` | `member` | Dónde se aplica de verdad |
|---|:---:|:---:|---|
| Ver la lista | ✅ | ✅ (solo sus proyectos) | `is_project_member` dentro del RPC |
| Marcar favorito | ✅ | ✅ | RLS de `project_favorites` |
| Cambiar estado | ✅ | ✅ | `set_project_status` → `is_project_member` |
| Cambiar encargado | ✅ | ❌ | `isAdmin()` + RLS UPDATE |
| Crear proyecto | ✅ | ❌ | `create_project` → `is_admin()` |
| Editar proyecto | ✅ | ❌ | `isAdmin()` + RLS UPDATE |
| Eliminar proyecto | ✅ | ❌ | `isAdmin()` + RLS DELETE |

El doble chequeo (app + base) es deliberado: con RLS un `UPDATE` bloqueado **no da error**, toca 0 filas. Por eso todas las acciones que devuelven `ActionResult` usan `{ count: 'exact' }` y responden `DENIED` cuando `count` es 0.

---

## 8. Fallos, riesgos y deuda

Severidad: 🔴 alta (rompe o expone) · 🟠 media (dato incorrecto o fricción real) · 🟡 baja (pulido).

### ✅ F-01 · `required` en un campo oculto bloquea la creación en silencio — RESUELTO

**Dónde:** `projects-view.tsx`, paso 1 del asistente.

```tsx
<select name="client_id" className="field" defaultValue="" required>
```

El comentario del propio componente dice que validan a mano *"porque los pasos ocultos romperían la validación nativa de HTML (campos required no enfocables)"* — y sin embargo `client_id` quedó con `required`. Al pulsar "Crear proyecto" desde el paso 3 sin haber elegido cliente, el `<select>` está dentro de un `<div hidden>`: el navegador aborta el envío con `An invalid form control with name='client_id' is not focusable` en consola y **el usuario no ve absolutamente nada**. El mensaje de `createProject` ("Elige un cliente para el proyecto") probablemente nunca se ha mostrado.

**Arreglo:** quitar `required` y sumar `client_id` a la validación manual — bloquear "Siguiente" en el paso 1 si no hay cliente, igual que con el nombre.

### ~~🔴 F-02 · No existe `middleware.ts`~~ · ANULADO (era un error del análisis)

**Este hallazgo era falso.** Next 16 renombró `middleware.ts` a **`proxy.ts`**, y el repo tiene ese archivo en la raíz llamando a `updateSession` con su matcher:

```ts
// proxy.ts
export async function proxy(request: NextRequest) { return await updateSession(request) }
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] }
```

El guardia global está activo, la excepción de `/portal` funciona y el refresco de la cookie de sesión se persiste. El error vino de un `grep` limitado a `app/` y `utils/` que no miró la raíz del repo.

Queda como recordatorio de lo que avisa `AGENTS.md`: esta versión de Next difiere del conocimiento previo, así que antes de dar por ausente una convención hay que mirar `node_modules/next/dist/docs/`.

### ✅ F-03 · El conteo de vencidas usa la fecha UTC, no la de Bogotá — RESUELTO (migración 015)

**Dónde:** `projects_overview()` → `t.due_date < current_date`.

La base corre en **UTC** (verificado: `current_setting('TimeZone') = 'UTC'`). `current_date` cambia de día a las **19:00 de Bogotá**. Entre las 19:00 y la medianoche, una tarea que vence *hoy* ya se cuenta como vencida: durante cinco horas cada día la columna "Vencidas" y el triángulo rojo mienten.

Es exactamente lo que `statuses.ts` intenta evitar: el archivo define `TZ = 'America/Bogota'` y `todayISO()` con el comentario *"si se calcula en cada lado por separado, se contradicen entre sí durante las 5 horas que UTC va adelantado"*. La app lo respeta; la base, no.

**Arreglo:** en la función, reemplazar `current_date` por `(now() at time zone 'America/Bogota')::date`. Revisar también el resto de funciones que usen `current_date` (`generate_client_payments`, `apply_template` con su `p_start default current_date`).

### ✅ F-04 · Las fechas del cliente ignoran la zona de la operación — RESUELTO

`ageInfo()`, `fmtDate()` y `activeAgo()` usan `new Date()` / `Date.now()` crudos, sin pasar por `TZ` ni `todayISO()`. Dos efectos:

- "Mes N · X días activo" y "Activo hace…" se calculan con el reloj de quien mira. Un cliente en otro huso ve otra cifra.
- Como `ProjectsView` se renderiza también en el servidor antes de hidratar, el texto de `activeAgo` puede diferir entre SSR y navegador → advertencia de hidratación. El `suppressHydrationWarning` del layout **no cubre esto**: solo aplica a `<html>` y `<body>`, no a los descendientes.

**Arreglo:** calcular estos textos con la misma zona fija que el resto de la app, o renderizarlos solo después de montar.

### ✅ F-05 · "Mes N" no es el mes de facturación — RESUELTO

`ageInfo()` cuenta bloques de 30 días (`Math.floor(days / 30) + 1`), pero el asistente promete *"se cobra por mes anticipado en el aniversario de la fecha de inicio"*. Un aniversario calendario y un bloque de 30 días se separan ~5 días al año: a los 12 meses, la tabla puede decir "Mes 13" cuando facturación va por el 12. Si la columna se usa para decidir cobros, es un error de negocio.

**Arreglo:** contar meses calendario desde `start_date`, o renombrar la columna a algo que no sugiera el ciclo de cobro.

### ✅ F-06 · Cualquier miembro puede cambiar el estado de un proyecto — DECIDIDO Y DOCUMENTADO

La RLS de `projects` dice `UPDATE → is_admin()`. Pero `set_project_status()` es `SECURITY DEFINER` y solo valida `is_project_member()`, así que escribe `projects.status` **saltándose** esa política. La UI acompaña el hueco: `ManagerCell` avisa "sin permisos" al no-admin, `StatusPill` se abre sin chequear nada.

Puede ser deliberado (que el equipo reporte cómo va su proyecto es razonable). Pero hoy no está escrito en ningún lado y contradice la política de la tabla.

**Arreglo:** decidir y dejarlo explícito. Si es intencional, documentarlo en `ROADMAP.md` y en la propia función. Si no, agregar `is_admin()` a `set_project_status` y el aviso en la píldora.

### ✅ F-07 · Las cuatro consultas del servidor son secuenciales — RESUELTO

`page.tsx` hace `await` una tras otra. Las cuatro son independientes: la latencia total es la suma en vez del máximo. Con la base en `us-east-2` y el equipo en Colombia, son cuatro viajes completos antes del primer byte.

**Arreglo:**
```ts
const [{ data }, { data: clientRows }, { data: tplRows }, { data: memberRows }] = await Promise.all([…])
```
Y sumar un `app/projects/loading.tsx` (ya existe uno para `/projects/[id]`) para que la navegación no se sienta congelada.

### ✅ F-08 · `setProjectStatus` y `toggleFavorite` no informan fallos — RESUELTO

Devuelven `void` y no comprueban `count`. Si RLS rechaza la escritura (por ejemplo, marcar favorito en un proyecto del que ya no se es miembro), no hay error ni toast: la UI se refresca y el cambio simplemente no está. Es justo el modo de fallo silencioso que el resto del archivo combate con `{ count: 'exact' }` y `ActionResult`.

**Arreglo:** homogeneizar — que devuelvan `ActionResult` y que los `<form>` los pasen por `toastIfFailed`.

### ✅ F-09 · Lógica de filtrado duplicada — RESUELTO

`filtered` y `baseForCounts` repiten las mismas condiciones; la segunda es la primera sin el filtro de estado. Cualquier filtro nuevo hay que agregarlo en los dos sitios o los contadores de las píldoras empiezan a mentir.

**Arreglo:** `filtered = baseForCounts.filter(p => statusSel.size === 0 || statusSel.has(p.status))`.

### ✅ F-10 · El filtro `?client=` vive en un carril aparte — RESUELTO

Llega por URL, se aplica en el servidor y se muestra en su propia barra con "Quitar filtro". No se refleja en el selector "Cliente" de los filtros avanzados, y "Limpiar" no lo quita. Con ambos activos y distintos, el resultado es siempre vacío sin explicación visible.

**Arreglo:** inicializar `fClient` desde el `searchParam` y eliminar la barra aparte.

### F-11 en adelante · Otros hallazgos

| ID | Hallazgo | Detalle |
|---|---|---|
| ✅ F-11 | El buscador solo mira `p.name` | Escribir el nombre de un cliente o de un encargado no encuentra nada, aunque ambas columnas están a la vista. |
| ✅ F-12 | Sin ordenamiento por columna | El orden es fijo en la base (`favorite desc, last_activity desc`). Es lo primero que se intenta al hacer clic en "Fee" o "Vencidas". |
| ✅ F-13 | Los desplegables no se cierran al hacer clic fuera | `menuOpen`, `statusOpen` y `managerOpen` solo alternan con su propio botón. No hay listener de `document` ni de `Escape` (el modal sí lo tiene). Se pueden dejar dos menús abiertos a la vez. |
| ✅ F-14 | `confirm()` nativo para eliminar | Bloquea el hilo y rompe el lenguaje visual del resto de avisos. |
| F-15 | Campos del RPC sin usar | `num_tasks` y `status_note` se calculan por proyecto y nunca se renderizan; `created_at` tampoco. Sobra una subconsulta por fila. |
| ✅ F-16 | Falta índice en `tasks(project_id)` | Existen `idx_tasks_due` (parcial), `idx_tasks_parent_position`, `idx_tasks_assignee`, pero ninguno por `project_id`. Las dos subconsultas de conteo escanean `tasks` una vez por proyecto. Con 914 tareas no se nota; con 10.000 sí. |
| F-17 | La columna Fee mezcla dos unidades | Mensual para SEO, total para WEB. Se mitiga con el sufijo `/mes` vs `total`, pero cualquier suma visual de esa columna es incorrecta. |
| F-18 | `overdue` incluye subtareas y `num_tasks` no | La primera cuenta todas las tareas; la segunda solo las de `parent_id is null`. Dos criterios distintos en la misma función. |
| ✅ F-19 | "Advanced Search" en inglés | Único texto en inglés de una UI íntegramente en español. |
| ✅ F-20 | Píldoras inactivas al 50% de opacidad | `.proj-pill { opacity: .5 }` sobre pasteles claros deja el texto por debajo del contraste mínimo. El `aria-pressed` sí está bien puesto. |
| 🟡 F-21 | Mezcla de tuteo y voseo | "Elegí un cliente…", "Si lo cambiás" conviven con "Crea tu primer proyecto", "Pídeselo a un administrador". |
| F-22 | `createProject` no es atómico | Documentado en el código: crea vía RPC y luego hace tres escrituras sueltas; si una falla, informa qué quedó pendiente en vez de revertir. Decisión consciente, pero una función única en la base lo resolvería. |
| F-23 | `setProjectUrl` no se usa | La celda de URL sin valor abre el modal completo. La acción quedó huérfana. |
| ✅ F-24 | Acoplamiento por evento de `window` | `NewProjectTrigger` y `ProjectsView` se comunican con un evento `'open-new-project'` sin contrato ni tipos. Si alguien renombra una punta, el botón deja de hacer nada en silencio. |
| F-25 | `workspace_members()` no filtra | `SECURITY DEFINER` sin ningún chequeo: cualquier autenticado obtiene todos los correos de `auth.users`. Igual que `profiles` con `SELECT USING (true)` — ya está en la lista de hallazgos de la auditoría. |
| F-26 | `clients_update` demasiado amplia | Cualquier miembro de un proyecto puede renombrar la ficha del cliente. No se explota desde esta vista, pero afecta al dato que esta vista muestra. |
| F-27 | `globals.css` con 682 líneas sin commitear | `git status` marca el archivo modificado. Todo el estilo de esta vista está sin versionar. |

---

## 9. Rendimiento

Con los números reales de hoy (28 proyectos, 914 tareas, 1.498 filas de actividad) la vista va sobrada. Lo que escala mal, en orden:

1. **Cuatro viajes secuenciales** antes del primer render (`F-07`). Es el costo dominante hoy.
2. **Seis subconsultas correlacionadas por proyecto** en `projects_overview`, dos de ellas escaneando `tasks` sin índice por `project_id` (`F-15`, `F-16`).
3. **Todo el filtrado en memoria**: se envía la lista completa al navegador. Correcto a esta escala; a partir de unos cientos de proyectos habría que mover buscador y paginación a la base.
4. **12 celdas remontadas por fila en cada tecla** del buscador, porque los subcomponentes se declaran dentro del componente.

---

## 10. Lo que la vista NO hace

Útil para no buscar donde no hay:

- No pagina ni hace scroll virtual.
- No ordena por columna.
- No guarda preferencias de filtro entre sesiones.
- No permite archivar (solo eliminar en duro, con cascada a tareas).
- No permite crear ni editar clientes (eso vive en `/clientes`).
- No muestra progreso de tareas, aunque el RPC ya devuelve `num_tasks`.
- No refleja en la URL ningún filtro salvo `?client=`, así que una vista filtrada no se puede compartir por enlace.
- No tiene estados de error propios: si una de las cuatro consultas falla, `data` queda `null`, se usa `[]` y la vista dice "Aún no tienes proyectos" — indistinguible de no tener proyectos de verdad.

---

## 11. Orden sugerido de arreglos

1. **F-01** — una línea; hoy hay un camino en el que no se puede crear un proyecto.
2. **F-03** — una línea en la base; el dato es incorrecto cinco horas al día.
3. **F-02** — decidir el modelo de guardia y dejarlo coherente. Auditar `/api/*` de paso.
4. **F-06** — decidir y documentar quién cambia el estado.
5. **F-07** — `Promise.all` + `loading.tsx`. Es la mejora de sensación más barata.
6. **F-04, F-05** — unificar las fechas con `TZ`.
7. **F-08, F-09, F-10** — coherencia de errores y de filtros.
8. El resto de F-11 en adelante, como pulido.

---

## 12. Checklist de verificación manual

- [ ] Crear un proyecto llegando al paso 3 **sin elegir cliente** → debe aparecer un mensaje, no un formulario mudo (`F-01`).
- [ ] Poner una tarea con vencimiento hoy y mirar la columna "Vencidas" a las 20:00 de Bogotá → debe seguir en 0 (`F-03`).
- [ ] Entrar con un usuario `member`: la píldora de estado debe comportarse como se haya decidido en `F-06`; encargado, editar y eliminar deben avisar "sin permisos".
- [ ] Marcar favorito → el proyecto debe subir al primer lugar tras la revalidación.
- [ ] Abrir el menú ⋯ y hacer clic fuera → verificar si se cierra (`F-13`).
- [ ] Entrar por `/projects?client=<uuid>` y pulsar "Limpiar" en los filtros avanzados → verificar que el filtro de la URL no queda colgado (`F-10`).
- [ ] Guardar en el modal de edición sin tocar el estado → no debe crear una entrada en el historial de estado.
- [ ] Editar un proyecto con el selector de encargado aún cargando → el encargado no debe borrarse.
- [ ] Con la ventana angosta, comprobar que la tabla scrollea en horizontal (`min-width: 1100px`) en vez de aplastar columnas.


---

## 13. Qué se implementó (22-sep-2026)

Detalle y decisiones en `PLAN-MEJORAS-PROYECTOS.md`. Resumen de lo que cambió:

**Base de datos** (`db/migrations/015_proyectos_fecha_y_rendimiento.sql`, aplicada a producción)

- `projects_overview()` calcula `overdue` contra la fecha de Bogotá.
- Índice `idx_tasks_project` en `tasks(project_id)`.
- `COMMENT` en `set_project_status` explicando por qué es a nivel miembro.

**Aplicación**

| Archivo | Cambio |
|---|---|
| `app/projects/page.tsx` | `Promise.all` para las cuatro consultas; aviso si alguna falla; el filtro `?client=` se pasa a la vista en vez de aplicarse aparte |
| `app/projects/loading.tsx` | **nuevo** — esqueleto de la lista |
| `app/projects/statuses.ts` | `daysBetween`, `formatDateLong`, `projectAge` (meses de calendario, con recorte de fin de mes y estado "sin arrancar") y `activeAgo(iso, now)` |
| `app/projects/actions.ts` | `setProjectStatus` y `toggleFavorite` devuelven `ActionResult` |
| `app/components/projects-view.tsx` | wizard sin `required` oculto, filtros derivados, orden por columna, un solo desplegable con cierre por clic fuera y Escape, confirmación de borrado propia, buscador por nombre/cliente/encargado, subcomponentes a nivel de módulo |
| `app/components/project-status.tsx` | el popover de estado avisa si la base rechaza el cambio |
| `app/components/new-project-trigger.tsx` · `app/lib/ui-events.ts` | **nuevo** — el nombre del evento deja de estar escrito a mano en dos sitios |
| `app/globals.css` | píldoras accesibles sin opacidad, cabeceras ordenables, confirmación de borrado, `.btn-sm` y `.btn-danger` |

**Sigue pendiente:** F-15 (campos del RPC sin usar), F-17 (la columna Fee mezcla unidades), F-18 (criterios distintos de conteo), F-21 (voseo en otras vistas), F-22 (`createProject` no atómico), F-23 (`setProjectUrl` huérfana), F-25 y F-26 (permisos de alcance general), F-27 (`globals.css` sin commitear).

**Verificación ejecutada:** `tsc --noEmit` limpio y `eslint` limpio en todos los archivos tocados. `next build` **no se pudo ejecutar**: revienta con *bus error* dentro del entorno donde se trabajó, antes de compilar nada (limitación del entorno, no del código). **Queda pendiente correr `npm run build` y la lista de pruebas manuales de la sección 12.**
