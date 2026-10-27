-- La página pública de alta no deja repetir un teléfono en el equipo (27/10/2026, por pedido).
-- Misma función que `20261027133921_onboarding_alta_publica`, con un corte más después del de los
-- emails: `alta_telefono_repetido`. Los teléfonos ya llegan validados en E.164 (el corte de
-- `alta_miembro_invalido`), así que comparar el texto alcanza.

-- Lo que envía el cliente: valida todo de nuevo (las mismas que tenía el Excel), reemplaza el
-- equipo, guarda nombre y web, cierra el enlace y tilda «Recibir los datos». No crea cuentas: eso
-- sigue siendo «Importar» en /clientes. Errores como claves, igual que el resto del CRM.
create or replace function public.onboarding_alta_enviar(
  p_token uuid, p_company_name text, p_website text, p_miembros jsonb
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
  v_enviado timestamptz;
begin
  select o.id, o.submitted_at into v_id, v_enviado
  from public.client_onboardings o
  join public.crm_leads l on l.id = o.lead_id and l.deleted_at is null
  where o.public_token = p_token and o.completed_at is null
  for update of o;
  if v_id is null then
    raise exception 'alta_no_existe' using errcode = 'P0002';
  end if;
  if v_enviado is not null then
    raise exception 'alta_ya_enviada' using errcode = '22023';
  end if;
  if nullif(btrim(p_company_name), '') is null then
    raise exception 'alta_falta_inmobiliaria' using errcode = '22023';
  end if;
  if jsonb_typeof(p_miembros) <> 'array' or jsonb_array_length(p_miembros) = 0 then
    raise exception 'alta_sin_miembros' using errcode = '22023';
  end if;
  if jsonb_array_length(p_miembros) > 100 then
    raise exception 'alta_demasiados_miembros' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_miembros) m
      where coalesce((m->>'is_owner')::boolean, false)) <> 1 then
    raise exception 'alta_un_responsable' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_miembros) m
             where coalesce((m->>'is_owner')::boolean, false) and m->>'role' is distinct from 'admin') then
    raise exception 'alta_responsable_admin' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_miembros) m
             where nullif(btrim(m->>'first_name'), '') is null
                or nullif(btrim(m->>'last_name'), '') is null
                or coalesce(m->>'role', '') not in ('admin', 'agent')
                or coalesce(btrim(m->>'email'), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
                or coalesce(m->>'phone', '') !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'alta_miembro_invalido' using errcode = '22023';
  end if;
  if (select count(distinct lower(btrim(m->>'email'))) from jsonb_array_elements(p_miembros) m)
     <> jsonb_array_length(p_miembros) then
    raise exception 'alta_email_repetido' using errcode = '22023';
  end if;
  if (select count(distinct m->>'phone') from jsonb_array_elements(p_miembros) m)
     <> jsonb_array_length(p_miembros) then
    raise exception 'alta_telefono_repetido' using errcode = '22023';
  end if;

  delete from public.client_onboarding_members where onboarding_id = v_id;
  insert into public.client_onboarding_members
    (onboarding_id, first_name, last_name, email, phone, role, is_owner, is_contact)
  select v_id, btrim(m->>'first_name'), btrim(m->>'last_name'), lower(btrim(m->>'email')),
         m->>'phone', m->>'role',
         coalesce((m->>'is_owner')::boolean, false), coalesce((m->>'is_owner')::boolean, false)
  from jsonb_array_elements(p_miembros) m;

  update public.client_onboardings
  set company_name = btrim(p_company_name), website = nullif(btrim(p_website), ''), submitted_at = now()
  where id = v_id;

  insert into public.client_onboarding_tasks (onboarding_id, task_id, done_by)
  values (v_id, 'contacto.excel-recibido', null)
  on conflict do nothing;
end;
$$;

revoke execute on function public.onboarding_alta_enviar(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.onboarding_alta_enviar(uuid, text, text, jsonb) to service_role;
