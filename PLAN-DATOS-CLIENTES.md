# Plan de datos — Clientes ↔ Proyectos

> **Estado al 15/09/2026: plan COMPLETO.** Fases 1 a 6 aplicadas
> (migraciones 005, 006, 007, 008). Oscar decidió que todo proyecto debe
> tener cliente, así que la Fase 6 se aplicó.

**Fecha:** 15 de septiembre de 2026
**Alcance:** modelo de datos de `clients` y `projects` en Postgres. No toca la interfaz salvo donde una migración la obligue.

---

## 1. Diagnóstico

### 1.1 La relación está bien; lo que está mal es que está vacía

`projects.client_id → clients.id` (1:N, `ON DELETE SET NULL`) es la forma correcta: un cliente tiene varios proyectos, cada proyecto pertenece a un cliente. No hay que rediseñarla.

El problema es otro:

| | |
|---|---|
| Proyectos | **28** |
| Proyectos **sin cliente** | **23** (82 %) |
| Clientes | 5 |

La identidad del cliente hoy vive en el **nombre del proyecto** — "Econorte Cucuta", "Impacto Óptica", "Grupo Myc" — no en la tabla `clients`. La tabla existe pero casi nadie la usa, así que todo lo que se construya encima (portal, facturación por cliente, reportes agregados) opera sobre el 18 % de los datos.

**Ninguna mejora de esquema sirve mientras esto no se resuelva.** Es el primer punto del plan y no es trabajo de base de datos: es trabajo de decidir quién es el cliente de cada proyecto.

### 1.2 El sitio web está en dos lugares y ya divergieron

`clients.website` y `projects.url` guardan la misma cosa. No es hipotético, ya pasó:

| Cliente | `clients.website` | `projects.url` |
|---|---|---|
| Vitaliah SAS | `stevia.com.co` | `https://stevia.com.co/` |
| Nono Solutions | `https://www.hunterx.com.co/` | `https://www.hunterx.com.co/` |
| Mónica Cruz | `https://monicacruz.com.co/` | `https://monicacruz.com.co/` |

Dos formatos distintos para el mismo sitio en el primer caso. **El sitio pertenece al proyecto, no al cliente**: un cliente puede contratar SEO para un dominio y una web nueva para otro. Domidel es exactamente eso — su proyecto es "Total Fitness Peru", un sitio que no lleva el nombre del cliente.

Hoy hay **tres** columnas que guardan algo parecido a "la URL del sitio":

- `clients.website` — sobra
- `projects.url` — **esta es la buena**
- `gsc_properties.site_url` — **no es lo mismo**: es el identificador de la propiedad en Search Console, con su propio formato (`sc-domain:x.com` vs `https://x.com/`), y esa diferencia nos costó tres intentos fallidos hoy. Se queda donde está y no se deriva de `projects.url`.

### 1.3 Solo diego@ puede editar o borrar clientes

Corregimos `clients_overview()` para que el equipo **vea** los clientes. Pero las políticas RLS de la tabla siguen siendo:

```
clients_update:  owner_id = auth.uid()
clients_delete:  owner_id = auth.uid()
```

Los 5 clientes son de `diego@`. Si Marcela corrige la dirección de un cliente, el `UPDATE` no afecta ninguna fila — **y PostgREST no devuelve error**: una actualización que no toca nada es un éxito con cero filas. Silencioso, otra vez.

`owner_id` modela "dueño" cuando lo que hace falta es "quién lo creó". La propiedad de un cliente es de la agencia, no de la persona que tipeó el nombre.

### 1.4 El nombre del cliente no es único

No hay restricción en `clients.name`. Ahora que el alta funciona, dos personas pueden crear "Mónica Cruz" y "Peluquería Mónica Cruz S.A.S" como fichas distintas, cada una con sus proyectos, y el portal del cliente se parte en dos.

Riesgo inmediato, no teórico: la ficha recién creada dice "Mónica Cruz" y en los contratos figura como "Peluquería Mónica Cruz S.A.S".

### 1.5 Borrar un cliente destruye más de lo que dice

| Tabla | Al borrar el cliente |
|---|---|
| `projects` | `SET NULL` — los proyectos quedan huérfanos, sin aviso |
| `portal_access` | `CASCADE` — **se destruye el acceso al portal** (slug + contraseña) |
| `portal_sessions` | `CASCADE` — se cierran las sesiones abiertas |

El diálogo de confirmación solo menciona lo primero. Un borrado por error deja al cliente sin portal y hay que volver a generarle slug y contraseña, y reenviárselos.

### 1.6 Faltan marcas de tiempo

Ninguna de las dos tablas tiene `updated_at`. No hay forma de saber cuándo se tocó una ficha por última vez, ni de ordenar por "modificados recientemente".

### 1.7 Lo que NO hay que hacer

- **No agregar índices.** Con 28 proyectos y 5 clientes, Postgres hace un seq scan en microsegundos. Los índices que "faltan" (`team_id`, `status`, `type`) no van a mejorar nada medible y agregan mantenimiento. Cuando haya 5.000 proyectos, se revisa.
- **No crear una tabla `client_sites`.** Un proyecto = un sitio cubre el 100 % de los casos actuales. `projects.url` alcanza.
- **No fusionar `gsc_properties.site_url` con `projects.url`.** Parecen lo mismo y no lo son.

---

## 2. Plan por fases

Ordenadas por dependencia, no por dificultad. Cada fase deja el sistema funcionando.

