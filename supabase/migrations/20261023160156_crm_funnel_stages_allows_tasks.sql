-- «¿Se puede agendar tarea?» por etapa del funnel (23/10/2026, por pedido). Con
-- `allows_tasks = false`, a un lead en esa etapa no se le crea ninguna tarea; las que ya tiene
-- siguen como están (se editan, completan y borran). Lo elige un SUPERADMIN en la configuración del
-- funnel: la RLS de crm_funnel_stages ya cubre la columna. Default true: ninguna etapa existente
-- cambia. La regla de verdad es el trigger; `permiteAgendarTarea` del front es el espejo. El alta
-- (`crm_create_lead_with_client`) saltea la tarea inicial en esas etapas. Es el mismo bloque que
-- está en supabase/schema.sql.

alter table public.crm_funnel_stages add column if not exists allows_tasks boolean not null default true;

-- Sin lead o lead sin etapa, pasa. Security definer: lee la etapa sin depender de la RLS de quien
-- inserta.
create or replace function public.crm_tasks_etapa_permite()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.lead_id is not null and exists (
    select 1 from public.crm_leads l
      join public.crm_funnel_stages s on s.id = l.funnel_stage_id
     where l.id = new.lead_id and s.allows_tasks = false) then
    raise exception 'crm_etapa_sin_tareas';
  end if;
  return new;
end;
$$;
revoke execute on function public.crm_tasks_etapa_permite() from public, anon, authenticated;

drop trigger if exists crm_tasks_etapa_permite on public.crm_tasks;
create trigger crm_tasks_etapa_permite before insert on public.crm_tasks
  for each row execute function public.crm_tasks_etapa_permite();

-- El alta: idéntica a la anterior salvo que la tarea inicial «Asesorar cliente» se saltea cuando la
-- etapa no deja agendar tareas (si no, el trigger la rechazaría y se caería el alta entero).
create or replace function public.crm_create_lead_with_client(
  p_assigned_to            uuid,
  -- La manda el front: «hoy» es el de la zona de quien carga, no el UTC del servidor.
  p_initial_task_due_date  date,
  p_first_name             text default null,
  p_last_name              text default null,
  p_company_name           text default null,
  p_email                  text default null,
  p_phone                  text default null,
  p_channel_id             uuid default null,
  p_funnel_stage_id        uuid default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_phone     text := nullif(btrim(p_phone), '');
  v_email     text := nullif(btrim(p_email), '');
  v_stage_id  uuid := p_funnel_stage_id;
  v_client_id uuid;
  v_lead_id   uuid;
  v_reused    boolean := false;
begin
  if not public.es_usuario() then
    raise exception 'crm_sin_acceso';
  end if;
  if not public.crm_puede(p_assigned_to, 'write') then
    raise exception 'crm_sin_permiso_cartera' using errcode = '42501';
  end if;
  -- Sin ninguno de los dos no hay con qué deduplicar: el próximo alta del mismo cliente
  -- crearía otro.
  if v_phone is null and v_email is null then
    raise exception 'crm_falta_contacto';
  end if;
  -- crm_puede() deja pasar a un SUPERADMIN sobre cualquier id, incluso el de un inactivo.
  if not exists (select 1 from public.users where id = p_assigned_to and activo) then
    raise exception 'crm_responsable_inactivo';
  end if;
  if p_channel_id is not null and not exists (
    select 1 from public.crm_channels where id = p_channel_id and deleted_at is null) then
    raise exception 'crm_canal_invalido';
  end if;
  if v_stage_id is null then
    -- Por value y no por nombre: la etiqueta «Nuevo» se puede renombrar, NEW no.
    select id into v_stage_id from public.crm_funnel_stages
     where deleted_at is null order by (value = 'NEW') desc, position asc limit 1;
  elsif not exists (select 1 from public.crm_funnel_stages where id = v_stage_id and deleted_at is null) then
    raise exception 'crm_etapa_invalida';
  end if;

  -- Teléfono primero, como el producto: el email se tipea con más errores.
  if v_phone is not null then
    select id into v_client_id from public.crm_clients
     where phone = v_phone and deleted_at is null limit 1;
  end if;
  if v_client_id is null and v_email is not null then
    select id into v_client_id from public.crm_clients
     where lower(email) = lower(v_email) and deleted_at is null limit 1;
  end if;

  if v_client_id is not null then
    v_reused := true;
  else
    begin
      insert into public.crm_clients (first_name, last_name, company_name, email, phone, created_by)
      values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
              nullif(btrim(p_company_name), ''), v_email, v_phone, auth.uid())
      returning id into v_client_id;
    exception when unique_violation then
      -- Otro alta del mismo cliente ganó la carrera entre el lookup y el insert.
      select id into v_client_id from public.crm_clients
       where deleted_at is null
         and ((v_phone is not null and phone = v_phone)
           or (v_email is not null and lower(email) = lower(v_email)))
       limit 1;
      v_reused := true;
    end;
  end if;

  -- Un lead por cliente, dicho con una clave que la pantalla sabe traducir.
  if exists (select 1 from public.crm_leads where client_id = v_client_id and deleted_at is null) then
    raise exception 'crm_lead_duplicado';
  end if;

  insert into public.crm_leads (client_id, assigned_to, funnel_stage_id, channel_id, created_via, created_by)
  values (v_client_id, p_assigned_to, v_stage_id, p_channel_id, 'manual', auth.uid())
  returning id into v_lead_id;

  -- La tarea inicial, salvo que la etapa no deje agendar tareas (`allows_tasks`, 23/10/2026): el
  -- trigger de crm_tasks la rechazaría y se caería el alta entero.
  if coalesce((select allows_tasks from public.crm_funnel_stages where id = v_stage_id), true) then
    insert into public.crm_tasks (lead_id, title, due_date, assigned_to, created_by)
    values (v_lead_id, 'Asesorar cliente', p_initial_task_due_date, p_assigned_to, auth.uid());
  end if;

  return json_build_object('lead_id', v_lead_id, 'client_id', v_client_id, 'client_reused', v_reused);
end;
$$;

-- REVOKE primero: un REVOKE ALL posterior se llevaría también el GRANT. Y a PUBLIC, no solo a
-- anon: anon hereda de PUBLIC.
revoke all on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  to authenticated;
