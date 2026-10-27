-- «Quiero editar» en la página pública de alta (27/10/2026, por pedido): el cliente que ya envió
-- puede volver a abrir el formulario él solo, mientras el equipo de Propelia no lo haya importado.
-- Importado = el lead ya tiene su org en Propelia (`propelia_organization_id`, lo deja
-- `client_onboarding_importar_equipo`): las cuentas existen y cambiar el equipo acá no las tocaría,
-- así que se corta con `alta_ya_importada` y la página lo avisa amablemente.
--
-- Hace lo mismo que «Reabrir» de /clientes (`reabrirAlta`): borra `submitted_at` y destilda
-- «Recibir el equipo». Al reenviar, la base vuelve a tildarla y el trigger
-- `client_onboardings_alta_recibida` vuelve a avisar (si la tarea anterior sigue pendiente, no la repite).
-- La llama la edge function `onboarding-alta` con el service_role, como las otras dos.

create or replace function public.onboarding_alta_reabrir(p_token uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_id  uuid;
  v_org uuid;
begin
  select o.id, l.propelia_organization_id into v_id, v_org
  from public.client_onboardings o
  join public.crm_leads l on l.id = o.lead_id and l.deleted_at is null
  where o.public_token = p_token and o.completed_at is null
  for update of o;
  if v_id is null then
    raise exception 'alta_no_existe' using errcode = 'P0002';
  end if;
  if v_org is not null then
    raise exception 'alta_ya_importada' using errcode = '22023';
  end if;

  update public.client_onboardings set submitted_at = null where id = v_id;
  delete from public.client_onboarding_tasks where onboarding_id = v_id and task_id = 'contacto.excel-recibido';
end;
$$;

revoke execute on function public.onboarding_alta_reabrir(uuid) from public, anon, authenticated;
grant execute on function public.onboarding_alta_reabrir(uuid) to service_role;
