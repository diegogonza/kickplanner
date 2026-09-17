-- 009 — portal_login: 2 intentos y 40 minutos de bloqueo.
--
-- Antes: 8 intentos, 15 minutos. Decisión de Oscar endurecerlo.
--
-- Consecuencia asumida: con 2 intentos, un cliente que se equivoca dos veces
-- queda afuera 40 minutos. Va a pasar. Por eso esta migración trae también la
-- función de desbloqueo y un cambio en el mensaje de la puerta.

create or replace function public.portal_login(p_slug text, p_password text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare a public.portal_access; tok text;
begin
  select * into a from portal_access where slug = lower(trim(p_slug));
  if a.client_id is null or not a.enabled then return null; end if;
  if a.locked_until is not null and a.locked_until > now() then return null; end if;

  if a.password_hash <> extensions.crypt(coalesce(p_password,''), a.password_hash) then
    update portal_access set
      failed_attempts = a.failed_attempts + 1,
      locked_until = case when a.failed_attempts + 1 >= 2
                          then now() + interval '40 minutes' else null end
    where client_id = a.client_id;
    return null;
  end if;

  update portal_access set failed_attempts = 0, locked_until = null
    where client_id = a.client_id;

  delete from portal_sessions where expires_at < now();
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into portal_sessions (token, client_id) values (tok, a.client_id);
  return tok;
end $function$;

-- Desbloqueo manual. Sin esto, con 2 intentos el equipo tendría que entrar a
-- la base a mano cada vez que un cliente se equivoca dos veces.
create or replace function public.portal_desbloquear(p_slug text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;

  update portal_access
  set failed_attempts = 0, locked_until = null
  where slug = lower(trim(p_slug))
  returning true into v_ok;

  return coalesce(v_ok, false);
end $function$;

revoke execute on function public.portal_desbloquear(text) from public, anon;
grant  execute on function public.portal_desbloquear(text) to authenticated, service_role;

-- Nota sobre el mensaje de error de la puerta: portal_login devuelve NULL
-- tanto si la contraseña está mal como si el acceso está bloqueado, así que la
-- pantalla no puede distinguir los dos casos. Con 8 intentos eso daba igual;
-- con 2, un cliente bloqueado vería "contraseña incorrecta" durante 40 minutos
-- sin entender por qué. El texto de la puerta ahora menciona el bloqueo.
