# Integración con Google Search Console

> Plan de acción, **v2**. Fase 14 de KickPlanner · complementa `PLAN-PORTAL-CLIENTES.md`.
> Fecha: 2026-09-15 · El registro de cambios v1 → v2 está al final.

---

## 0. Qué construimos

Un job diario trae de Search Console los datos de cada proyecto SEO, los guarda
en la base, y el portal del cliente muestra una tarjeta de resultados que se
actualiza sola.

| Decisión | Elección |
|---|---|
| Ingesta | Supabase Edge Function + `pg_cron` + `pg_net` |
| Autorización | OAuth con la cuenta de Google de la agencia |
| Métricas | Clics · Impresiones · CTR · Posición media · Palabras clave por rango |

---

## 1. Principios

**No se consulta GSC cuando el cliente abre la página.** El job escribe en
Postgres; el portal lee de Postgres. La API tarda segundos, tiene cuota diaria, y
**los datos de GSC salen con 2-3 días de retraso**: "en vivo" no existe. Si Google
falla, el portal sigue con el último dato bueno.

**Flujo y estado se miden distinto, y por eso van en tablas distintas.**

- *Flujo*: clics e impresiones se acumulan a lo largo de un período. El mes
  calendario es la unidad correcta.
- *Estado*: la posición en el buscador es una foto del momento. Medirla sobre un
  mes entero la promedia y la deforma.

Confundir las dos es el error que tenía la v1 (ver el punto 1 del registro de
cambios). Van en `gsc_monthly` y `gsc_rankings` respectivamente.

**El portal muestra el último mes COMPLETO.** El mes en curso, con medio mes de
datos, siempre se ve peor que el anterior — todos los meses, hasta el día 28. Si
se muestra, va rotulado como parcial.

**Ningún dato viejo se presenta como fresco.** La tarjeta siempre dice a qué
fecha corresponde.

---

## 2. Lo que hace falta antes de programar

### 2.1 Cliente OAuth en Google Cloud *(trámite manual, una vez)*

1. Crear o reusar un proyecto en Google Cloud Console.
2. Habilitar la **Google Search Console API**.
3. Credenciales → **ID de cliente de OAuth** → *Aplicación web*.
4. URI de redirección: `<dominio>/api/google/callback` y
   `http://localhost:3000/api/google/callback`.
5. Guardar *client ID* y *client secret*.

Ámbito: `https://www.googleapis.com/auth/webmasters.readonly` — solo lectura.

> **Publicar la app.** En modo "en pruebas" el token de refresco caduca a los 7
> días y la conexión se cae todas las semanas. Publicarla no requiere
> verificación de Google si el único usuario es la cuenta de la agencia.
> Conviene confirmar este comportamiento en la consola antes de dar por hecho el
> plazo: Google lo ha cambiado más de una vez.

### 2.2 Extensiones de Postgres

**Verificado el 2026-09-15: `pg_cron` y `pg_net` están disponibles pero NO
instaladas** en el proyecto. Hay que habilitarlas antes de escribir la ingesta.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

`pg_cron` ejecuta SQL, no HTTP: `pg_net` es lo que le permite disparar la Edge
Function. Sin las dos, el diseño de la ingesta no se sostiene.

---

## 3. Modelo de datos

