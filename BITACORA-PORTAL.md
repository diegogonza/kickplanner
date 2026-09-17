# Bitácora — Portal de clientes

Registro de ejecución de la Fase 13. El plan vive en `PLAN-PORTAL-CLIENTES.md`.
Entradas en orden cronológico inverso: lo más reciente arriba.

Cada entrada anota **qué se hizo**, **qué se decidió y por qué**, y **qué quedó abierto**. Las decisiones se registran aunque después se reviertan: saber por qué se descartó algo vale tanto como saber por qué se eligió.

---

## 2026-09-03 · Auditoría, tres versiones del plan y cambio de enfoque

### Qué se hizo

Auditoría de la base y del código antes de diseñar nada: esquema real en Supabase (`nowiyhgvlaskihnugotr`), políticas RLS, las 34 funciones de `public`, middleware y rutas. Tres iteraciones del plan (v1 → v2 → v3), cada una a partir de fallas encontradas en la anterior.

### Hallazgos de la auditoría

Los permisos de la base están escritos asumiendo que **todo el que se loguea es de KickRanking**. Cinco puntos concretos:

1. `is_project_member()` autoriza lectura *y* escritura con la misma función. Sumar a un cliente como miembro del proyecto le daría permiso de editar y borrar tareas y de crear registros de pago.
2. `profiles` tiene la política `SELECT ... USING (true)`.
3. `workspace_members()` es `SECURITY DEFINER` sin validar al llamante: devuelve el correo y el nombre de todo el equipo.
4. `generate_client_payments()` y `seed_web_installments()` son `SECURITY DEFINER` sin guarda y **escriben** en `client_payments`.
5. El middleware solo distingue "logueado / no logueado"; cualquier autenticado alcanza `/panel`, `/pagos`, `/clientes`, `/teams`.

El resto de funciones `SECURITY DEFINER` sí valida al llamante (verificado una por una).

### Datos medidos

| Dato | Valor |
|---|---|
| Tareas | 799 (330 principales, 469 subtareas) |
| Principales completadas | 240 |
| Tareas con `drive_url` | **17** (15 principales, 2 subtareas) |
| Proyectos | 25 (20 `on_track`, 4 `on_hold`, 1 `upcoming`) |
| Usuarios | 5, todos `@kickranking.com`; `carolina@` sin proyecto ni equipo y sin haber iniciado sesión nunca |
| `task_activity` | 981 filas, **solo desde el 18-ago-2026**; 99 eventos de cambio de estado |

Dos consecuencias que condicionan el producto: la sección de entregables va a estar casi vacía, y la línea de tiempo no puede llegar más atrás de agosto porque el dato no existe.

### Decisiones

**Se descarta sumar al cliente a `project_members`.** Le daría permiso de escritura. (Hallazgo 1.)

**Se descarta la autenticación del cliente** (v1 y v2 la usaban). Sin un principal externo autenticado dentro de la base, los cinco hallazgos dejan de ser bloqueantes de esta fase y pasan a deuda técnica. Se elimina así la parte más delicada del trabajo.

**Se adopta enlace privado por cliente + contraseña compartida + cookie firmada.**

**El secreto va en cookie, no en la URL.** Razón concreta: la pantalla enlaza a Google Drive; con el token en la URL, el navegador lo manda entero en la cabecera `Referer` hacia Google al hacer clic. Se filtraría solo por usar la página.

**La lectura la hace el servidor con la service role key, en un módulo único** (`app/portal/data.ts`). Se descarta abrir una función de Postgres al rol anónimo: la clave anónima es pública, así que quedaría expuesta a internet con el token como único blindaje. Contrapartida asumida: la service role key saltea todos los permisos, por eso todas las consultas viven en un solo archivo revisable que siempre filtra por `client_id`.

**La visibilidad es opt-in tarea por tarea** (`tasks.client_visible`, por defecto `false`). Es lo único que sobrevive intacto a los tres cambios de enfoque, porque nunca dependió del login. Hay 799 tareas escritas durante meses asumiendo que nadie de afuera las leería.

**Decisiones de producto del MVP, todas del lado conservador:** sin fechas de entrega futuras, sin prioridad, sin estado del proyecto, sin descripción. La razón más fuerte es la de las fechas: exponer `due_date` presiona al equipo a poner fechas defensivas, y esas fechas alimentan `/panel`, `/mis-tareas` y el KPI de vencidas. El portal terminaría corrompiendo el dato del que depende la gestión interna.

