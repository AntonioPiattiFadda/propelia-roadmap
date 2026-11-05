-- Restaurar los dos leads de prueba del onboarding (5/11/2026, por pedido).
--
-- `20261105173247_crm_leads_de_prueba` los marcó para Antonio (`solo_para`) pero ya estaban
-- eliminados desde el CRM, así que no se veían ni para él. Se restauran como el «Deshacer» de
-- eliminar: el lead y las tareas pendientes que se borraron con él (mismo minuto). Solo los que
-- tienen alta en /clientes: las copias viejas con el mismo nombre siguen borradas. Si ya están
-- restaurados, no hace nada.

do $$
declare
  v_antonio uuid;
begin
  perform set_config('row_security', 'off', true);
  select id into v_antonio from public.users where email = 'antonio.piattifadda@gmail.com';
  if v_antonio is null then
    raise exception 'crm_leads_de_prueba_restaurar: no existe el usuario antonio.piattifadda@gmail.com';
  end if;

  update public.crm_tasks t set deleted_at = null
    from public.crm_leads l
   where t.lead_id = l.id and l.solo_para = v_antonio and l.deleted_at is not null
     and exists (select 1 from public.client_onboardings o where o.lead_id = l.id)
     and not t.completed and t.deleted_at is not null
     and t.deleted_at between l.deleted_at - interval '1 minute' and l.deleted_at + interval '1 minute';

  update public.crm_leads l set deleted_at = null
   where l.solo_para = v_antonio and l.deleted_at is not null
     and exists (select 1 from public.client_onboardings o where o.lead_id = l.id);
end $$;