```sql
-- Credenciales de la agencia. Una sola fila.
-- El refresh token va en Supabase Vault, nunca en texto plano.
create table public.google_oauth (
  id           int primary key default 1 check (id = 1),
  secret_id    uuid not null,        -- referencia a vault.secrets
  email        text,
  connected_at timestamptz default now()
);

-- Qué propiedad de GSC corresponde a cada proyecto.
create table public.gsc_properties (
  project_id    uuid primary key references public.projects(id) on delete cascade,
  site_url      text not null,       -- 'sc-domain:stevia.com.co'
  backfilled_at timestamptz,         -- null = falta la carga histórica
  last_sync_at  timestamptz,
  last_error    text
);

-- FLUJO: totales por mes. Alimenta la línea de tendencia.
-- No se guarda CTR: es clicks/impressions y guardarlo invita a que se
-- desincronice con sus propios componentes.
create table public.gsc_monthly (
  project_id  uuid references public.projects(id) on delete cascade,
  month       date not null,               -- primer día del mes
  clicks      int not null default 0,
  impressions int not null default 0,
  position    numeric(6,2),
  partial     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (project_id, month)
);

-- ESTADO: foto de posiciones sobre una ventana móvil de 28 días.
-- Una fila por día. 4 clientes = ~1.500 filas al año, nada.
-- Guardar el histórico diario permite decir "eran 32 hace tres meses".
create table public.gsc_rankings (
  project_id  uuid references public.projects(id) on delete cascade,
  as_of       date not null,               -- último día de la ventana
  window_days int  not null default 28,
  kw_total    int, kw_top1 int, kw_top3 int, kw_top5 int,
  kw_top10    int, kw_top20 int, kw_top50 int,
  primary key (project_id, as_of)
);

-- DETALLE: palabras clave del último mes completo, acotado.
-- Alimenta el reporte mensual, no el portal.
create table public.gsc_keywords (
  project_id  uuid references public.projects(id) on delete cascade,
  month       date not null,
  query       text not null,
  clicks      int, impressions int, position numeric(6,2),
  primary key (project_id, month, query)
);
```

RLS: las cuatro tablas solo para `authenticated`. El portal no las lee directo —
va por `portal_seo(p_token, p_project_id)`, que resuelve el cliente desde su
sesión igual que el resto.

**Los rangos son acumulativos:** top 3 incluye top 1, top 10 incluye top 3. Con
bandas excluyentes, una palabra que sube de la posición 4 a la 2 haría *bajar* el
contador de su banda vieja — justo la confusión que queremos evitar.

**Retención de `gsc_keywords`: 12 meses.** Sin política, la tabla crece sin
techo: un sitio mediano son miles de queries por mes. Además se guardan solo las
**1.000 con más impresiones** de cada mes; los conteos por rango se calculan
durante la ingesta y no necesitan que el detalle esté persistido.

---

## 4. El job de ingesta

Edge Function `gsc-sync`, disparada por `pg_cron` vía `pg_net` una vez al día.
Autentica contra Postgres con la service role key guardada en los secretos de la
función — es la única forma de escribir desde afuera, y por eso la función no
recibe nada del exterior: solo la dispara el cron.

### 4.1 Modo incremental *(diario)*

Por cada fila de `gsc_properties` con `backfilled_at` no nulo:

1. Canjear el refresh token por un access token.
2. **Flujo** — mes en curso y mes anterior, sin dimensiones → clics,
   impresiones, posición. `upsert` en `gsc_monthly`, marcando `partial` en el mes
   en curso.
   *Se re-consultan dos meses porque GSC completa datos hasta ~2 semanas después;
   traer solo el mes actual dejaría el anterior incompleto para siempre.*
3. **Estado** — ventana de 28 días terminando ayer, con dimensión `query` →
   contar palabras por rango de posición. `upsert` en `gsc_rankings`.
4. **Detalle** — solo si cambió el último mes completo: top 1.000 queries por
   impresiones → `gsc_keywords`.
5. Escribir `last_sync_at`, o `last_error` si algo falló.

### 4.2 Modo backfill *(una vez, al conectar una propiedad)*

Sin esto, el primer día la línea de tendencia tendría **dos puntos** — y la línea
es el centro de la tarjeta.

GSC conserva **16 meses**. Al vincular una propiedad se dispara una corrida que
trae mes por mes ese rango completo hacia `gsc_monthly`, y al terminar escribe
`backfilled_at`. Para Vitaliah la línea nace con todo el historial disponible.

`gsc_rankings` no se rellena hacia atrás: la API no permite reconstruir ventanas
móviles del pasado sin una consulta por día. La comparación "hace tres meses"
empieza a existir tres meses después de conectar. Es una limitación, no un error;
conviene saberla antes de prometerla.

### 4.3 Cuota y fallos

