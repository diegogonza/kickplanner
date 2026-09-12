-- Conexiones MCP por miembro: cada persona genera su propio token desde /ajustes
-- y el servidor MCP actua con SU identidad (mismas RLS que en la interfaz).

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Claude',
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- El refresh token vive aparte: RLS activo y SIN politicas, de modo que solo es
-- accesible desde las funciones security definer de abajo.
create table if not exists public.mcp_connection_secrets (
  connection_id uuid primary key references public.mcp_connections(id) on delete cascade,
  refresh_token_enc text not null,
  updated_at timestamptz not null default now()
);

alter table public.mcp_connections enable row level security;
alter table public.mcp_connection_secrets enable row level security;

drop policy if exists "ver mis conexiones mcp" on public.mcp_connections;
create policy "ver mis conexiones mcp" on public.mcp_connections
  for select using (user_id = auth.uid());

-- Alta: la llama el usuario logueado desde /ajustes
create or replace function public.mcp_create_connection(
  p_name text,
  p_token_hash text,
  p_token_prefix text,
  p_refresh_token_enc text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.mcp_connections (user_id, name, token_hash, token_prefix)
  values (auth.uid(), coalesce(nullif(btrim(p_name), ''), 'Claude'), p_token_hash, p_token_prefix)
  returning id into v_id;

  insert into public.mcp_connection_secrets (connection_id, refresh_token_enc)
  values (v_id, p_refresh_token_enc);

  return v_id;
end $$;

-- Baja: solo el dueno puede desconectar
create or replace function public.mcp_revoke_connection(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.mcp_connections
  where id = p_id and user_id = auth.uid();
end $$;

-- Resolucion del token en cada peticion MCP. Recibe el hash, nunca el token.
create or replace function public.mcp_resolve_connection(p_token_hash text)
returns table (connection_id uuid, user_id uuid, refresh_token_enc text)
language plpgsql security definer set search_path = public as $$
begin
  update public.mcp_connections set last_used_at = now() where token_hash = p_token_hash;

  return query
  select c.id, c.user_id, s.refresh_token_enc
  from public.mcp_connections c
  join public.mcp_connection_secrets s on s.connection_id = c.id
  where c.token_hash = p_token_hash;
end $$;

-- Guarda el refresh token rotado tras cada renovacion
create or replace function public.mcp_store_refresh(p_token_hash text, p_refresh_token_enc text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.mcp_connection_secrets s
  set refresh_token_enc = p_refresh_token_enc, updated_at = now()
  from public.mcp_connections c
  where c.id = s.connection_id and c.token_hash = p_token_hash;
end $$;

revoke all on function public.mcp_create_connection(text, text, text, text) from public, anon;
grant execute on function public.mcp_create_connection(text, text, text, text) to authenticated;

revoke all on function public.mcp_revoke_connection(uuid) from public, anon;
grant execute on function public.mcp_revoke_connection(uuid) to authenticated;

-- El endpoint MCP llama con la anon key: necesita anon
grant execute on function public.mcp_resolve_connection(text) to anon, authenticated;
grant execute on function public.mcp_store_refresh(text, text) to anon, authenticated;
