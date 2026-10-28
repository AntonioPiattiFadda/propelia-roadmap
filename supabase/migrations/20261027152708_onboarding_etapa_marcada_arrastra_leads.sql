-- Marcar una etapa «Onboarding» (`starts_onboarding` de false a true) también pasa a ONBOARDING
-- los leads (LEAD) que ya estaban en ella, y el trigger `crm_leads_crear_onboarding` les crea su
-- alta. Hasta ahora solo contaba entrar a la etapa: un lead movido a «En prueba mes gratis» antes
-- de marcarla no llegaba nunca a /clientes (Altamarco, 27/10/2026). Desmarcar no deshace nada.
create or replace function public.crm_funnel_stages_arranca_onboarding()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.starts_onboarding and not old.starts_onboarding and new.deleted_at is null then
    perform set_config('crm.lead_type_rpc', 'on', true);
    update public.crm_leads set lead_type = 'ONBOARDING'
      where funnel_stage_id = new.id and lead_type = 'LEAD' and deleted_at is null;
    perform set_config('crm.lead_type_rpc', '', true);
  end if;
  return null;
end;
$$;
revoke execute on function public.crm_funnel_stages_arranca_onboarding() from public, anon, authenticated;

drop trigger if exists crm_funnel_stages_arranca_onboarding on public.crm_funnel_stages;
create trigger crm_funnel_stages_arranca_onboarding after update of starts_onboarding on public.crm_funnel_stages
  for each row execute function public.crm_funnel_stages_arranca_onboarding();

-- Los que ya quedaron afuera (hoy, Altamarco en «En prueba mes gratis»). Sin sesión, el corte de
-- `crm_leads_lead_type` no aplica; el trigger les crea el alta.
update public.crm_leads l set lead_type = 'ONBOARDING'
from public.crm_funnel_stages s
where s.id = l.funnel_stage_id and s.starts_onboarding and s.deleted_at is null
  and l.lead_type = 'LEAD' and l.deleted_at is null;