### Fallas propias corregidas en el camino

De v1 a v2 se corrigieron cinco, que quedan anotadas porque son errores fáciles de repetir:

- Clasificar la visibilidad selectiva como mejora futura, cuando era requisito para lanzar.
- Definir "es del equipo" **por descarte** ("no está en la lista de clientes"). Fallaba abriendo permisos, y hacía que **revocar un acceso ascendiera al ex-cliente a miembro del equipo**.
- Proteger quién llama a `workspace_members()` sin filtrar el resultado: los clientes habrían aparecido igual en el selector de responsable y en las menciones `@`.
- Prometer un "% de avance" sin definirlo, con dos criterios ya conviviendo en el código.
- Proponer `/portal?as=<client_id>`: un parámetro de suplantación en la única pantalla a la que llegan los clientes.

### Riesgo abierto principal

**El abandono del marcado.** Cada tarea nueva nace invisible; si el hábito no se sostiene, el cliente entra a los tres meses y ve el mismo proyecto de hace un trimestre. Las mitigaciones (plantillas premarcadas, contador visible, acción masiva) bajan la fricción pero no crean el hábito. Es la razón de hacer un piloto con **un solo cliente**: si no se sostiene con uno, no se sostiene con cuatro.

### Estado

- Plan v3 escrito.
- Migración de visibilidad escrita en `db/migrations/001_portal_visibilidad.sql`, **sin aplicar**.
- Pendiente: visto bueno para aplicar la migración · `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` · elegir el cliente piloto.

---

## 2026-09-03 (bis) · El seed de arranque: primera idea descartada

### Qué pasó

El plan v3 proponía sembrar la visibilidad marcando "las tareas principales completadas que tienen enlace de Drive", con el argumento de que convertía "marcar 330 tareas" en "revisar unas pocas".

Se ejecutó la consulta antes de escribirla en firme. **Devuelve 3 filas:**

| Cliente | Proyecto | Tarea |
|---|---|---|
| Nono Solutions | Hunter X | Reporte SEO Mes 3 |
| Vitaliah SAS | Vitaliah | Reporte Mes 6 |
| *(sin cliente)* | Aromy | Keyword Research |

No resuelve el problema que decía resolver. La causa es el dato ya conocido: solo 17 tareas en toda la base tienen `drive_url`. Era predecible desde el propio apartado 2 del plan y se pasó por alto.

### Eje nuevo: las etiquetas

Las 245 asignaciones de etiqueta están **todas sobre tareas principales**, y los nombres ya separan naturalmente lo que es de cara al cliente de lo que es interno:

| Etiqueta | Tareas | Lectura |
|---|---|---|
| On-page | 58 | Trabajo entregable |
| Inbound | 41 | Trabajo entregable |
| Reports | 40 | Claramente de cara al cliente |
| UI/UX | 36 | Trabajo entregable |
| Technical | 33 | Trabajo entregable |
| Backlog | 29 | Claramente interno |
| Proposals | 5 | Claramente interno |
| Local | 3 | — |

**8 decisiones en vez de 330**, cubriendo el 74% de las tareas principales. El resto (~85 sin etiqueta) se resuelve con la acción masiva, proyecto por proyecto.

También sirve como pista de que los títulos están fuertemente plantillados ("Reporte SEO Mes N" aparece en 11 proyectos, "Content Calendar Mes N" en 6), así que el marcado desde `template_tasks` va a cubrir bien el trabajo nuevo.

### Decisión sobre el acoplamiento con etiquetas

Se evaluó hacer que la visibilidad **siguiera** a la etiqueta de forma automática, lo que resolvería también el riesgo de abandono. **Se descarta.** Una tarea se volvería visible como efecto colateral de etiquetarla, que es exactamente la forma en que ocurren los accidentes.

La etiqueta queda como **herramienta de marcado masivo**, no como fuente de verdad. El booleano explícito sigue mandando.

### Estado

`db/migrations/001_portal_visibilidad.sql` actualizada con el eje de etiquetas en tres pasos (revisar → marcar → repasar el resto). Sigue **sin aplicar**.

Pendiente de decisión del equipo: **qué etiquetas son de cara al cliente**. `Reports` parece obvia; `Backlog` y `Proposals` obviamente no; las cinco restantes hay que mirarlas por dentro.

---

## 2026-09-03 (ter) · Hallazgo estructural: 21 de 25 proyectos no tienen cliente

### Qué se encontró

