-- 003 — portal_seo(): comparación interanual en el titular de clics.
--
-- Por qué interanual y no contra el mes anterior: el tráfico de búsqueda es
-- estacional. Diciembre cae y julio sube en casi cualquier sitio, sin que nadie
-- haya hecho nada. Comparar meses consecutivos hace que la estacionalidad se
-- lea como resultado del trabajo — y en diciembre, como fracaso del trabajo.
--
-- Caso real que lo motivó (Vitaliah, agosto 2026):
--   vs. julio 2026 (2.810 clics) → -4 %, parece una caída
--   vs. agosto 2025 (1.409 clics) → +92 %, que es lo que de verdad pasó
--
-- La comparación se omite si no hay un año de historial completo o si el mes
-- de referencia tiene 0 clics (ni división por cero ni "+∞ %").

create or replace function public.portal_seo(p_token text, p_project_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_client uuid;
  v_proj   record;
  v_prop   record;
  v_mes    record;
  v_ano    record;
  v_rank   record;
  v_prev   record;
  v_serie  jsonb;
  v_comp   jsonb := null;
begin
  v_client := public.portal_session_client(p_token);
  if v_client is null then
    return null;                        -- sesión inválida: el portal ya lo maneja
  end if;

  select p.id, p.type, p.start_date into v_proj
  from projects p
  where p.id = p_project_id and p.client_id = v_client;

  if v_proj.id is null then
    return null;                        -- proyecto ajeno
  end if;

  -- Los proyectos web conservan el porcentaje de avance; no llevan esta tarjeta.
  if v_proj.type is distinct from 'seo' then
    return jsonb_build_object('estado', 'sin_propiedad');
  end if;

  select * into v_prop from gsc_properties where project_id = p_project_id;
  if v_prop.project_id is null then
    return jsonb_build_object('estado', 'sin_propiedad');
  end if;

  -- Último mes COMPLETO. El mes en curso siempre se ve peor porque está a
  -- medio llenar, así que no es el que se muestra.
  select * into v_mes
  from gsc_monthly
  where project_id = p_project_id and not partial
  order by month desc
  limit 1;

  if v_mes.month is null then
    return jsonb_build_object(
      'estado', 'sin_datos',
      'desactualizado', false,
      'ultima_sync', v_prop.last_sync_at
    );
  end if;

  select * into v_ano
  from gsc_monthly
  where project_id = p_project_id
    and month = v_mes.month - interval '1 year'
    and not partial;

  if v_ano.month is not null and v_ano.clicks > 0 then
    v_comp := jsonb_build_object(
      'periodo', to_char(v_ano.month, 'YYYY-MM'),
      'clics',   v_ano.clicks,
      'variacion', round((v_mes.clicks - v_ano.clicks)::numeric * 100 / v_ano.clicks)
    );
  end if;

  -- Serie mensual para la línea de tendencia, en orden cronológico.
  select coalesce(jsonb_agg(jsonb_build_object(
           'mes', to_char(m.month, 'YYYY-MM'),
           'clics', m.clicks,
           'parcial', m.partial
         ) order by m.month), '[]'::jsonb)
  into v_serie
  from gsc_monthly m
  where m.project_id = p_project_id;

  -- Estado de posiciones: la foto más reciente, y la de hace ~90 días para
  -- poder decir "eran 32 hace tres meses". Si no existe, no se compara.
  select * into v_rank
  from gsc_rankings
  where project_id = p_project_id
  order by as_of desc
  limit 1;

  select * into v_prev
  from gsc_rankings
  where project_id = p_project_id and as_of <= (current_date - 90)
  order by as_of desc
  limit 1;

  return jsonb_build_object(
    'estado', 'ok',
    'desactualizado', (v_prop.last_sync_at is null
                       or v_prop.last_sync_at < now() - interval '3 days'),
    'ultima_sync', v_prop.last_sync_at,
    'inicio_proyecto', v_proj.start_date,     -- marca "empezamos acá" en la línea
    'mes', jsonb_build_object(
      'periodo',     to_char(v_mes.month, 'YYYY-MM'),
      'clics',       v_mes.clicks,
      'impresiones', v_mes.impressions,
      'posicion',    v_mes.position,
      -- CTR se calcula acá, no se guarda: así no puede desincronizarse.
      'ctr', case when v_mes.impressions > 0
                  then round(v_mes.clicks::numeric * 100 / v_mes.impressions, 1)
                  else null end
    ),
    'comparacion', v_comp,
    'serie', v_serie,
    'posiciones', case when v_rank.as_of is null then null else jsonb_build_object(
      'al_dia',  v_rank.as_of,
      'ventana', v_rank.window_days,
      'total',   v_rank.kw_total,
      'top1',    v_rank.kw_top1,  'top3',  v_rank.kw_top3,
      'top5',    v_rank.kw_top5,  'top10', v_rank.kw_top10,
      'top20',   v_rank.kw_top20, 'top50', v_rank.kw_top50
    ) end,
    'posiciones_antes', case when v_prev.as_of is null then null else jsonb_build_object(
      'al_dia', v_prev.as_of,
      'top3',   v_prev.kw_top3, 'top10', v_prev.kw_top10,
      'top20',  v_prev.kw_top20, 'top50', v_prev.kw_top50
    ) end
  );
exception when others then
  -- Pase lo que pase acá adentro, la interfaz recibe algo que sabe dibujar.
  return jsonb_build_object('estado', 'sin_datos', 'desactualizado', true);
end $function$;
