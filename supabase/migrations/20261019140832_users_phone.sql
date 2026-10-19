-- El teléfono de cada miembro (19/10/2026), como el `phone` de los usuarios del producto.
-- Columna aparte de `firma_telefono`: ese es el que va en la firma de los mails, y puede ser el
-- de la oficina. Nullable porque los que ya existen no lo tienen; a las altas nuevas se lo exige
-- la edge function `crear-miembro`, no la base.
alter table public.users
  add column if not exists phone text;

-- El front no escribe `users` (no hay policies de escritura): el teléfono se cambia por acá.
-- Solo SUPERADMIN, sobre cualquiera, inactivos incluidos. Vacío lo borra. Que el número sea
-- válido lo mira el front (libphonenumber); acá solo que tenga dígitos.
create or replace function public.crm_set_member_phone(
  p_user_id  uuid,
  p_phone    text
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_phone_superadmin_only';
  end if;
  if v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) < 6 then
    raise exception 'crm_phone_invalid';
  end if;
  update public.users set phone = v_phone, updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'crm_member_not_found';
  end if;
end;
$$;

revoke execute on function public.crm_set_member_phone(uuid, text) from public, anon;
grant execute on function public.crm_set_member_phone(uuid, text) to authenticated;

-- Los que ya estaban (19/10/2026, por pedido). Por email y sin pisar lo que ya tenga.
update public.users set phone = '+34617754141' where email = 'antonio.piattifadda@gmail.com' and phone is null;
update public.users set phone = '+34675249146' where email = 'lorenzopiattifadda@gmail.com' and phone is null;
update public.users set phone = '+34666789648' where email = 'lus@propelia.es' and phone is null;
