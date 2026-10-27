-- Cuando el cliente envía la página pública de alta, aviso a quien lleva el onboarding (27/10/2026,
-- por pedido): una tarea del CRM en ese lead, «Revisar e importar el equipo de …», para hoy y con
-- hora dentro de 5 minutos. La hora es lo que la hace sonar: `useAlarmasDeTareas` avisa (toast y
-- notificación del navegador) 5 minutos antes, o sea ya, con el CRM abierto en alguna pestaña.
-- Quien la recibe: `client_onboardings.assigned_to` («Tomar» en /clientes) o, si nadie la tomó, el
-- responsable del lead. La casilla «Recibir el equipo» la sigue tildando `onboarding_alta_enviar`.
--
-- Trigger y no adentro de la función: salta con cualquier camino que llene `submitted_at`. Solo el
-- paso de vacío a lleno: reabrir el enlace y que lo reenvíen vuelve a avisar, guardar dos veces no.
-- Nunca hace fallar el envío del cliente: si la etapa no deja agendar tareas (`allows_tasks`) o no
-- hay a quién, no crea nada; y si ya hay una igual pendiente en el lead, no la repite.

create or replace function public.client_onboardings_alta_recibida()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_quien    uuid;
  v_permite  boolean;
  v_nombre   text;
  v_titulo   text;
  v_cuando   timestamp := (now() + interval '5 minutes') at time zone 'Europe/Madrid';
begin
  select coalesce(new.assigned_to, l.assigned_to),
         coalesce(s.allows_tasks, true),
         coalesce(nullif(btrim(new.company_name), ''), nullif(btrim(c.company_name), ''), 'la inmobiliaria')
    into v_quien, v_permite, v_nombre
  from public.crm_leads l
  left join public.crm_funnel_stages s on s.id = l.funnel_stage_id
  left join public.crm_clients c on c.id = l.client_id
  where l.id = new.lead_id and l.deleted_at is null;

  if v_quien is null or not v_permite then
    return new;
  end if;

  v_titulo := 'Revisar e importar el equipo de ' || v_nombre;
  if exists (select 1 from public.crm_tasks
             where lead_id = new.lead_id and title = v_titulo and not completed and deleted_at is null) then
    return new;
  end if;

  -- `due_time` es hora de España (ver `crm_tasks.due_time`), sin segundos.
  insert into public.crm_tasks (lead_id, title, due_date, due_time, assigned_to, created_by)
  values (new.lead_id, v_titulo, v_cuando::date, date_trunc('minute', v_cuando)::time, v_quien, null);
  return new;
end;
$$;
revoke execute on function public.client_onboardings_alta_recibida() from public, anon, authenticated;

drop trigger if exists client_onboardings_alta_recibida on public.client_onboardings;
create trigger client_onboardings_alta_recibida
  after update of submitted_at on public.client_onboardings
  for each row when (old.submitted_at is null and new.submitted_at is not null)
  execute function public.client_onboardings_alta_recibida();
