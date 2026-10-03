# Plan de mejoras · vista `/projects`

> Deriva de `ANALISIS-VISTA-PROYECTOS.md` (22-sep-2026). Ese documento explica **qué** hace la vista y **qué falla**; este dice **qué se cambia, en qué orden y con qué criterio**.
> Alcance aprobado: todo, incluido el pulido de UI.

## Decisiones tomadas antes de empezar

| Tema | Decisión |
|---|---|
| Estado del proyecto (F-06) | **Lo sigue cambiando cualquier miembro.** Es el equipo quien reporta cómo va su proyecto. Se documenta en la propia función para que no parezca un descuido frente a la RLS admin-only de la tabla. |
| Guardia de sesión (F-02) | **Retirado: no era un fallo.** Ver abajo. |
| Migración de base | Se aplica a producción en esta tanda y queda versionada en `db/migrations/015_*`. |

### Corrección de F-02

El análisis afirmaba que no existía el middleware y que `updateSession()` era código muerto. **Es falso.** Next 16 renombró `middleware.ts` a **`proxy.ts`**, y el repo tiene ese archivo en la raíz:

```ts
// proxy.ts
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}
export const config = { matcher: [...] }
```

El guardia global está activo, la excepción de `/portal` funciona y el refresco de la cookie de sesión se persiste. El error vino de un `grep` limitado a `app/` y `utils/` que no miró la raíz. **No se crea ningún `middleware.ts`**: sería un duplicado con el nombre viejo. F-02 queda anulado en el análisis.

Lección aplicable al resto del repo: `AGENTS.md` avisa que esta versión de Next difiere del conocimiento previo. Antes de dar por ausente una convención, mirar `node_modules/next/dist/docs/`.

## Orden de ejecución

1. **Base de datos** — `db/migrations/015_proyectos_fecha_y_rendimiento.sql`
   - `projects_overview()`: `overdue` pasa a comparar contra la fecha de Bogotá, no contra `current_date` en UTC (F-03).
   - Índice `idx_tasks_project` en `tasks(project_id)` (F-16).
   - `COMMENT ON FUNCTION set_project_status` explicando el permiso a nivel miembro (F-06).
2. **Server actions** — `setProjectStatus` y `toggleFavorite` devuelven `ActionResult` y comprueban `count` (F-08).
3. **Fechas** — helpers en `statuses.ts` atados a `TZ`; antigüedad en meses calendario (F-04, F-05).
4. **Página** — `Promise.all` para las cuatro consultas, `loading.tsx`, filtro de cliente pasado a la vista (F-07, F-10).
5. **Vista** — wizard, filtros, orden por columna, desplegables, borrado, copys (F-01, F-09 a F-14, F-19, F-21, F-24).
6. **Estilos** — contraste de píldoras y clases nuevas (F-20).
7. **Verificación** — `tsc --noEmit`, `eslint`, `next build`.
8. **Documentación** — análisis actualizado y nota en `ROADMAP.md`.

## Qué NO entra en esta tanda

- `workspace_members()` sin filtro y `profiles` con `SELECT USING (true)` (F-25): son hallazgos de la auditoría general, no de esta vista, y tocarlos afecta a media app.
- `clients_update` demasiado amplia (F-26): mismo motivo.
- `createProject` atómico (F-22): requiere una función nueva en la base y rehacer el asistente; va al ROADMAP.
- Paginación y búsqueda en servidor: innecesarias con 28 proyectos.

## Revisión de código (02-oct-2026)

Ajustes aplicados tras el code review de esta tanda:

