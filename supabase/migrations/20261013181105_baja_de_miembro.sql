-- Dar de baja a un miembro del equipo desde /equipo (13/10/2026).
--
-- La baja sigue siendo `activo = false` y nunca un delete (las crm_* apuntan a `users` con FK
-- restrict y el roadmap guarda los uuids adentro de su JSON). Lo nuevo es que, en la misma
-- transacción, lo que la persona tenía en curso pasa a otra:
--   - sus leads (todos los no borrados, descartados incluidos): la cartera queda vacía. El
--     historial de asignación lo escribe el trigger de siempre; el comentario SYSTEM, acá.
--   - sus tareas del CRM sin completar. Las completadas se quedan: dicen quién las hizo.
--   - sus reuniones programadas que todavía no empezaron. Las pasadas, igual que las tareas.
--   - las tareas del roadmap sin terminar donde figura en `pend` (y `resp`, que es `pend[0]`), y
--     los pasos sin terminar de esas tareas que tenía a su nombre.
--   - sus filas de `crm_data_access`, como viewer y como subject: un inactivo no ve nada, y la
--     cartera de la que eran el permiso quedó vacía. Si vuelve, los permisos se dan de nuevo.
-- La caja (`users.caja`, `expenses.paid_by`) no se toca: sacar a alguien del reparto mueve los
-- saldos de todos, y eso se decide aparte.
--
-- Solo SUPERADMIN, y no sobre sí mismo (se quedaría afuera a mitad de la pantalla).
-- Con `p_simular` no escribe nada y devuelve cuánto movería: es el preview del dialog, y sirve
-- también sin sucesor elegido. Los conteos usan los mismos filtros que los updates.
-- Sin sucesor solo se puede si no hay nada que mover.
create or replace function public.crm_dar_de_baja_miembro(
  p_user_id  uuid,
  p_sucesor  uuid default null,
  p_simular  boolean default true
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_nombre         text;
  v_nombre_sucesor text;
  v_leads          int;
  v_tareas         int;
  v_reuniones      int;
  v_roadmap        int;
  v_lead           uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_baja_solo_superadmin';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'crm_baja_propia';
  end if;
  select nombre into v_nombre from public.users where id = p_user_id and activo;
  if v_nombre is null then
    raise exception 'crm_baja_ya_inactivo';
  end if;
  if p_sucesor is not null then
    if p_sucesor = p_user_id then
      raise exception 'crm_baja_sucesor_invalido';
    end if;
    select nombre into v_nombre_sucesor from public.users where id = p_sucesor and activo;
    if v_nombre_sucesor is null then
      raise exception 'crm_responsable_inactivo';
    end if;
  end if;

  select count(*) into v_leads from public.crm_leads
    where assigned_to = p_user_id and deleted_at is null;
  select count(*) into v_tareas from public.crm_tasks
    where assigned_to = p_user_id and not completed and deleted_at is null;
  select count(*) into v_reuniones from public.crm_meetings
    where assigned_to = p_user_id and status = 'scheduled' and starts_at > now() and deleted_at is null;
  select count(*) into v_roadmap from public.roadmap_tareas t
    where t.estado <> 'Hecho'
      and (t.pend ? p_user_id::text
           or exists (select 1 from jsonb_array_elements(t.subtareas) s
                      where s->>'resp' = p_user_id::text and coalesce(s->>'estado', '') <> 'Hecho'));

  if p_simular then
    return json_build_object('leads', v_leads, 'tareas', v_tareas, 'reuniones', v_reuniones,
                             'roadmap', v_roadmap, 'simulado', true);
  end if;

  if p_sucesor is null and v_leads + v_tareas + v_reuniones + v_roadmap > 0 then
    raise exception 'crm_baja_falta_sucesor';
  end if;

  if p_sucesor is not null then
    -- De a uno para dejar el comentario de cada lead, como `reasignarLead()` del front.
    for v_lead in
      update public.crm_leads set assigned_to = p_sucesor, last_important_event_at = now()
      where assigned_to = p_user_id and deleted_at is null
      returning id
    loop
      insert into public.crm_comments (lead_id, description, comment_type, created_by)
      values (v_lead, format('Lead reasignado de %s a %s (baja de %s).', v_nombre, v_nombre_sucesor, v_nombre),
              'SYSTEM', auth.uid());
    end loop;

    update public.crm_tasks set assigned_to = p_sucesor
      where assigned_to = p_user_id and not completed and deleted_at is null;

    update public.crm_meetings set assigned_to = p_sucesor
      where assigned_to = p_user_id and status = 'scheduled' and starts_at > now() and deleted_at is null;

    -- `pend` sin el que se va y con el sucesor en su lugar, sin repetirlo si ya estaba.
    -- `resp` acompaña a `pend[0]`, como en el front.
    update public.roadmap_tareas t set
      pend = n.pend,
      resp = coalesce(n.pend->>0, ''),
      subtareas = n.subtareas
    from (
      select t2.id,
        (select coalesce(jsonb_agg(v order by o), '[]'::jsonb) from (
           select v, min(o) o from (
             select case when e = to_jsonb(p_user_id::text) then to_jsonb(p_sucesor::text) else e end v, o
             from jsonb_array_elements(t2.pend) with ordinality x(e, o)
           ) r group by v
         ) d) pend,
        (select coalesce(jsonb_agg(
           case when s->>'resp' = p_user_id::text and coalesce(s->>'estado', '') <> 'Hecho'
                then jsonb_set(s, '{resp}', to_jsonb(p_sucesor::text)) else s end order by o), '[]'::jsonb)
         from jsonb_array_elements(t2.subtareas) with ordinality y(s, o)) subtareas
      from public.roadmap_tareas t2
      where t2.estado <> 'Hecho'
        and (t2.pend ? p_user_id::text
             or exists (select 1 from jsonb_array_elements(t2.subtareas) s
                        where s->>'resp' = p_user_id::text and coalesce(s->>'estado', '') <> 'Hecho'))
    ) n
    where t.id = n.id;
  end if;

  delete from public.crm_data_access where viewer_id = p_user_id or subject_id = p_user_id;

  update public.users set activo = false where id = p_user_id;

  return json_build_object('leads', v_leads, 'tareas', v_tareas, 'reuniones', v_reuniones,
                           'roadmap', v_roadmap, 'simulado', false);
end;
$$;

revoke all on function public.crm_dar_de_baja_miembro(uuid, uuid, boolean) from public, anon;
grant execute on function public.crm_dar_de_baja_miembro(uuid, uuid, boolean) to authenticated;