GSC permite 1.200 consultas por minuto y 30.000 por día. Cuatro clientes en modo
incremental son ~16 llamadas diarias. El backfill de una propiedad son ~16 más,
una sola vez.

**Si falla una propiedad, las demás siguen.** El error queda en `last_error` y el
portal muestra el último dato bueno.

---

## 5. Monitoreo

La v1 guardaba `last_error` y `last_sync_at` y ahí terminaba: **tenía los datos
de monitoreo pero no el monitoreo.** Si el token muere un martes, el portal sigue
mostrando agosto en silencio y el cliente lo lee como actual.

**Para el cliente:** la tarjeta siempre rotula el período del dato. Si
`last_sync_at` tiene más de 3 días, lo dice explícito —
*"Datos actualizados al 31 de agosto"*— en vez de presentar un número sin fecha.

**Para el equipo:** aviso en `/panel` cuando alguna propiedad lleva más de 3 días
sin sincronizar o tiene `last_error`. Es una consulta y una tarjeta; sin eso,
nadie se entera nunca.

---

## 6. La tarjeta del cliente

Arriba de la tabla de actividades:

```
Resultados en Google                      Agosto 2026

  1.240            18.4K
  Clics            Impresiones

  ▁▂▃▅▄▆▇   ← línea mensual, con marca en "empezamos acá"

  Palabras clave posicionadas          (últimos 28 días)
  Top 3   12     Top 10   45     Top 20   88     Top 50   210
                 eran 32 hace 3 meses

  CTR 6,7%  ·  Posición media 18,4
```

### Por qué esta jerarquía

**Clics e impresiones arriba**, porque son las dos que cualquiera entiende sin
explicación: cuánta gente llegó y cuánta lo vio.

**La línea de meses, no un porcentaje contra el mes anterior.** El tráfico
orgánico es estacional y ruidoso; un "▼12%" en rojo dispara una llamada que
cuesta más de lo que informa. La comparación que sí neutraliza estacionalidad —
contra el mismo mes del año pasado— todavía no se puede hacer: los proyectos no
tienen un año de historia.

**La marca de inicio del proyecto en la línea.** Una propiedad de GSC cubre el
dominio entero, así que el backfill trae tráfico **anterior a la contratación**.
Con 16 meses, Vitaliah vería una línea que arranca nueve meses antes de que
existiera el retainer. Ocultarlo sería recortar el historial; marcarlo convierte
el riesgo en argumento — se ve la pendiente antes y después.

**Las palabras clave por rango son la mejor noticia de la tarjeta.** Es el único
indicador que crece limpio: *"pasamos de 32 a 45 palabras en top 10"* es una
frase que el cliente repite en una reunión. Se calculan sobre los **últimos 28
días**, no sobre el mes, y el rótulo lo dice.

**CTR y posición media abajo, en chico y juntos.** Las dos **empeoran cuando el
proyecto va bien**: al aparecer en búsquedas nuevas de cola larga entran decenas
de palabras en posiciones bajas que arrastran el promedio y diluyen el CTR,
mientras los clics suben. Arriba y en grande, el cliente lee "empeoramos" en el
mes que más creció.

**Proyectos `type = 'web'`: no muestran esta tarjeta.** Conservan el anillo de
porcentaje de avance, que en un alcance cerrado sí significa algo.

---

## 7. Administración (interno)

En la ficha del proyecto, solo para `type = 'seo'`:

- Selector de propiedad de GSC, alimentado por `sites.list` de la API.
- Estado de la última sincronización, el error si hubo, y si el backfill terminó.
- Botón "Sincronizar ahora".

En Ajustes, sección "Google": conectar/desconectar la cuenta y ver con qué correo
quedó conectada.

---

## 8. Beneficio que no es obvio

La skill `kickranking-reporte-seo` hoy se alimenta de un export manual de Search
Console, cliente por cliente, todos los meses. Con `gsc_monthly` y
`gsc_keywords` poblados, **el reporte puede leer de la base** y ese export
desaparece del proceso. No es parte de esta fase, pero es la razón por la que
conviene guardar el detalle de palabras clave y no solo los conteos.

