-- Un mail de accesos del onboarding que no llegó (27/10/2026, por pedido): cuando Resend avisa que
-- rebotó, falló o no se envió (`resend-webhook` → `crm_email_evento`), una tarea del CRM en el lead,
-- «Revisar el mail de acceso que no llegó a …», para hoy y con hora dentro de 5 minutos, así suena
-- ya (igual que `client_onboardings_alta_recibida`). Quien la recibe: quien lleva el alta
-- (`client_onboardings.assigned_to`), si no el responsable del lead, si no quien mandó el mail.
--
-- Solo `plantilla = 'acceso'` con lead: desde esta fecha /clientes manda el `leadId` con cada mail de
-- accesos. `complained` no cuenta: el mail llegó. Solo el paso a «no llegó»: un `bounced` que después
-- pasa a `suppressed` no repite la tarea, y si ya hay una igual pendiente tampoco.
-- Nunca hace fallar el webhook (si falla, Resend reintenta y el estado no se guarda): si la etapa no
-- deja agendar tareas o el insert falla, no crea nada.

create or replace function public.crm_emails_acceso_no_llego()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_quien    uuid;
  v_permite  boolean;
  v_titulo   text := 'Revisar el mail de acceso que no llegó a ' || new.to_email;
  v_cuando   timestamp := (now() + interval '5 minutes') at time zone 'Europe/Madrid';
begin
  select coalesce(o.assigned_to, l.assigned_to, new.sent_by), coalesce(s.allows_tasks, true)
    into v_quien, v_permite
  from public.crm_leads l
  left join public.client_onboardings o on o.lead_id = l.id
  left join public.crm_funnel_stages s on s.id = l.funnel_stage_id
  where l.id = new.lead_id and l.deleted_at is null;

  if v_quien is null or not v_permite then
    return new;
  end if;

  if exists (select 1 from public.crm_tasks
             where lead_id = new.lead_id and title = v_titulo and not completed and deleted_at is null) then
    return new;
  end if;

  begin
    -- `due_time` es hora de España (ver `crm_tasks.due_time`), sin segundos.
    insert into public.crm_tasks (lead_id, title, due_date, due_time, assigned_to, created_by)
    values (new.lead_id, v_titulo, v_cuando::date, date_trunc('minute', v_cuando)::time, v_quien, null);
  exception when others then
    raise warning 'crm_emails_acceso_no_llego: no se creó la tarea (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.crm_emails_acceso_no_llego() from public, anon, authenticated;

drop trigger if exists crm_emails_acceso_no_llego on public.crm_emails;
create trigger crm_emails_acceso_no_llego
  after update of status on public.crm_emails
  for each row when (
    new.plantilla = 'acceso' and new.lead_id is not null
    and new.status in ('bounced', 'failed', 'suppressed')
    and old.status not in ('bounced', 'failed', 'suppressed')
  )
  execute function public.crm_emails_acceso_no_llego();
