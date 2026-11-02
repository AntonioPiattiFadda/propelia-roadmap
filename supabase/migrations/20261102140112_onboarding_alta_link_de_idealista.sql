-- El link de Idealista en la página pública de alta (2/11/2026, por pedido): un campo opcional más en
-- el paso «La inmobiliaria», debajo de la web. Va en `client_onboardings.idealista_url`, como
-- `company_name` y `website`: no pisa `crm_clients.idealista_url` (que es única por ficha), pero
-- la página arranca precargada con ese si el cliente todavía no escribió uno.
--
-- `onboarding_alta_enviar` suma `p_idealista_url` con default null: la edge function vieja (sin el
-- parámetro) sigue andando contra esta. Se borra la de cuatro argumentos para que no queden dos.
-- Mismas funciones que `20261027133921_onboarding_alta_publica` y `20261027154452_onboarding_alta_telefono_repetido`.

alter table public.client_onboardings add column if not exists idealista_url text;

-- Lo que la página precarga. null si el token no existe o el alta ya terminó.
create or replace function public.onboarding_alta_leer(p_token uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'inmobiliaria', coalesce(o.company_name, nullif(btrim(c.company_name), ''),
                             nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), '')),
    'web', o.website,
    -- Lo que escribió el cliente o, si todavía nada, la ficha de Idealista del CRM.
    'idealista', coalesce(o.idealista_url, nullif(btrim(c.idealista_url), '')),
    'enviado', o.submitted_at is not null,
    'miembros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'first_name', m.first_name, 'last_name', m.last_name, 'email', m.email,
               'phone', m.phone, 'role', m.role, 'is_owner', m.is_owner)
             order by m.is_owner desc, m.created_at)
      from public.client_onboarding_members m where m.onboarding_id = o.id), '[]'::jsonb)
  )
  from public.client_onboardings o
  join public.crm_leads l on l.id = o.lead_id and l.deleted_at is null
  left join public.crm_clients c on c.id = l.client_id
  where o.public_token = p_token and o.completed_at is null;
$$;

drop function if exists public.onboarding_alta_enviar(uuid, text, text, jsonb);

-- Lo que envía el cliente: valida todo de nuevo (las mismas que tenía el Excel), reemplaza el
-- equipo, guarda nombre, web e Idealista, cierra el enlace y tilda «Recibir los datos». No crea
-- cuentas: eso sigue siendo «Importar» en /clientes. Errores como claves, igual que el resto del CRM.
create or replace function public.onboarding_alta_enviar(
  p_token uuid, p_company_name text, p_website text, p_miembros jsonb, p_idealista_url text default null
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
  if nullif(btrim(p_idealista_url), '') is not null
     and btrim(p_idealista_url) !~* '^(https?://)?([a-z0-9-]+\.)*idealista\.(com|pt|it)(/|$)' then
    raise exception 'alta_idealista_invalido' using errcode = '22023';
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
  set company_name = btrim(p_company_name), website = nullif(btrim(p_website), ''),
      idealista_url = nullif(btrim(p_idealista_url), ''), submitted_at = now()
  where id = v_id;

  insert into public.client_onboarding_tasks (onboarding_id, task_id, done_by)
  values (v_id, 'contacto.excel-recibido', null)
  on conflict do nothing;
end;
$$;

revoke execute on function public.onboarding_alta_leer(uuid) from public, anon, authenticated;
revoke execute on function public.onboarding_alta_enviar(uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.onboarding_alta_leer(uuid) to service_role;
grant execute on function public.onboarding_alta_enviar(uuid, text, text, jsonb, text) to service_role;
