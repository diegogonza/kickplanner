-- 011 · Arregla el desplegable de palabras clave: mostraba lo mismo en los
-- cuatro rangos.
--
-- El bug: las tarjetas son ACUMULADAS (Top 10 incluye al Top 3, Top 20 incluye
-- al Top 10…) y la consulta filtraba igual, con `position <= p_tope`, ordenando
-- por clics. Como las palabras con más clics son justamente las mejor
-- posicionadas, las primeras 40 filas de "Top 10", "Top 20" y "Top 50" eran las
-- mismas 40 de "Top 3". Cuatro listas idénticas.
--
-- La corrección: al abrir una tarjeta se muestra su BANDA EXCLUSIVA
-- (Top 10 → posiciones 4 a 10, Top 20 → 11 a 20, Top 50 → 21 a 50), y la
-- función devuelve los límites para que la interfaz diga exactamente qué está
-- mostrando. El número de la tarjeta sigue siendo el acumulado, que es el
-- estándar con el que se leen estos informes.
create or replace function public.portal_keywords(
  p_token      text,
  p_project_id uuid,
  p_tope       int,
  p_limite     int default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_client uuid;
  v_proj   uuid;
  v_mes    date;
  v_filas  jsonb;
  v_lim    int;
  v_desde  numeric;   -- límite inferior EXCLUSIVO de la banda
begin
  -- Sólo los cortes que dibuja la tarjeta. Evita que alguien pida p_tope=1000
  -- y se lleve la lista entera de palabras clave del cliente.
  if p_tope is null or p_tope not in (3, 10, 20, 50) then
    return null;
  end if;
  v_lim := least(greatest(coalesce(p_limite, 40), 1), 100);

  v_desde := case p_tope
               when 3  then 0
               when 10 then 3
               when 20 then 10
               else 20
             end;

  v_client := public.portal_session_client(p_token);
  if v_client is null then
    return null;
  end if;

  select p.id into v_proj
  from projects p
  where p.id = p_project_id
    and p.client_id = v_client
    and p.type = 'seo';

  if v_proj is null then
    return null;                        -- proyecto ajeno o no es de SEO
  end if;

  select max(month) into v_mes
  from gsc_keywords
  where project_id = p_project_id;

  if v_mes is null then
    return jsonb_build_object('estado', 'sin_datos');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'query',       k.query,
           'clics',       k.clicks,
           'impresiones', k.impressions,
           'posicion',    round(k.position, 1)
         )), '[]'::jsonb)
  into v_filas
  from (
    select query, clicks, impressions, position
    from gsc_keywords
    where project_id = p_project_id
      and month = v_mes
      and position >  v_desde
      and position <= p_tope
    order by clicks desc, impressions desc, query
    limit v_lim
  ) k;

  return jsonb_build_object(
    'estado', 'ok',
    'mes',    to_char(v_mes, 'YYYY-MM'),
    'tope',   p_tope,
    -- Primera posición de la banda, ya en el número que se le muestra a la
    -- persona: 0 → 1, 3 → 4, 10 → 11, 20 → 21.
    'desde',  (v_desde + 1)::int,
    'hasta',  p_tope,
    'filas',  v_filas
  );
exception when others then
  return jsonb_build_object('estado', 'sin_datos');
end $$;

grant execute on function public.portal_keywords(text, uuid, int, int)
  to anon, authenticated, service_role;