---

## 9. Orden y esfuerzo

| Paso | Entregable | Peso |
|---|---|---|
| 1 | Cliente OAuth en Google Cloud | Trámite tuyo, 15 min |
| 2 | `pg_cron` + `pg_net` + las 4 tablas + RLS + `portal_seo` | Bajo |
| 3 | Flujo OAuth: conectar, guardar en Vault, refrescar | Medio |
| 4 | Edge Function `gsc-sync`, modo incremental | Alto |
| 5 | Modo backfill + vinculación proyecto ↔ propiedad | Medio |
| 6 | Monitoreo: rótulo de frescura + aviso en `/panel` | Bajo |
| 7 | Tarjeta en el portal | Medio |
| 8 | Verificación con datos reales de Vitaliah | Medio |

**Tres días.** El paso 1 es tuyo y bloquea al 3.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El token de refresco caduca a los 7 días | Publicar la app OAuth; confirmar el plazo vigente en la consola |
| Se pierde el acceso a una propiedad | `last_error` + aviso en `/panel` (paso 6) |
| El cliente compara con su Google Analytics y no coincide | Rotular "Clics desde Google", nunca "visitas" |
| El mes en curso se ve como una caída | Mostrar el último mes completo; el actual va marcado como parcial |
| El cliente atribuye a la agencia tráfico anterior | Marca de inicio del proyecto en la línea |
| Dato viejo leído como actual | La tarjeta siempre rotula el período (§5) |
| Un dato de un cliente se filtra a otro | `portal_seo` resuelve el proyecto desde el token de sesión |
| GSC no reporta todas las palabras clave | Limitación de Google: filtra las poco frecuentes. El conteo es un piso, no un total. No prometer exactitud |
| Dos proyectos sobre el mismo dominio muestran lo mismo | Es correcto: la propiedad es el dominio. Documentarlo; si molesta, filtrar por carpeta con `page` como dimensión |

---

## Registro de cambios v1 → v2

**1. Los rangos de palabras clave estaban mal calculados.** La v1 los derivaba de
la posición promedio del mes. GSC promedia ponderando por impresiones, así que
una palabra que estuvo en la 15 tres semanas y saltó a la 2 en la última daba
~11 y se contaba como "top 20" estando en top 3. El sesgo era sistemático y en la
peor dirección: **toda palabra que mejoraba dentro del mes se subestimaba.** Se
separó el estado (`gsc_rankings`, ventana móvil de 28 días, refresco diario) del
flujo (`gsc_monthly`, mes calendario).

**2. Faltaba el backfill.** El job solo re-consultaba los dos últimos meses, así
que el primer día la línea de tendencia —el centro de la tarjeta— habría tenido
dos puntos. Se agregó un modo que trae los 16 meses que GSC conserva.

**3. `pg_cron` y `pg_net` no estaban instalados.** Verificado en la base: están
disponibles pero no habilitados, y toda la ingesta los daba por sentados. Además
`pg_cron` ejecuta SQL, no HTTP: sin `pg_net` no puede disparar la Edge Function.

**4. Había datos de monitoreo pero no monitoreo.** `last_error` no lo mira nadie.
Se agregó el rótulo de frescura de cara al cliente y el aviso en `/panel` para el
equipo.

**5. La propiedad de GSC no es el proyecto.** Cubre el dominio entero, así que el
historial incluye tráfico anterior a la contratación. Se agregó la marca de
inicio en la línea y la nota sobre dos proyectos que comparten dominio.

**6. `gsc_keywords` crecía sin techo.** Guardaba cada palabra de cada mes para
alimentar seis números en pantalla. Ahora: top 1.000 por impresiones, retención
de 12 meses, y los conteos por rango se calculan en la ingesta sin depender del
detalle.

**Menores:** se dejó de guardar `ctr` (es derivable de clics e impresiones y
guardarlo invita a que se desincronice) y se explicitó que los proyectos
`type = 'web'` no muestran esta tarjeta.
