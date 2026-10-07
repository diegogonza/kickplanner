# Sincronización de Search Console a escala

> Plan de acción · **pendiente de implementar**. Complementa `PLAN-GSC.md`.
> Fecha: 2026-10-06 · Objetivo de diseño: 50 proyectos SEO sin acercarse a los límites de Supabase.

---

## 0. Situación actual (lo que hay hoy)

| Pieza | Cómo funciona |
|---|---|
| Disparo | `pg_cron` → job `gsc-sync-semanal`, `0 12 * * 1` (lunes 7:00 a. m. Bogotá) → `public.gsc_sync_cron()` |
| Llamada | `gsc_sync_cron()` hace **un solo** `net.http_post` a la Edge Function `gsc-sync` con la service role key de Vault y cuerpo `{}` |
| Trabajo | La función recorre **todas** las filas de `gsc_properties` en serie, una tras otra |
| Por proyecto | Totales del mes en curso + el anterior · foto de posiciones de 28 días (hasta 5.000 palabras) · top 1.000 palabras del último mes completo |
| Proyecto nuevo | Si `backfilled_at` es null hace backfill de 16 meses en esa misma corrida |
| Errores | Se anotan en `gsc_properties.last_error`; las demás propiedades siguen |

Medido el 2026-10-05: ~3,5 s por proyecto. Hoy hay 16 propiedades → ~60 s por corrida.

### Problemas

1. **Una sola llamada para todo.** El tiempo crece lineal con los proyectos. Límite de una Edge Function: **150 s en plan gratuito, 400 s en Pro**. Con 50 proyectos son ~200 s: en gratuito se corta y los últimos ~12 nunca se actualizan.
2. **Fallo silencioso.** `cron.job_run_details` marca "succeeded" en 0,1 s porque solo registra que se *envió* la petición, no el resultado de la sincronización. La única señal real es `last_sync_at` / `last_error`.
3. **Trabajo repetido.** Las 1.000 palabras del mes cerrado se piden cada corrida aunque ese mes ya no cambie. Es la parte más pesada.
4. **Frecuencia semanal.** El comentario de la función dice "diario", pero el cron es semanal. Al inicio de mes, el mes recién cerrado puede quedar sin los últimos 1-2 días (retraso de GSC) y los hitos tardan hasta una semana en corregirse.
5. **Crecimiento de `gsc_keywords`.** Hasta 1.000 filas por proyecto por mes, sin retención: ~600.000 filas/año con 50 proyectos.

---

## 1. Diseño propuesto: fila de trabajo por tandas

**Principio: una llamada por proyecto.** Así el número de proyectos deja de afectar el límite por llamada: cada una dura ~2-4 s contra un límite de 150 s. Lo único que crece es cuánto tarda la ronda del día, y eso se ajusta con el tamaño de tanda.

### Flujo

1. Cron **cada 5 minutos entre las 6:00 y las 8:00 a. m.** (Bogotá) ejecuta `gsc_sync_tick()`.
2. `gsc_sync_tick()` toma hasta **N = 10** propiedades "pendientes de hoy" con `FOR UPDATE SKIP LOCKED`:
   - `last_sync_at` anterior a hoy (zona Bogotá), y
   - menos de 3 intentos fallidos hoy.
3. Por cada una crea una fila en `gsc_sync_runs` (estado `running`) y hace un `net.http_post` a `gsc-sync` con `{ project_id, run_id }`.
4. La Edge Function sincroniza **solo ese proyecto** y al terminar actualiza su fila de `gsc_sync_runs` (`ok` / `error`, duración, mensaje).
5. Si falla, la propiedad sigue pendiente y entra en la tanda siguiente (máx. 3 intentos/día).
6. Una corrida `running` con más de 10 min se considera colgada y se marca `timeout` en el siguiente tick.

### Capacidad

| Proyectos | Tanda | Tandas | Ronda completa |
|---:|---|---:|---:|
| 16 (hoy) | 10 cada 5 min | 2 | ~10 min |
| 50 | 10 cada 5 min | 5 | ~25 min |
| 200 | 20 cada 5 min | 10 | ~50 min |

El tamaño de tanda es un parámetro de `gsc_sync_tick(p_lote int default 10)`: se ajusta sin tocar código.

