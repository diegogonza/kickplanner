-- 010 · Detalle de palabras clave para el portal del cliente.
--
-- Alimenta el desplegable de las tarjetas "Top 3 / Top 10 / Top 20 / Top 50".
-- Mismo contrato que el resto de las portal_*: exige un token de sesión válido,
-- resuelve el cliente con portal_session_client() y nunca lanza un error hacia
-- la interfaz.
--
-- OJO con los números: las tarjetas cuentan desde gsc_rankings (ventana de 28
-- días, el total real que informa Google) mientras que gsc_keywords guarda solo
-- las ~1000 filas que devuelve la API por página, y de UN mes. Por eso esta
-- función devuelve EJEMPLOS ordenados por clics y no promete completitud: la
-- interfaz no debe mostrar un conteo acá, porque no coincidiría con la tarjeta.
--
-- NOTA: la versión vigente de esta función es la de 011, que corrige el filtro
-- a bandas exclusivas. Este archivo queda como registro histórico.
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
begin
  if p_tope is null or p_tope not in (3, 10, 20, 50) then
    return null;
  end if;
  v_lim := least(greatest(coalesce(p_limite, 40), 1), 100);

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
    return null;
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
      and position <= p_tope
    order by clicks desc, impressions desc, query
    limit v_lim
  ) k;

  return jsonb_build_object(
    'estado', 'ok',
    'mes',    to_char(v_mes, 'YYYY-MM'),
    'tope',   p_tope,
    'filas',  v_filas
  );
exception when others then
  return jsonb_build_object('estado', 'sin_datos');
end $$;

grant execute on function public.portal_keywords(text, uuid, int, int)
  to anon, authenticated, service_role;
