-- 005 — Fase 1 del PLAN-DATOS-CLIENTES: cada proyecto con su cliente.
--
-- Contexto: 23 de 28 proyectos no tenían cliente. La identidad del cliente
-- vivía en el nombre del proyecto. Se cargaron desde la planilla comercial
-- de la agencia (15/09/2026).
--
-- Resultado: 28 clientes, 28 proyectos, cero huérfanos.

-- ---------------------------------------------------------------------------
-- Esquema: la planilla traía contacto, email, nivel comercial y forma de cobro
-- y la tabla no tenía dónde guardarlos. Cuatro columnas opcionales, sin efecto
-- sobre ninguna pantalla existente.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists contact_name  text,
  add column if not exists contact_email text,
  add column if not exists tier          text,
  add column if not exists billing_code  text;

comment on column public.clients.tier is
  'Nivel comercial tal como lo lleva la agencia: Premium / Estandar / Basico.';
comment on column public.clients.billing_code is
  'Forma de cobro tal como figura en la planilla: FE / CC / LP. Sin traducir.';

-- ---------------------------------------------------------------------------
-- Criterios aplicados en la carga de datos
-- ---------------------------------------------------------------------------
-- 1. El nombre del cliente es el de la PLANILLA, no el del proyecto. Por eso
--    el cliente "Abogado Francisco" tiene el proyecto "Abogado Tarquino", y
--    "Econorte" tiene "Econorte Cucuta".
--
-- 2. NUNCA se pisó un dato existente. Donde la app y la planilla difieren,
--    quedó el valor de la app y la diferencia se reportó. Solo se rellenaron
--    campos vacíos (url, start_date).
--
-- 3. El cliente "Santiago" (creado a mano el 15/09) se RENOMBRÓ a "Grupo Myc":
--    Santiago Ramos es el contacto, no el cliente. Se renombró en vez de crear
--    una ficha nueva para conservar el vínculo con el proyecto.
--
-- 4. Fechas de la planilla en formato mixto. "01/30/2026" y "07/30/2026" son
--    MM/DD (no existe el mes 30); el resto es DD/MM. "09/04/2026" es
--    genuinamente ambiguo y se dejó VACÍO en vez de adivinar.
--
-- 5. "En craeación" no es una URL: esos proyectos quedaron sin url.
--
-- 6. Cuatro proyectos NO figuran en la planilla comercial y se les creó ficha
--    con el nombre del proyecto, sin datos comerciales:
--       Bancomed (USD 935), Bernalo (COP 4.500.000),
--       Buda de los Negocios (USD 1.300), Santigo (COP 2.500.000)
--    Mónica Cruz tampoco está en la planilla.
--
-- 7. Los contactos múltiples ("Ricardo Castaño, Maria Te") se guardaron
--    verbatim en un solo campo. Separarlos exige una tabla de contactos.

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- select count(*) filter (where client_id is null) from projects;  --> 0