1. **Orden por Antigüedad**: los proyectos sin fecha de inicio quedaban arriba en ambas direcciones (se negaba el resultado de `texto()`, incluida la regla de vacíos). Ahora van siempre al final.
2. **Foco**: se quitaron `.proj-pill:focus-visible` y `.projtable-sortbtn:focus-visible`. El foco es único y global (`--focus`, 1px, `outline-offset: -1px`).
3. **`?client=`**: `ProjectsView` lleva `key={initialClient || 'all'}`; sin eso, ir de `/projects?client=A` a `/projects` conservaba el filtro viejo.
4. **Doble envío**: "Crear proyecto" y "Eliminar" usan `SubmitBtn` (`useFormStatus`) y se bloquean mientras la acción corre.
5. **Enter en el asistente**: solo se intercepta en `INPUT`; sobre "Atrás"/"Cancelar" vuelve a hacer lo que dice el botón.

Verificación: `tsc --noEmit` y `eslint` limpios; `next build` completo OK (compilado fuera de la máquina local, con las fuentes de Google sustituidas solo en esa copia por falta de red); `projectAge` y el nuevo comparador probados con casos de borde (31-ene → feb/mar, cambio de año, inicio futuro).

## Columna "Próximo cobro" (02-oct-2026)

Reemplaza a la columna Cliente (el cliente sigue en el buscador y en el filtro de Búsqueda avanzada).

**Decisiones:**
- Fecha base: **aniversario mensual de `start_date`**, la misma regla que `generate_client_payments()` en `/pagos` (inicio + k meses; si el día no existe, último día del mes). La política de cobrar el día 1 se cumple corrigiendo la fecha de inicio, no con otra regla.
- Mes anticipado: si hoy es aniversario el cobro es "Hoy"; si el proyecto aún no arranca, el primer cobro es la fecha de inicio.
- Solo cuenta regresiva: no mira si los cobros anteriores están pagados (eso vive en `/pagos`).
- SEO `on_hold` → "En pausa". SEO sin inicio y proyectos Web → "—".
- ≤ 3 días: el "cuándo" usa `--mod-text` (nuevo token ámbar para texto, 6.3:1; `--mod-fg` da 3.8:1).

**Código:** `nextBilling()` y `formatDateShort()` en `app/projects/statuses.ts`; `BillingCell` y orden `billing` en `projects-view.tsx`; `.proj-bill*` en `globals.css`.

**Verificación:** 11 casos de borde y cruce contra la base de los 22 proyectos SEO con inicio (0 diferencias con `start_date + k months`); `tsc`, `eslint` y `next build` OK; captura con datos de ejemplo. De paso: las cabeceras ordenables heredan `text-transform`/`letter-spacing` (salían en minúsculas junto a "ENCARGADO").

## "Próximo cobro" conectado con Pagos (02-oct-2026)

**Decisiones:** atraso = cobro sin pagar con fecha anterior a hoy (Bogotá), desde el día siguiente al cobro; incluye cuotas Web con fecha; solo lo ve admin. Proyecto detenido no genera cobros nuevos (lo ya generado se decide en /pagos). Al cambiar `start_date`, los cobros se realinean por `seq` conservando su estado de pago.

**Base (migración 016, en partes):**
- 016a — copia de `client_payments` en `backup.client_payments_20261002` (esquema no expuesto). ✅ aplicada
- 016c — `generate_client_payments()`: fecha de Bogotá, salta `on_hold`, no recrea un `seq` que ya existe (evita duplicados aunque cambie el inicio). ✅ aplicada
- 016d — `payments_overdue_by_project()`: atraso por proyecto, solo admin. ✅ aplicada
- 016b — `realign_project_payments()` + trigger `trg_projects_realign_payments` + limpieza de los 7 proyectos con cobros huérfanos. ⏳ **pendiente**: contiene DELETE y Supabase pide confirmación; expiró sin aprobarse. El archivo `db/migrations/016_pagos_realineados_y_atrasos.sql` es idempotente y se puede pegar completo en el editor SQL.

