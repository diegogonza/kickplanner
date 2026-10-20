-- Endurecimiento de las conexiones MCP (ver code review del 2026-09-08):
--   1) last_used_at deja de escribirse en cada peticion (throttle de 5 minutos)
--   2) tope de 10 conexiones vivas por persona

create or replace function public.mcp_resolve_connection(p_token_hash text)
returns table (connection_id uuid, user_id uuid, refresh_token_enc text)
language plpgsql security definer set search_path = public as $$
begin
  update public.mcp_connections
  set last_used_at = now()
  where token_hash = p_token_hash
    and (last_used_at is null or last_used_at < now() - interval '5 minutes');

  return query
  select c.id, c.user_id, s.refresh_token_enc
  from public.mcp_connections c
  join public.mcp_connection_secrets s on s.connection_id = c.id
  where c.token_hash = p_token_hash;
end $$;

create or replace function public.mcp_create_connection(
  p_name text,
  p_token_hash text,
  p_token_prefix text,
  p_refresh_token_enc text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total int;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select count(*) into v_total from public.mcp_connections where user_id = auth.uid();
  if v_total >= 10 then
    raise exception 'Llegaste al limite de 10 conexiones. Desconecta alguna antes de crear otra.';
  end if;

  insert into public.mcp_connections (user_id, name, token_hash, token_prefix)
  values (auth.uid(), coalesce(nullif(btrim(p_name), ''), 'Claude'), p_token_hash, p_token_prefix)
  returning id into v_id;

  insert into public.mcp_connection_secrets (connection_id, refresh_token_enc)
  values (v_id, p_refresh_token_enc);

  return v_id;
end $$;

grant execute on function public.mcp_resolve_connection(text) to anon, authenticated;
revoke all on function public.mcp_create_connection(text, text, text, text) from public, anon;
grant execute on function public.mcp_create_connection(text, text, text, text) to authenticated;