### Límites revisados con 50 proyectos

| Recurso | Uso | Límite | Margen |
|---|---|---|---|
| Duración por llamada | ~2-4 s | 150 s (gratuito) / 400 s (Pro) | Muy amplio |
| Consultas a la API de GSC | ~80 por tanda de 10 | 1.200/min por propiedad y por usuario | Muy amplio |
| Invocaciones de Edge Functions | ~1.500/mes | 500.000/mes (gratuito) | Muy amplio |
| Filas en `gsc_keywords` | ~50.000/mes | Espacio de la base | Controlado con retención (punto 2.4) |

---

## 2. Cambios

### 2.1 Base de datos (migración `019_gsc_sync_escala.sql`)

```sql
create table public.gsc_sync_runs (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references projects(id) on delete cascade,
  modo        text not null check (modo in ('incremental','backfill','detalle_mes')),
  estado      text not null default 'running' check (estado in ('running','ok','error','timeout')),
  intento     int  not null default 1,
  iniciado_at timestamptz not null default now(),
  terminado_at timestamptz,
  duracion_ms int,
  error       text,
  request_id  bigint            -- id de pg_net, para depurar
);
create index on public.gsc_sync_runs (project_id, iniciado_at desc);
-- RLS: lectura para el equipo (staff), escritura solo service role.
```

- `gsc_sync_tick(p_lote int default 10)` — SECURITY DEFINER, selecciona pendientes, crea runs, dispara `net.http_post` por proyecto, marca `timeout` las colgadas.
- Reemplazar el job: borrar `gsc-sync-semanal`, crear `gsc-sync-diario` con `*/5 11-12 * * *` (UTC = 6:00-7:55 a. m. Bogotá).
- Mantener `gsc_sync_cron()` solo como "sincronizar todo ya" de emergencia, o eliminarla.

### 2.2 Edge Function `gsc-sync`

- Aceptar `{ project_id, run_id }` y, al terminar, actualizar `gsc_sync_runs` (estado, duración, error).
- **Detalle de palabras del mes cerrado solo una vez al mes:** si `gsc_keywords` ya tiene filas para ese `month` y proyecto, saltarlo. Excepción: los primeros 5 días del mes se vuelve a pedir, porque GSC sigue completando datos del mes anterior.
- **Backfill aparte:** un proyecto sin `backfilled_at` se procesa en su propia llamada con `modo = 'backfill'` (16 meses), nunca mezclado en una tanda incremental.
- Corregir el comentario "diario" para que coincida con el cron real.

Resultado esperado: ~4 s → ~2 s por proyecto en la corrida diaria.

### 2.3 Interfaz

- Pantalla "Datos de Search Console" del proyecto: última corrida (hora, duración, estado y error si lo hubo) y las últimas 7.
- Espacio de trabajo (admin): estado general de la ronda de hoy, con "X de Y sincronizados" y la lista de fallidos.
- `seo-health` sigue avisando cuando un proyecto tiene `last_error`.

### 2.4 Retención

- `gsc_keywords`: conservar **13 meses** (alcanza para comparar con el mismo mes del año anterior). Job mensual que borra lo más antiguo.
- `gsc_monthly` y `gsc_rankings`: se conservan siempre; son pocas filas y los hitos dependen de `gsc_monthly`.
- `gsc_sync_runs`: conservar 90 días.

---

## 3. Orden de implementación

1. Migración 019: tabla `gsc_sync_runs` + `gsc_sync_tick()` (sin tocar todavía el cron).
2. Edge Function: `run_id`, detalle una vez al mes, backfill aparte. Desplegar.
3. Probar `gsc_sync_tick(2)` a mano con 2 proyectos; revisar `gsc_sync_runs` y `last_sync_at`.
4. Cambiar el cron semanal por el diario por tandas.
5. Interfaz de estado (2.3).
6. Job de retención (2.4).

## 4. Decisiones pendientes

- **Plan de Supabase (gratuito o Pro):** no cambia el diseño, solo el margen por llamada. Confirmar antes de fijar el tamaño de tanda.
- **Frecuencia:** propuesta diaria a las 6:00 a. m. Bogotá. Alternativa: mantener semanal con este mismo mecanismo.
- **Retención de palabras clave:** 13 meses propuesto.
