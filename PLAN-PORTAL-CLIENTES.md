# Fase 13 — Portal de clientes (solo lectura, sin login)

> Plan de acción, **v3** — enfoque de enlace privado con contraseña, alcance de MVP.
> Fecha: 2026-09-03 · Proyecto: KickPlanner (`asana-clone`)
> El registro de cambios v1→v2→v3 está al final. La bitácora de ejecución vive en `BITACORA-PORTAL.md`.

---

## 0. Qué construimos

Cada cliente recibe una URL propia (`/portal/vitaliah`) protegida por una contraseña compartida. Entra, ve el avance de sus proyectos, las tareas que le marcamos como visibles y los entregables. No hay cuentas de usuario, no hay sistema de login, no hay nada que pueda escribir.

**El principio que ordena todo el diseño:** el cliente nunca se autentica contra Supabase. No existe un usuario externo dentro de la base. Todo lo que el portal muestra lo resuelve el servidor de Next, y lo que muestra está marcado a mano, tarea por tarea.

---

## 1. Por qué este enfoque y no el de cuentas de usuario

Las versiones v1 y v2 daban a cada cliente un usuario real de Supabase Auth. Eso obligaba a repararlo todo antes de encender nada, porque **las reglas de permisos de la base están escritas asumiendo que todo el que se loguea es de KickRanking**:

- `is_project_member()` autoriza lectura *y* escritura con la misma función.
- `profiles` es legible por cualquier autenticado (`USING (true)`).
- `workspace_members()` devuelve el correo de todo el equipo sin validar quién llama.
- `generate_client_payments()` y `seed_web_installments()` escriben en `client_payments` sin validar nada.
- El middleware solo distingue "logueado / no logueado".

Sin un principal externo autenticado, **esa clase entera de problema desaparece**. Los cinco puntos siguen siendo deuda técnica y quedan anotados en el ROADMAP, pero dejan de ser bloqueantes de esta fase.

Lo que se conserva de las versiones anteriores es lo que nunca dependió del login: **la visibilidad tarea por tarea**. Ese siempre fue el trabajo real.

### Lo que se acepta a cambio

| Se pierde | Impacto real |
|---|---|
| Identidad | No sabés quién abrió el portal ni cuándo |
| Revocación fina | Rotar el enlace corta a todos los de ese cliente a la vez |
| Auditoría por persona | No hay registro de quién vio qué |

Con 4 clientes y un tablero de avances, es un intercambio razonable: lo que hay del otro lado son títulos de tareas y enlaces de Drive, no facturación ni datos de otros clientes. Si más adelante el portal necesita aprobaciones o comentarios, hará falta identidad — y este camino no la cierra: la visibilidad y las consultas de lectura se reusan tal cual.

---

## 2. Estado real de los datos (medido, no estimado)

- 799 tareas: **330 principales**, 469 subtareas. 240 principales completadas.
- **17 tareas con `drive_url`** en toda la base: 15 en tareas principales, 2 en subtareas.
- 25 proyectos: 20 `on_track`, 4 `on_hold`, 1 `upcoming`.
- 5 usuarios, todos `@kickranking.com`.
- `task_activity` **solo registra desde el 18 de agosto de 2026**. Hay 99 eventos de cambio de estado (`type='status'`, `meta->>'to'='done'`). Como 240 tareas principales ya están completadas, **la mayoría de las finalizaciones ocurrieron antes de que existiera el registro y no tienen fecha recuperable**.

Consecuencias directas: la sección de entregables va a estar vacía en casi todos los proyectos, y la línea de tiempo arranca en agosto, no en el inicio de cada proyecto. Los textos de la interfaz tienen que estar escritos para eso (ver 5.4).

---

## 3. Decisiones de producto del MVP

Las tomo del lado conservador. Sacar algo del portal después es fácil; explicarle a un cliente por qué vio algo que no debía, no.

| Dato | En el MVP | Por qué |
|---|---|---|
| Título de la tarea | **Sí** | Es el contenido |
| Estado (pendiente / en curso / lista) | **Sí** | Es el avance |
| Enlace de Drive | **Sí** | Es el entregable |
| Fecha de finalización | **Sí**, donde exista | Es un hecho pasado, no una promesa |
| **Fecha de entrega futura** | **No** | Exponer `due_date` convierte cada atraso en promesa rota, y presiona al equipo a poner fechas defensivas. Esas mismas fechas alimentan `/panel`, `/mis-tareas` y el KPI de vencidas: el portal terminaría corrompiendo el dato del que depende tu gestión interna |
| **Prioridad** | **No** | "Baja" le dice al cliente que despriorizaste lo suyo. Es conversación de PM, no dato de avance |
| **Estado del proyecto** | **No** | Hay 4 proyectos en `on_hold` ahora mismo. "En pausa" sin contexto es una señal interna, no información |
| **Descripción** | **No** | Campo de trabajo interno |
| Responsable, comentarios, actividad cruda, pagos, honorarios | **No** | Nunca |