Al buscar candidatos para el piloto salió esto:

| Cliente | Proyectos | Tareas principales |
|---|---|---|
| *(sin cliente asignado)* | **21** | **249** |
| Vitaliah SAS | 1 | 53 |
| Nono Solutions | 1 | 27 |
| Domidel | 1 | 1 |
| Inmigración con Acción | 1 | 0 |

**El 84% de los proyectos tiene `client_id = null`.** El portal se organiza por cliente: entra el cliente, ve sus proyectos. Un proyecto sin `client_id` no pertenece a nadie y **no puede aparecer en ningún portal**, esté marcado como esté.

Es decir: el portal, tal como está la base hoy, tendría contenido real para **dos clientes** (Vitaliah y Nono Solutions) y estaría vacío o casi vacío para los otros dos.

### Por qué importa

No es un problema del plan, es un problema del dato, y ninguna de las tres versiones lo habría detectado hasta el momento de encender el portal y encontrarlo vacío. La auditoría inicial contó proyectos y tareas, pero no verificó la **relación** entre proyecto y cliente, que es justamente el eje sobre el que se apoya toda la funcionalidad.

Lección para el resto de la fase: contar filas no es lo mismo que verificar que las filas están conectadas como el diseño supone.

### Consecuencia práctica

Antes de abrir el portal a los cuatro clientes hay que vincular los 21 proyectos huérfanos, o decidir que muchos de ellos son internos y no corresponden a ningún cliente. Es trabajo de datos, no de código, y puede hacerse en paralelo.

**Para el MVP es una buena noticia:** el piloto no necesita esa limpieza. Vitaliah SAS ya está vinculado, tiene un solo proyecto, 53 tareas principales y usa las 8 etiquetas. Es el candidato natural, y 53 tareas es un volumen de marcado que una persona resuelve en una sentada.

### Estado

Propuesta de piloto: **Vitaliah SAS**. Pendiente de confirmación.

---

## 2026-09-14 · Implementada la v1 del portal

Se construyó e instaló la primera versión. La marca de la app cambió en el
ínterin de coral a verde ("Hell Basement"), así que el portal se armó sobre los
tokens nuevos de `globals.css`, no sobre los del plan.

### Tokens tomados del último estado del repo

| Token | Valor | Uso en el portal |
|---|---|---|
| `--brand-600` | `#0a8452` | Primario: anillo de avance, botón, enlaces |
| `--brand-500` | `#00b968` | Acentos sobre superficies oscuras |
| `--brand-50/100` | `#f0fbf6` / `#dbf5ea` | Fondos suaves, icono del proyecto |
| `--nav-bg` | `#041A14` | Barra superior y fondo de la puerta |
| `--bg` / `--surface` | `#f4f8f6` / `#ffffff` | Lienzo y tarjetas |
| `--border` | `#e3ebe7` | Bordes de tarjeta |
| `--text` / `--text-3` | `#10201a` / `#5e7a6e` | Tinta principal y secundaria |

### Cambio de arquitectura: adiós a la service role key

El plan v3 (apartado 4.2) decía que el servidor leería con la **service role
key**. **Se descartó.** En su lugar:

- `portal_login(slug, password)` valida con bcrypt (pgcrypto) y crea una fila en
  `portal_sessions` con un token de **32 bytes aleatorios**.
- El token viaja en una cookie `httpOnly`, nunca en la URL.
- Cada función de datos (`portal_me`, `portal_projects`, `portal_project`)
  recibe el token y resuelve el `client_id` por su cuenta.

Ventaja: **no hay ninguna clave que saltee los permisos** dando vueltas por la
app, y desaparece el bloqueante que tenía frenada la fase 3. La clave anónima
por sí sola no devuelve nada, porque sin un token de sesión válido todas las
funciones responden vacío.

Detalle que costó un rato: **pgcrypto vive en el esquema `extensions`, no en
`public`**. Como las funciones fijan `search_path = public`, `crypt()` y
`gen_random_bytes()` hay que llamarlas calificadas. Falla en ejecución, no al
crear la función, así que no salta hasta que alguien intenta entrar.

Segundo detalle, al probar: una función `stable` no ve la fila que otra función
insertó **en la misma sentencia SQL**. El primer test de punta a punta daba
`null` en todo; no era un error del código, era el snapshot de la transacción.
Hay que probar login y lectura en sentencias separadas.

### Lo que se apartó del mockup, a propósito

