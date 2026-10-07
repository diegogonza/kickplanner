-- 018 · Gestión de roles desde /admin
--
-- La política de profiles solo deja editar el perfil propio, así que un admin
-- no puede cambiar el rol de otro miembro con un UPDATE directo. Esta función
-- (SECURITY DEFINER) lo permite solo a administradores y protege que el
-- espacio de trabajo nunca se quede sin ningún admin.
-- El trigger profiles_guard_role sigue vigente: auth.uid() es el del admin
-- que llama, así que is_admin() da true y deja pasar el cambio.

create or replace function public.set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actual text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Rol no válido: %', p_role;
  end if;

  select role into v_actual from profiles where id = p_user_id for update;
  if not found then
    raise exception 'El miembro no existe';
  end if;

  if v_actual = p_role then
    return;
  end if;

  -- Quitar admin: tiene que quedar al menos otro administrador.
  if v_actual = 'admin' and p_role <> 'admin'
     and (select count(*) from profiles where role = 'admin' and id <> p_user_id) = 0 then
    raise exception 'Debe quedar al menos un administrador';
  end if;

  update profiles set role = p_role, updated_at = now() where id = p_user_id;
end;
$$;

revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