Todas son reversibles con una línea. Si después de ver el piloto querés sumar fechas comprometidas, se agrega un campo aparte que solo cambia cuando alguien decide cambiarlo — nunca el `due_date` interno.

---

## 4. Arquitectura

### 4.1 Dónde vive el secreto

URL limpia por cliente + contraseña en un formulario + **cookie firmada**. El secreto nunca aparece en la barra de direcciones.

> **Por qué no un token en la URL.** La pantalla enlaza a Google Drive. Al hacer clic, el navegador manda la URL completa —con el token adentro— en la cabecera `Referer` hacia Google. El secreto se filtraría solo por usar la página. Además queda en el historial, en favoritos y en cada reenvío del correo.

Se suma `Referrer-Policy: no-referrer` y `noindex` en las rutas del portal.

### 4.2 Cómo lee los datos

Las páginas del portal se renderizan **enteras en el servidor** de Next (ya son todas server components) y consultan Supabase con la **service role key**, que nunca sale del servidor. El navegador del cliente jamás habla con Supabase.

La alternativa —una función de Postgres abierta al rol anónimo— queda descartada: la clave anónima es pública, así que esa función quedaría expuesta a internet con el token como único blindaje.

> **La contrapartida, dicha claro:** la service role key saltea todas las reglas de permisos. Por eso **todas** las consultas del portal viven en un único módulo (`app/portal/data.ts`), pequeño y revisable, donde cada consulta filtra siempre por el `client_id` ya resuelto desde la cookie. Ninguna página escribe una consulta suelta.

### 4.3 Tablas nuevas

```sql
-- Acceso por cliente
create table public.portal_access (
  client_id      uuid primary key references public.clients(id) on delete cascade,
  slug           text not null unique,          -- 'vitaliah'
  password_hash  text not null,                 -- pgcrypto / bcrypt
  enabled        boolean not null default true, -- interruptor de emergencia
  created_at     timestamptz not null default now(),
  rotated_at     timestamptz
);

-- Visibilidad
alter table public.tasks          add column client_visible boolean not null default false;
alter table public.template_tasks add column client_visible boolean not null default false;
create index idx_tasks_client_visible on public.tasks (project_id) where client_visible;
```

`portal_access` no necesita políticas para el cliente (nunca la consulta un usuario autenticado); sí para el equipo: solo staff lee y escribe.

### 4.4 Reglas de visibilidad, aplicadas en la base

1. Todo arranca en `false`. Las 799 tareas actuales quedan invisibles. El portal nace vacío a propósito.
2. Una subtarea solo se entrega si **ella y su tarea padre** están marcadas. Un padre oculto oculta toda la rama.
3. `template_tasks` lleva el campo y `apply_template()` lo propaga, para que el flujo normal —crear el proyecto desde la plantilla SEO— ya deje marcados los entregables estándar.
4. Como la regla 2 puede esconder en silencio 2 de los 17 entregables actuales, la interfaz interna **avisa** cuando una tarea marcada no se está mostrando por culpa de su padre. Que falle visible, no callado.

---

## 5. Fases del MVP

### Fase 1 — Visibilidad y marcado

Migración de 4.3 (parte de visibilidad) + la interfaz para usarla:

- Interruptor "Visible para el cliente" en el panel de la tarea.
- **Acción masiva en la vista Lista**: seleccionar varias y marcar o desmarcar. Sin esto, poner al día un proyecto de 30 tareas es inviable.
- Contador en la cabecera del proyecto: "12 de 40 tareas principales visibles". *(Se cuentan tareas principales, igual que el `num_tasks` de `projects_overview`.)*
- Aviso de la regla 4.4.4.
- **Consulta de arranque**, para revisar antes de aplicar: marca las tareas principales completadas que tienen `drive_url` — entregables reales ya cerrados. Convierte "marcar 330 tareas" en "revisar unas pocas".

**No toca el portal.** Es una función interna del equipo, útil por sí sola, y se puede empezar a usar el mismo día.

### Fase 2 — Acceso

Tabla `portal_access`, alta y rotación de contraseña desde `/clientes`, pantalla de contraseña, cookie firmada, excepción en el middleware para que `/portal/*` no rebote a `/login`, cabeceras `no-referrer` y `noindex`, y límite de intentos.

### Fase 3 — Lectura

`app/portal/data.ts`: el módulo único con las consultas, la definición del avance (**sobre tareas principales visibles**) y la línea de tiempo derivada de `task_activity` filtrada por visibilidad.

### Fase 4 — Pantallas