El diseño de referencia traía, dentro de la banda de bienvenida del cliente, las
**píldoras de etiquetas con sus conteos**: `Reports 8`, `On-page 13`, … y al
final `Proposals 4` y `Backlog 2` en gris.

**No se implementaron.** Ese elemento venía del panel interno del prototipo
anterior, donde servía para decidir qué exponer. Puesto en la pantalla del
cliente hace exactamente lo contrario de lo que buscamos: le muestra la
taxonomía interna de la agencia y, peor, le dice que hay **6 cosas que no puede
ver**. Un portal que anuncia sus propios huecos genera más desconfianza que uno
que simplemente muestra el trabajo.

Tampoco se implementaron "Archivos", "Mensajes" ni la campana de
notificaciones: no existen detrás. La navegación quedó con lo que sí responde.

### Estado de la base

- `tasks.client_visible` y `template_tasks.client_visible` creadas (default `false`).
- `portal_access` y `portal_sessions` creadas, con RLS.
- Seis funciones `portal_*`; `portal_session_client` revocada de todos los roles.
- Piloto **Vitaliah** dado de alta: 47 de 53 tareas raíz visibles (todo menos
  `Backlog` y `Proposals`). Avance que ve el cliente: **81%** (38 de 47).

### Avisos del linter de Supabase, revisados

El linter marca las cinco funciones `portal_*` como *"ejecutables por anon"*.
**Es deliberado y es el diseño**: el portal no autentica contra Supabase, así
que sus funciones tienen que ser alcanzables sin sesión. La protección no es
quién llama, es que sin un token de sesión válido no devuelven nada, y
`portal_login` bloquea 15 minutos tras 8 intentos fallidos.

`portal_sessions` aparece como *"RLS sin políticas"*: también es a propósito.
Nadie lee esa tabla por REST; solo la tocan las funciones `SECURITY DEFINER`.

Sigue pendiente **activar la protección de contraseñas filtradas** en Supabase
Auth (deuda vieja, ahora más relevante).

### Pendiente para la v2

1. **Interfaz de marcado** (fase 2 del plan): hoy `client_visible` solo se
   cambia por SQL. Falta el interruptor por tarea y la acción masiva en la vista
   Lista. Sin eso el portal se congela en lo que se marcó hoy.
2. **Alta de accesos desde `/clientes`**: hoy el alta y la rotación de
   contraseña son SQL a mano (los comandos están en `db/migrations/002`).
3. **Vincular los 24 proyectos sin cliente**, o el portal solo sirve para dos.
4. Decidir si el cliente ve o no las fechas de entrega. **La v1 las muestra**,
   siguiendo el diseño pedido, pero eso deja a la vista los atrasos: al
   14-sep-2026 Vitaliah tiene dos tareas vencidas visibles.

---

## 2026-09-14 (bis) · Interfaz de marcado (fase 2)

La v1 dejaba `client_visible` solo modificable por SQL, así que el portal se
congelaba en lo marcado ese día. Esto lo resuelve.

### Qué se construyó

**Pantalla `/projects/[id]/portal` — "Qué ve el cliente".** Lista las tareas
raíz del proyecto con una casilla cada una, un resumen arriba (cuántas visibles
y qué porcentaje de avance verá el cliente) y un botón de guardar que solo se
habilita si hay cambios.

**Atajos por etiqueta.** Cada etiqueta es una píldora con "Mostrar" y "Ocultar"
que prende o apaga todo el grupo, y muestra cuántas de ese grupo están activas.
Es el mismo razonamiento del seed: 8 decisiones en vez de 330.

**Interruptor por tarea** en el panel de detalle, en la fila "Portal", junto a
Estado / Responsable / Prioridad / Entrega / Etiqueta.

**Contador en la cabecera del proyecto:** "Portal: 47 de 53", que además es el
enlace a la pantalla de marcado. Solo aparece si el proyecto tiene cliente.

### Decisiones

**No se metieron casillas en la vista Lista**, que era lo que decía el plan
(fase 2, "acción masiva en la vista Lista"). Habría obligado a agregar estado de
selección a un componente grande y muy usado, con riesgo de romper algo que hoy
funciona. Una pantalla propia es más segura y además es mejor para el trabajo
real, que no es marcar una tarea suelta sino **revisar el proyecto entero de una
sentada** viendo etiquetas y entregables al lado de cada título.

**El interruptor solo aparece en tareas raíz.** El portal v1 no muestra
subtareas, así que ofrecerlo en una subtarea sería prometer algo que no pasa.

