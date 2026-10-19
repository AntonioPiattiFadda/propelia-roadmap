-- El apellido de cada miembro (19/10/2026), como el `last_name` de los usuarios del producto.
-- `nombre` sigue siendo el corto de los avatares y las pastillas («Lorenzo»); esto es lo que
-- falta para el nombre completo. Nullable porque no todos los que ya existen lo tienen; a las
-- altas nuevas se lo exige la edge function `crear-miembro`, no la base.
alter table public.users
  add column if not exists last_name text;

-- El front no escribe `users` (no hay policies de escritura): el apellido se cambia por acá.
-- Solo SUPERADMIN, sobre cualquiera, inactivos incluidos. Vacío lo borra.
create or replace function public.crm_set_member_last_name(
  p_user_id   uuid,
  p_last_name text
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_last_name text := nullif(btrim(coalesce(p_last_name, '')), '');
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_last_name_superadmin_only';
  end if;
  update public.users set last_name = v_last_name, updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'crm_member_not_found';
  end if;
end;
$$;

revoke execute on function public.crm_set_member_last_name(uuid, text) from public, anon;
grant execute on function public.crm_set_member_last_name(uuid, text) to authenticated;

-- Los que se saben (19/10/2026). Por email y sin pisar lo que ya tenga.
update public.users set last_name = 'Piatti Fadda'
 where email in ('antonio.piattifadda@gmail.com', 'lorenzopiattifadda@gmail.com') and last_name is null;
-- Lusmary Rojas Gil: estaba cargada como «lus», en minúscula y a medias.
update public.users set nombre = 'Lusmary', last_name = 'Rojas Gil'
 where email = 'lus@propelia.es' and last_name is null;
