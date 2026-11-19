-- El aviso de un mail que no llegó es de quien lo mandó (19/11/2026, por pedido): la tarea «Revisar el
-- mail de acceso que no llegó a …» pasa a ser de quien mandó el mail (`crm_emails.sent_by`). Hasta hoy
-- era de quien lleva el alta, si no del responsable del lead, y recién al final de quien lo mandó: un
-- rebote de Antonio le sonaba a Lorenzo. Ahora va al revés: quien lo mandó y, solo si el mail no tiene
-- remitente, quien lleva el alta o el responsable del lead. El resto de la función no cambia.

create or replace function public.crm_emails_acceso_no_llego()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_quien    uuid;
  v_permite  boolean;
  v_titulo   text := 'Revisar el mail de acceso que no llegó a ' || new.to_email;
  v_cuando   timestamp := (now() + interval '5 minutes') at time zone 'Europe/Madrid';
begin
  select coalesce(new.sent_by, o.assigned_to, l.assigned_to), coalesce(s.allows_tasks, true)
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