**Las acciones viven en `app/projects/portal-visibility.ts`**, no dentro de la
carpeta `[id]/portal/`, para no importar desde una ruta con corchetes.

**No se comprueban permisos a mano en las acciones**: las escrituras van con la
sesión del usuario y la política RLS de `tasks` ya exige `is_project_member()`
para UPDATE.

### Error propio, corregido antes de entregar

El contador de la cabecera usaba `list`, que es la lista **ya filtrada** por
"ocultar hechas". Con ese filtro activo habría dicho "Portal: 9 de 9" en vez de
"47 de 53". Se cambió a `allTop`, que son todas las tareas raíz.

### Pendiente

- Alta y rotación de accesos desde `/clientes` (hoy sigue siendo SQL a mano).
- Vincular los 24 proyectos con `client_id` nulo.
- `template_tasks.client_visible` existe pero `apply_template()` todavía no lo
  propaga: las tareas creadas desde plantilla siguen naciendo ocultas.

---

## 2026-09-14 (ter) · Se invierte el criterio: todo visible por defecto

### La decisión

Oscar: *"no quiero ocultar nada, todo lo registrado son actividades para cada
cliente, prefiero que esto solo sea una vista general para que el cliente sea
parte del proyecto."*

El portal deja de ser una **selección curada** y pasa a ser una **vista general**
del trabajo. El argumento es sólido para esta operación: en una agencia de SEO
las tareas registradas *son* el servicio que se factura, no notas internas.

### Qué cambió