**App:** `page.tsx` (admin) genera los cobros del mes y trae el atraso; `projects-view.tsx` muestra "N vencidos" + monto en rojo con enlace a /pagos, ordena atrasados primero y suma el filtro "Pagos: con atraso / al día" (solo admin).
- 016e — la deuda llega hasta la pausa: `payments_overdue_by_project()` no cuenta un cobro si en su fecha el proyecto estaba detenido según `project_status_updates` (último cambio hasta ese día). Si el proyecto se reactiva, los cobros siguientes vuelven a contar; sin historial a esa fecha, el cobro cuenta. Solo afecta al atraso de /projects: /pagos sigue listando esos cobros como pendientes. ✅ aplicada

### Code review de pagos (02-oct-2026) — arreglos
- 016f ✅ — `generate_client_payments()` no crea cobros de meses en que el proyecto estaba detenido según el historial (antes, al reactivar se rellenaban los meses de la pausa). Nueva `payments_summary_by_project()` = atraso + `paid_through` (último mes recurrente pagado); `/projects` la usa en lugar de `payments_overdue_by_project()`, que queda sin uso.
- La cuenta regresiva salta los cobros ya pagados o pagados por adelantado (`nextBilling(start, today, paidThrough)`), solo para admin.
- `/pagos` calcula "hoy" con `todayISO()` (Bogotá) en vez de UTC.
- Filtro "Pagos: Sin atraso" solo incluye proyectos que cobran (SEO con inicio).
- 016b ⏳ sigue pendiente (confirmación de DELETE en Supabase). Ejecutar el archivo `016_…sql` completo en el editor SQL; es idempotente.
- No incluido: generar los cobros con un job diario (pg_cron) en vez de al cargar `/projects` y `/pagos`; estado "condonado" para perdonar un mes.

## Antigüedad sin pausas (02-oct-2026)
- `projectAge(start, historial, today)`: "Mes N" = aniversarios mensuales en los que el proyecto NO estaba detenido (misma regla que `generate_client_payments`, así coincide con los meses facturables); días activo = días desde el inicio − días en `on_hold`. Sin historial para una fecha (antes de ago-2026) se asume activo.
- Proyecto detenido: la celda muestra "N meses" + "detenido" (cuánto duró activo); el tooltip detalla días activo y días en pausa.
- Orden por Antigüedad: por días activo.
- `page.tsx` lee `project_status_updates` (RLS `is_project_member`, sin cambios en la base) y lo pasa como `status_history` con fechas en TZ (`dateInTZ`).
- Verificado: 7 casos (sin historial = igual que antes, pausa, reactivación, pausa el día del aniversario, historial anterior al inicio, dobles entradas `on_hold`); tsc, eslint y build OK.

## Orden fijo por nombre (02-oct-2026)
- Decisión de producto: la lista de `/projects` se ordena SIEMPRE por nombre A→Z (`localeCompare` 'es', sensibilidad base) y no se puede cambiar. Los favoritos ya no suben al principio (siguen marcados con la estrella).
- Se quitó el orden por columna: componente `Th`, tipos `SortKey`/`Sort`, `SORT_INICIAL`, `ORDEN_ESTADO` y los estilos `.projtable-sortbtn*`. Las cabeceras vuelven a ser texto.
- Agrupar por encargado mantiene el orden por nombre dentro de cada grupo.

## Eliminar cobros mensuales en /pagos (02-oct-2026)
- Botón ✕ en cada cobro mensual no pagado (con confirmación). Un pagado no se elimina: primero "Deshacer".
- No borra la fila: la ANULA (`status = 'void'`, acción `voidPayment`). Borrarla no serviría: `generate_client_payments()` recrea todo mes que falte en la siguiente carga. Anulado, el mes queda registrado y no se regenera.
- Los anulados no se muestran en /pagos ni suman en ningún total (`app/pagos/page.tsx` los filtra) y no cuentan como deuda en /projects (016g: el atraso usa `status = 'pending'`).
- 016b (pendiente) actualizada: al deduplicar, un anulado gana a un pendiente del mismo mes.
- Las cuotas Web siguen con borrado real (`deletePayment`); esas no se regeneran.
