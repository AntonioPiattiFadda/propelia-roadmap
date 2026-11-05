-- Vincular la org de Propelia al lead antes de importar el equipo (5/11/2026, por pedido).
--
-- Hasta hoy la org quedaba atada solo al importar el equipo (`client_onboarding_importar_equipo`),
-- y eso pedía que el cliente ya hubiera enviado la página de alta. Cuando el cliente ya usaba
-- Propelia, se quiere atar su org de entrada (importar la cartera, el link de pago…) sin esperar al
-- equipo. Después, «Importar» suma al equipo a esa misma org.
--
-- Por eso «el equipo ya está importado» deja de ser «el lead tiene org» y pasa a ser la tarea
-- `contacto.importar-usuarios` hecha (la tilda `client_onboarding_importar_equipo`). Cambia la regla
-- de `onboarding_alta_reabrir`: con la org vinculada pero sin importar, el cliente todavía puede
-- reabrir su alta.

-- Ata (o con null, desata) la org al lead del alta. Solo SUPERADMIN y solo mientras el equipo no se
-- importó: después, las cuentas ya están en esa org y cambiarla las dejaría colgadas.
create or replace function public.client_onboarding_vincular_org(
  p_onboarding_id uuid, p_organization_id uuid
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
  if exists (
    select 1 from public.client_onboarding_tasks
    where onboarding_id = p_onboarding_id and task_id = 'contacto.importar-usuarios'
  ) then
    raise exception 'crm_onboarding_equipo_ya_importado' using errcode = '22023';
  end if;
  if p_organization_id is not null and exists (
    select 1 from public.crm_leads
    where propelia_organization_id = p_organization_id and id <> v_lead and deleted_at is null
  ) then
    raise exception 'crm_onboarding_org_de_otro_lead' using errcode = '23505';
  end if;

  update public.crm_leads set propelia_organization_id = p_organization_id where id = v_lead;
end;
$$;

revoke execute on function public.client_onboarding_vincular_org(uuid, uuid) from public, anon;
grant execute on function public.client_onboarding_vincular_org(uuid, uuid) to authenticated;

-- «Quiero editar» de la página pública: igual que antes, salvo que «importado» es la tarea
-- `contacto.importar-usuarios` hecha y no que el lead tenga org (ahora se puede vincular antes).
create or replace function public.onboarding_alta_reabrir(p_token uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
begin
  select o.id into v_id
  from public.client_onboardings o
  join public.crm_leads l on l.id = o.lead_id and l.deleted_at is null
  where o.public_token = p_token and o.completed_at is null
  for update of o;
  if v_id is null then
    raise exception 'alta_no_existe' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.client_onboarding_tasks
    where onboarding_id = v_id and task_id = 'contacto.importar-usuarios'
  ) then
    raise exception 'alta_ya_importada' using errcode = '22023';
  end if;

  update public.client_onboardings set submitted_at = null where id = v_id;
  delete from public.client_onboarding_tasks where onboarding_id = v_id and task_id = 'contacto.excel-recibido';
end;
$$;

revoke execute on function public.onboarding_alta_reabrir(uuid) from public, anon, authenticated;
grant execute on function public.onboarding_alta_reabrir(uuid) to service_role;