- `tasks.client_visible` y `template_tasks.client_visible` pasan a `default true`.
- Las 799 tareas existentes quedaron visibles (0 ocultas).
- El chip de la cabecera del proyecto ya no dice "47 de 53". Ahora dice solo
  **"Portal"**, y agrega un número únicamente si hay algo oculto ("Portal: 3
  ocultas"). Es un aviso, no un adorno.
- El texto de la pantalla de marcado se reescribió: los controles están para la
  excepción, no para la rutina.

### Qué NO se borró, y por qué

El mecanismo entero (columna, pantalla, interruptor por tarea) **se conserva**.
Borrarlo habría sido más "limpio", pero el problema que resuelve sigue existiendo
aunque hoy no se use: el portal es una puerta de un solo sentido —ocultar algo
después no sirve, el cliente ya lo vio— y quedan 24 proyectos cuyo contenido
nadie revisó. Mantener el interruptor cuesta cero cuando no se toca; no tenerlo
se paga una sola vez y mal.

Con el default invertido, el costo operativo desaparece: nadie tiene que acordarse
de prender nada, y el caso raro sigue teniendo solución.

### Efecto secundario bueno

Esto resuelve solo el pendiente de `apply_template()`: como el default es `true`,
las tareas creadas desde plantilla nacen visibles sin necesidad de propagar nada.
Y desaparece el riesgo de abandono del marcado, que era el principal riesgo
abierto del plan.

---

## 2026-09-14 (quater) · Se elimina la sección de visibilidad

### La decisión

Oscar preguntó dos veces para qué servía la pantalla de marcado. La respuesta
honesta es que, con la política que él eligió —todo se muestra, siempre—, **no
sirve para nada**: es un panel de control de una decisión ya tomada, que iba a
quedar mostrando 53/53 para siempre.

El argumento que yo había dado para conservarla se cae solo: **si una tarea tiene
un título que no corresponde mostrarle al cliente, el arreglo es reescribir el
título**, no esconder la tarea. Sigue siendo trabajo hecho y facturado. Esa
salida ya existía y no necesitaba ningún sistema de visibilidad encima.

### Qué se borró

- `app/projects/[id]/portal/page.tsx` (la pantalla)
- `app/components/portal-visibility-editor.tsx`
- `app/components/portal-toggle.tsx`
- `app/projects/portal-visibility.ts` (las server actions)
- La fila "Portal" del panel de tarea (`task-detail.tsx`)
- `client_visible` del tipo `Task` y de `TASK_COLS`

### Qué quedó en su lugar

Un enlace en la cabecera del proyecto: **"Portal del cliente ↗"**, que abre
`/portal/<slug>` en otra pestaña. Solo aparece si ese cliente tiene acceso creado
y encendido.

### Qué sobrevive en la base, sin interfaz

La columna `tasks.client_visible` con `default true`, y el filtro
correspondiente dentro de las funciones `portal_*`. No se ve en ningún lado y no
cuesta nada. Si dentro de seis meses aparece un caso real, es un `update` de una
línea en vez de rehacer el mecanismo entero.

### Lección

Construí la pantalla de marcado porque el plan la pedía, no porque el negocio la
necesitara. El plan había supuesto que las tareas internas de la agencia eran
material sensible; en una agencia de SEO las tareas registradas *son* el servicio
facturado. Un supuesto equivocado arrastró tres entregas: la columna, la pantalla
y el interruptor. Conviene preguntar "¿qué hay ahí adentro?" antes de diseñar el
mecanismo para protegerlo.

---

## 2026-09-15 · Fase 14: OAuth de Google conectado

### Google Cloud, hecho desde el navegador

Proyecto **"Google Search Console"** (`horizontal-time-490405-t4`), con la cuenta
`accesoskickranking@gmail.com`.

Tres cosas resultaron mejor de lo que suponía el plan:

1. **La Search Console API ya estaba habilitada.** Paso ahorrado.
2. **La app ya está "En producción"**, no en modo prueba. El riesgo que el plan
   marcaba como principal —el token de refresco caducando cada 7 días— **no
   aplica**. Queda descartado de la tabla de riesgos.
3. **`webmasters.readonly` es un permiso NO sensible** para Google. Lo registré
   en "Acceso a los datos" y quedó en la lista de no sensibles: no hace falta
   verificación, y la pantalla de consentimiento no va a mostrar la advertencia
   de "app no verificada".

Cliente OAuth nuevo: **"KickPlanner - Search Console"**, tipo Aplicación web,
redirección a `http://localhost:3000/api/google/callback`. Se creó uno nuevo en
vez de reusar los dos existentes (`GSC MCP Server`, `GSC API WEB`) para no tocar
lo que ya funciona.

> Detalle al capturar las credenciales: leí el secreto con `javascript_tool`
> sobre el DOM en vez de transcribirlo de la captura de pantalla. Bien que lo
> hice: a ojo había leído una `l` minúscula donde iba una `I` mayúscula.

### Base de datos

- `pg_cron` y `pg_net` habilitadas.
- Tablas `google_oauth`, `gsc_properties`, `gsc_monthly`, `gsc_rankings`,
  `gsc_keywords`, todas con RLS solo para el equipo.
- `gsc_purgar_keywords()` para la retención de 12 meses.
- `portal_seo(token, project_id)` — la lectura del portal.
- `google_oauth_guardar()`, `google_oauth_estado()`, `google_oauth_desconectar()`.

**El refresh token no toca ningún archivo ni ninguna tabla en texto plano.** Va
a Supabase Vault a través de `google_oauth_guardar()`, que es SECURITY DEFINER.
Gracias a eso el servidor de Next **no necesita la service role key** para el
flujo de OAuth. Probé el ciclo completo (guardar → leer desde vault → borrar)
con un token ficticio y quedó limpio.

### Manejo de errores

Era un pedido explícito, así que quedó en tres capas:

- **`app/lib/google.ts`** — ninguna función tira excepción. Todas devuelven
  `{ ok: true, data }` o `{ ok: false, error }` con el mensaje ya escrito para
  una persona. Incluye el caso de `invalid_grant` (token revocado) y el de
  Google devolviendo el consentimiento sin refresh token, con la instrucción de
  qué hacer.
- **Las rutas `/api/google/*`** — toda salida termina en `/ajustes` con
  `?google_ok=1` o `?google_error=<texto legible>`. Cancelar en la pantalla de
  Google no es un error: dice "cancelaste, no se guardó nada". Hay `state`
  contra CSRF, en cookie httpOnly con 10 minutos de vida.
- **`portal_seo`** — tiene `exception when others` y siempre devuelve un objeto
  dibujable: `sin_propiedad`, `sin_datos` u `ok`, más `desactualizado` si la
  última sincronización tiene más de 3 días. La tarjeta del cliente nunca recibe
  una excepción.

### Bloqueo encontrado

**No se puede escribir `.env.local` desde acá**: el puente con la máquina lo
prohíbe por política (`Writing to .env.local is not permitted via remote tools`).
El archivo quedó armado y entregado por la conversación; hay que copiarlo a mano
a la carpeta del proyecto.

### Falta

Edge Function `gsc-sync` (incremental + backfill), el `pg_cron`, vincular la
propiedad al proyecto, la tarjeta del portal y el aviso de desactualizado en
`/panel`.

---

## 2026-09-15 · Fase 14 (cierre) — sincronización y tarjeta del cliente

### Edge Function `gsc-sync`

Desplegada con `verify_jwt: true`, así que solo la invoca alguien con sesión del
equipo (el botón "Sincronizar ahora") o el cron con la service role key. Dos
modos en la misma función:

- **backfill** — la primera corrida de una propiedad trae los 16 meses que
  Search Console conserva. Sin esto la línea de tendencia del portal arrancaría
  con un solo punto, que no dice nada.
- **incremental** — las corridas siguientes solo rehacen el mes en curso y el
  anterior. Google reescribe datos hasta 3 días hacia atrás, así que el mes
  anterior se vuelve a pedir hasta que queda firme.

Decisión de diseño: **cada propiedad se procesa aislada**. Si una falla, su
error se escribe en `gsc_properties.last_error` y la función sigue con las
demás. Una propiedad con el permiso revocado no puede frenar la sincronización
de las otras diez.

### Flujo vs. estado

Dos cosas distintas que al principio estaban mezcladas:

- `gsc_monthly` guarda **flujo**: clics e impresiones que ocurrieron dentro de
  un mes. Se suman.
- `gsc_rankings` guarda **estado**: cuántas palabras clave están hoy en el top
  3, 10, 20, 50, medido sobre una ventana móvil de 28 días. No se suma, se
  fotografía. Los rangos son acumulativos (el top 3 incluye el top 1).

Mezclarlas daba números que no significaban nada: "palabras clave de agosto" no
es una cantidad, es una foto de un día.

### La tarjeta del portal

`app/portal/seo-card.tsx`. Regla que la gobierna: **si `estado !== 'ok'` no se
dibuja nada**. No hay estado de error, no hay "no pudimos cargar los datos". El
cliente ve el portal exactamente como antes de esta fase. Una falla de Search
Console no puede ensuciar la vista que le mostramos al cliente.

Qué muestra, en orden de lo que le importa a un cliente:

1. **Clics e impresiones del último mes completo.** El mes en curso nunca es el
   titular: está a medio llenar y siempre se vería como una caída.
2. **Línea de tendencia**, armada solo con meses completos, con una marca
   punteada en el mes de inicio del proyecto. Eso importa: la propiedad de GSC
   cubre el dominio entero, así que el historial incluye tráfico anterior a la
   contratación. Sin la marca nos estaríamos colgando medallas ajenas.
3. **Palabras clave por rango**, con el delta contra la foto de hace ~90 días.
4. **CTR y posición media** abajo y en chico. Son diagnóstico, no resultado.

El CSS (`.pt-seo*`) es mobile-first y **sin `!important`**, igual que el resto
del portal.

### Pantalla de administración

`/projects/<id>/seo`, con enlace desde el chip "Search Console" en la cabecera
del proyecto (solo en proyectos de tipo SEO y con cliente asignado).

La propiedad se escribe a mano en vez de elegirla de una lista. No es pereza: la
app tendría que poder leer el refresh token de la agencia para listar las
propiedades, y ese token vive en Vault justamente para que la app no lo toque.
El precio es un campo de texto; la primera sincronización dice con precisión si
está mal ("Sin permiso sobre X", "La propiedad X no existe").

### Falta

- El `pg_cron` diario. **Lo tiene que crear Oscar desde el panel de Supabase**:
  necesita la service role key en el header, y yo ni la tengo ni la debo pedir.
- Vincular la propiedad de cada cliente y correr la primera sincronización.

---

## 2026-09-15 · Tres errores en la primera conexión real

La Fase 14 estaba escrita y compilaba, pero nada había pasado por la cadena
completa. Al conectarla de verdad aparecieron tres errores en fila. Los tres
tenían la misma raíz, y por eso quedan documentados juntos.

### 1. "Google autorizó, pero no se pudo guardar la conexión"

**Causa:** había dos versiones de `google_oauth_guardar` en la base — la vieja
de 2 argumentos y la nueva de 4. Cuando amplié la función no borré la
anterior. Dos funciones con el mismo nombre y parámetros con valor por defecto
hacen que PostgREST no pueda elegir candidato y rechace la llamada.

**Arreglo:** `drop function` de la sobrecarga vieja.

### 2. "Sin permiso sobre sc-domain:stevia.com.co"

**Causa:** esa propiedad no existía. La cuenta tenía `https://stevia.com.co/`,
que es una propiedad de prefijo de URL, no de dominio. Para Google son dos
propiedades distintas, y pedir una inexistente teniendo otras del mismo dominio
devuelve 403, no 404.

**Arreglo de fondo — y acá había una decisión de diseño mal argumentada:** el
código decía que la app no podía listar las propiedades porque eso obligaría a
darle acceso al refresh token de la agencia. Era falso. La Edge Function ya
tiene las credenciales y corre fuera de la app: siempre pudo devolver la lista.
Se le estaba pidiendo a una persona un dato que el sistema podía averiguar
solo. Ahora la pantalla tiene un selector (`mode: "diagnostico"` → `sites.list`)
y el campo de texto libre quedó solo como respaldo.

### 3. "Unexpected end of JSON input"

**Causa:** `gsc_guardar_sync` devuelve `void`, y PostgREST contesta esas
llamadas con **204 No Content, sin cuerpo**. El código hacía `.json()` sobre
esa respuesta vacía.

**Lo grave no es el bug, es cuándo ocurría:** DESPUÉS de que la escritura ya se
había hecho. Los 16 meses quedaban guardados y la pantalla mostraba rojo. Es el
error que empuja a apretar el botón de nuevo para arreglar algo que ya estaba
bien.

**Arreglo:** se lee como texto y solo se parsea si hay algo que parsear. La
misma protección se aplicó a todas las demás lecturas de la función, que
tenían el mismo patrón esperando su turno.

### La raíz común

Los tres se diagnosticaron lento por el mismo motivo: **el código se tragaba el
mensaje de error real y lo reemplazaba por una suposición mía**. El callback
decía "intentá de nuevo" en vez del error de Postgres. La Edge Function mapeaba
*cualquier* 403 de Google a "sin permiso", cuando 403 también significa "la API
no está habilitada" o "cuota agotada", que se arreglan en otro lado.

Un mensaje de error escrito para tranquilizar al usuario, que oculta el
diagnóstico, cuesta más tiempo del que ahorra. Ahora los dos lugares muestran
el motivo real: el callback incluye código y mensaje de Postgres, y la Edge
Function distingue los tres 403 y, cuando el problema es la propiedad, adjunta
la lista de las que la cuenta sí ve.

### Verificación

Vitaliah (`https://stevia.com.co/`) y HunterX (`https://www.hunterx.com.co/`)
trajeron 16 meses cada una. Vitaliah: 23.599 clics acumulados, 3.932 palabras
clave, 1.450 en top 3.

### Comparación interanual (migración 003)

Con datos reales a la vista se hizo evidente que el titular "2.700 clics" no le
dice nada a un cliente sin un punto de comparación. La comparación obvia sería
contra el mes anterior, y habría sido un error:

- agosto vs. julio 2026 (2.810) → **–4 %**, parece una caída
- agosto vs. agosto 2025 (1.409) → **+92 %**, que es lo que pasó

El tráfico de búsqueda es estacional. Comparar meses consecutivos hace que la
estacionalidad se lea como resultado del trabajo — y en diciembre, como fracaso
del trabajo. `portal_seo` ahora compara siempre contra el mismo mes del año
anterior, y omite la comparación si no hay un año de historial completo.

### Aviso en el panel

`app/components/seo-health.tsx`. El portal del cliente nunca muestra un error
— correcto de cara al cliente, peligroso de cara al equipo: un refresh token
revocado puede pasar semanas sin que nadie lo note. El aviso es la contraparte,
en la pantalla que el equipo abre todos los días. Si todo está bien no dibuja
nada: un cartel verde permanente de "todo OK" enseña a ignorar esa zona.

### Logo del portal

`public/kickranking-blanco-verde.png` en la barra, la puerta de contraseña y la
página de "necesitás tu enlace". En ese archivo la palabra *RANKING* es blanca,
así que el logo tuvo que salir de la tarjeta blanca de la puerta y subir al
fondo oscuro; adentro se perdía media marca. El tamaño lo manda el alto y el
ancho se deduce, para que no se deforme si mañana cambia el archivo.

> Verdes exactos del logo, por si hacen falta: `#00DE00` (principal, matiz 120°,
> 9,8:1 sobre el fondo oscuro de la barra) y `#35EC00` (la cuña clara sobre la
> C). **Ninguno sirve como color primario sobre blanco**: 1,8:1 y 1,6:1, muy por
> debajo de 4,5:1. Para eso siguen `--brand-600` (`#0a8452`, 4,7:1) y
> `--brand-500`.