Layout propio sin sidebar ni buscador; listado de proyectos; detalle con avance, tareas agrupadas en **Pendientes / En curso / Completadas**, entregables y línea de tiempo. Estados vacíos escritos de verdad (ver punto 2). Cero controles de edición.

### Fase 5 — Piloto y verificación

Se enciende para **un solo cliente**. Marcado real de su proyecto, revisión de lo que se ve, y recién después se abre al resto.

Batería de verificación:

1. `/portal/<slug>` sin cookie → pide contraseña. Contraseña incorrecta → no entra. Muchos intentos → bloqueo temporal.
2. Con la cookie del cliente A, pedir `/portal/<slug-de-B>` → pide contraseña de B.
3. Una tarea sin marcar no aparece. Una subtarea marcada con el padre sin marcar, tampoco. Al desmarcar, desaparece.
4. En la respuesta HTML del portal no aparece ningún dato excluido del punto 3: ni fechas de entrega, ni prioridades, ni responsables, ni descripciones.
5. Hacer clic en un entregable de Drive y confirmar que no se filtra el `Referer`.
6. `enabled = false` deja el portal fuera con un mensaje claro, sin desplegar nada.
7. **Regresión del equipo:** panel, proyectos, tareas, pagos y perfiles funcionan igual que antes.
8. `npm run build` y `npm run lint` limpios.

---

## 6. Fuera del MVP

Identidad por persona · comentarios y aprobaciones · avisos por correo · marca blanca por cliente · PDF del avance · métricas de Search Console · fechas comprometidas como campo aparte · historial de actualizaciones del PM.

Deuda técnica que este enfoque deja de bloquear pero que sigue viva: los cinco puntos del apartado 1, más `db/schema.sql` desfasado y la protección de contraseñas filtradas en Supabase Auth.

---

## 7. Riesgos vivos

| Riesgo | Mitigación | ¿Resuelto? |
|---|---|---|
| El enlace se reenvía o se lo lleva alguien que se fue | Rotación de contraseña desde `/clientes` | Parcial, es el costo aceptado del enfoque |
| Un error con la service role key saltea todos los permisos | Un solo módulo de consultas, siempre filtrando por `client_id` | Sí, si se respeta la regla |
| **El marcado se abandona** | Plantillas premarcadas, contador visible, acción masiva | **No.** Ver abajo |
| El portal nace vacío y parece roto | Consulta de arranque + estados vacíos escritos | Parcial |
| Fuga del secreto por `Referer` | Cookie en vez de token en URL + `no-referrer` | Sí |

**El riesgo que no está resuelto** es el de abandono. Cada tarea nueva nace invisible; a los tres meses nadie se acuerda del interruptor, el cliente entra y ve el mismo proyecto de hace un trimestre, y el portal daña la relación más que si no existiera. Las mitigaciones bajan la fricción pero no crean el hábito. **Es la razón principal para hacer un piloto con un solo cliente antes de abrir el resto:** si en un mes el marcado no se sostiene con uno, no se va a sostener con cuatro.

---

## 8. Lo que hace falta para avanzar

| Necesito | Bloquea | Estado |
|---|---|---|
| Visto bueno para aplicar la migración de visibilidad | Fase 1 | **Pendiente** |
| `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (sin `NEXT_PUBLIC_`) | Fases 3 a 5 | **Pendiente** |
| Qué cliente es el piloto | Fase 5 | Pendiente |

La fase 1 no depende de la service role key, así que se puede empezar mientras tanto.

---

## Registro de cambios

**v1 → v2** — Cinco fallas corregidas: el cliente veía las 799 tareas (visibilidad mal clasificada como fase futura); `is_staff()` definido por descarte, que fallaba abriendo permisos y hacía que revocar un acceso ascendiera al ex-cliente a miembro del equipo; proteger `workspace_members()` no evitaba que los clientes aparecieran en los selectores del equipo; "% de avance" sin definir con dos criterios ya conviviendo en el código; y `/portal?as=<id>`, que metía un parámetro de suplantación en la pantalla de los clientes. Se sumaron recuperación de contraseña, interruptor de emergencia y estados vacíos.

**v2 → v3** — Cambio de enfoque: se elimina la autenticación del cliente. Con ello desaparecen las tablas de identidad, los triggers de exclusión mutua, el middleware con roles, la recuperación de contraseña, el alta por API de administración y el endurecimiento previo de la base, que pasa de bloqueante a deuda técnica. Se conserva íntegra la visibilidad tarea por tarea. Se decide el secreto en cookie y no en la URL (fuga por `Referer` al enlazar a Drive), la lectura por servidor con service role en un módulo único, y un alcance de MVP con decisiones de producto conservadoras: sin fechas de entrega, sin prioridad, sin estado de proyecto, sin descripción. Se agrega la línea de tiempo y se documenta que `task_activity` solo tiene datos desde el 18 de agosto.