### Fase 1 — Asignar cliente a los 23 proyectos huérfanos ✅
**Tipo:** datos · **Bloquea:** todo lo demás

No es SQL, es decidir. Para cada proyecto sin cliente hay que responder: ¿ficha nueva, o pertenece a un cliente que ya existe?

Casos que ya se ven en los datos:
- Casi todos necesitan ficha nueva (Econorte, Impacto Óptica, Grupo MyC, GYG, Bernalo…)
- Algunos pueden agruparse: si "Grupo Simple" y "Quantico Tec" son del mismo dueño, es un cliente con dos proyectos

**Entregable:** una pantalla de asignación masiva — lista de proyectos sin cliente, con un selector de cliente existente y un botón "crear ficha con este nombre". Hacerlo de a uno desde la vista de proyecto son 23 idas y vueltas.

**Verificación:** `select count(*) from projects where client_id is null` → 0.

### Fase 2 — Un solo lugar para el sitio web ✅
**Tipo:** esquema · **Depende de:** nada

1. Copiar `clients.website` a `projects.url` donde el proyecto no tenga URL (hoy no perdería nada: los 3 sitios ya están en ambos lados).
2. Normalizar `projects.url`: forzar esquema `https://`, sin barra final, minúsculas en el host. Un `CHECK` que exija que empiece con `http`.
3. `alter table clients drop column website`.
4. Quitar el campo del formulario de cliente y del tipo `ClientOverview`.

**Riesgo:** bajo. Reversible mientras no se corra el `drop column`; se puede dejar la columna renombrada a `website_deprecated` una semana antes de borrarla.

### Fase 3 — Integridad de la ficha de cliente ✅
**Tipo:** esquema · **Depende de:** Fase 1 (para no chocar con duplicados existentes)

1. `unique` sobre el nombre normalizado: `create unique index on clients (lower(trim(name)))`. Falla ruidosamente al crear un duplicado, en vez de crearlo.
2. `CHECK (length(trim(name)) > 0)` — hoy un nombre de solo espacios pasa.
3. `updated_at` en `clients` y `projects`, con trigger.
4. Evaluar unicidad de `projects.url`: dos proyectos con el mismo sitio casi siempre es un error de carga. Empezar con un aviso en la interfaz, no con una restricción dura — puede haber un rediseño y un SEO sobre el mismo dominio.

### Fase 4 — Permisos de cliente para el equipo ✅
**Tipo:** RLS · **Depende de:** nada

1. `clients_update` y `clients_delete` pasan de `owner_id = auth.uid()` a la misma regla que ya usa `clients_select`: dueño **o** miembro de alguno de sus proyectos.
2. Documentar `owner_id` como "quién creó la ficha" (auditoría), no como control de acceso. No hace falta renombrar la columna; sí hace falta que nadie vuelva a usarla para decidir quién ve qué.
3. En las server actions, revisar `count` además de `error`: un `UPDATE` que afecta 0 filas por RLS hoy se reporta como éxito. Es el mismo patrón de error silencioso que apareció tres veces hoy.

### Fase 5 — Borrado seguro ✅
**Tipo:** esquema + interfaz · **Depende de:** nada

1. Bloquear el borrado de un cliente que tenga proyectos: cambiar `projects.client_id` de `ON DELETE SET NULL` a `ON DELETE RESTRICT`. Obliga a desasignar primero, conscientemente.
2. Antes de borrar, la interfaz dice **exactamente** qué se pierde: N proyectos y, si existe, el acceso al portal.
3. Alternativa a evaluar: `archived_at` en vez de borrado físico. Un cliente que se va no desaparece — su historial de facturación y sus datos de Search Console siguen siendo útiles.

### Fase 6 — `client_id` obligatorio ✅
**Tipo:** esquema · **Depende de:** Fase 1 completa

Con los 28 proyectos asignados, `alter table projects alter column client_id set not null` convierte "proyecto sin cliente" en un estado imposible. Es la garantía más fuerte del plan y la única irreversible en la práctica.

**Contra:** obliga a crear la ficha del cliente antes que el proyecto. Si en la operación real a veces se abre un proyecto antes de cerrar el contrato, esta fase estorba. **Decisión tuya**, no técnica.

---

## 3. Orden recomendado

1. **Fase 1** — sin esto, el resto es cosmético
2. **Fase 4** — es un bug activo: Marcela no puede editar clientes y no se entera
3. **Fase 2** — elimina la divergencia que ya existe
4. **Fase 3** — previene el desorden que la Fase 1 va a multiplicar
5. **Fase 5** — protección
6. **Fase 6** — solo si la respuesta a la pregunta de arriba es "siempre hay cliente antes que proyecto"

## 4. Lo que este plan no resuelve

- **Facturación por cliente.** `client_payments` cuelga de `project_id`, lo cual es correcto, pero significa que "cuánto factura este cliente" se calcula sumando proyectos. Con 23 proyectos sin cliente, ese número hoy sería falso. Se arregla solo con la Fase 1.
- **`tasks.client_visible`.** Columna viva de la función de visibilidad que se descartó. Hoy tiene `default true` y no molesta. Borrarla es una migración sobre 799 filas para no ganar nada.
- **Contacto del cliente.** No hay nombre de contacto, email ni cargo. `phone` existe y está vacío en las 5 fichas. Si el portal va a mandar notificaciones alguna vez, hace falta; hoy no.
