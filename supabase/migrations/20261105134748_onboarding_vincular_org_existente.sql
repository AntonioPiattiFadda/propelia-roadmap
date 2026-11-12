-- Vincular el lead a una organización que ya existe en Propelia (5/11/2026, por pedido).
--
-- El paso 1 del onboarding puede, en vez de crear la org, elegir una que ya está (el cliente ya
-- usaba Propelia). El puente suma al equipo con `add_users_to_org`: crea las cuentas que faltan y
-- saltea, sin tocarlas, las que ya eran de esa org. Las salteadas no reciben mail de accesos (no
-- sabemos su contraseña): por eso cada miembro guarda si ya tenía cuenta.

alter table public.client_onboarding_members
  add column if not exists existing_account boolean not null default false;
comment on column public.client_onboarding_members.existing_account is
  'Ya tenía cuenta en la org de Propelia cuando se importó: no se le creó ni se le mandan accesos.';

-- Igual que antes, más: `existing_account` por miembro, y una org que ya está atada a otro lead
-- se rechaza con su clave (antes chocaba con el índice único `crm_leads_propelia_org_unique`).
create or replace function public.client_onboarding_importar_equipo(
  p_onboarding_id uuid, p_organization_id uuid, p_miembros jsonb
) returns void language plpgsql security invoker set search_path to 'public' as $$
declare
  v_lead uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_solo_superadmin' using errcode = '42501';
  end if;
  select lead_id into v_lead from public.client_onboardings where id = p_onboarding_id;
  if v_lead is null then
    raise exception 'crm_onboarding_no_existe' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_miembros) <> 'array' or jsonb_array_length(p_miembros) = 0 then
    raise exception 'crm_onboarding_sin_miembros' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_miembros) m where coalesce((m->>'is_owner')::boolean, false)) <> 1 then
    raise exception 'crm_onboarding_un_responsable' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.crm_leads
    where propelia_organization_id = p_organization_id and id <> v_lead and deleted_at is null
  ) then
    raise exception 'crm_onboarding_org_de_otro_lead' using errcode = '23505';
  end if;

  delete from public.client_onboarding_members where onboarding_id = p_onboarding_id;
  insert into public.client_onboarding_members
    (onboarding_id, first_name, last_name, email, phone, role, is_owner, is_contact, existing_account)
  select p_onboarding_id, btrim(m->>'first_name'), coalesce(btrim(m->>'last_name'), ''),
         nullif(btrim(m->>'email'), ''), nullif(btrim(m->>'phone'), ''),
         coalesce(m->>'role', 'agent'),
         coalesce((m->>'is_owner')::boolean, false), coalesce((m->>'is_owner')::boolean, false),
         coalesce((m->>'existing_account')::boolean, false)
  from jsonb_array_elements(p_miembros) m;

  update public.crm_leads set propelia_organization_id = p_organization_id where id = v_lead;

  insert into public.client_onboarding_tasks (onboarding_id, task_id)
  values (p_onboarding_id, 'contacto.excel-recibido'), (p_onboarding_id, 'contacto.importar-usuarios')
  on conflict do nothing;
end;
$$;
