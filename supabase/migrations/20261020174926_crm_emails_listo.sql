-- «Listo» en cada email que no llegó (20/10/2026, por pedido). `seen_at` pasa a ser «ya se
-- atendió» para todos y no solo «quien lo mandó vio el aviso»: marcarlo desde el cartel del lead
-- apaga la campana de quien lo mandó, y al revés. Lo puede marcar quien lo mandó o cualquiera que
-- pueda escribir el lead, y se puede deshacer. `seen_by` dice quién lo marcó (el tooltip).
alter table public.crm_emails
  add column if not exists seen_by uuid references public.users(id) on delete set null;

drop function if exists public.crm_email_visto(uuid);

create or replace function public.crm_email_visto(p_id uuid, p_visto boolean default true) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_email public.crm_emails%rowtype;
begin
  if not public.es_usuario() then
    raise exception 'crm_no_autorizado';
  end if;
  select * into v_email from public.crm_emails where id = p_id;
  if not found then
    raise exception 'crm_email_no_encontrado';
  end if;
  if v_email.sent_by <> auth.uid()
     and not (v_email.lead_id is not null and public.crm_puede_lead(v_email.lead_id, 'write')) then
    raise exception 'crm_no_autorizado';
  end if;
  if p_visto then
    update public.crm_emails set seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid())
     where id = p_id;
  else
    update public.crm_emails set seen_at = null, seen_by = null where id = p_id;
  end if;
end;
$$;

revoke execute on function public.crm_email_visto(uuid, boolean) from public, anon;
grant execute on function public.crm_email_visto(uuid, boolean) to authenticated;
