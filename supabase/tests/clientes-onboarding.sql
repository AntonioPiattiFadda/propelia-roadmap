-- Pruebas de Clientes y su onboarding (migración 20261026184212_clientes_onboarding).
--
-- Mismo formato que crm-permisos.sql: se corren enteras con el MCP execute_sql (como postgres),
-- todo pasa en una transacción que termina en ROLLBACK y cada afirmación es un DO que tira
-- `FALLO (…)`. Si llega al final, devuelve `clientes-onboarding: OK`. Necesita la migración corrida.
--
-- Uuids fijos con la marca c0de (imposibles en la base real):
--   SDR …c101, ADMIN …c1a0 (SUPERADMIN), cliente …d101, lead …e101, etapa de prueba …e1e1
begin;

-- ---------- Fixtures (como postgres: saltea la RLS) ----------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000c101', 'cli-sdr@prueba.test',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c1a0', 'cli-admin@prueba.test', 'authenticated', 'authenticated');
insert into public.users (id, email, nombre, iniciales, color, rol, activo) values
  ('00000000-0000-4000-8000-00000000c101', 'cli-sdr@prueba.test',   'SDR',   'SD', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c1a0', 'cli-admin@prueba.test', 'Admin', 'AD', '#888888', 'SUPERADMIN', true);
insert into public.crm_clients (id, first_name, last_name, company_name, phone, email) values
  ('00000000-0000-4000-8000-00000000d101', 'Marta', 'Gil', 'Inmo Prueba', '+99900000101', 'cli@prueba.test');
insert into public.crm_funnel_stages (id, label, value, position, starts_onboarding) values
  ('00000000-0000-4000-8000-00000000e1e1', 'Contratado (prueba)', 'CUSTOM', 999, true);
insert into public.crm_leads (id, client_id, assigned_to, funnel_stage_id) values
  ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000c101',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1));

-- ---------- 1. El SDR mueve el lead a la etapa: pasa a ONBOARDING y nace su onboarding ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c101","role":"authenticated"}';
update public.crm_leads set funnel_stage_id = '00000000-0000-4000-8000-00000000e1e1'
  where id = '00000000-0000-4000-8000-00000000e101';
do $$
declare n int; ok boolean := false;
begin
  -- 1a. El SDR no ve las tablas del onboarding.
  select count(*) into n from public.client_onboardings where lead_id = '00000000-0000-4000-8000-00000000e101';
  if n <> 0 then raise exception 'FALLO (1a): el SDR ve el onboarding'; end if;
  -- 1b. Ni escribe lead_type a mano.
  begin
    update public.crm_leads set lead_type = 'CLIENT' where id = '00000000-0000-4000-8000-00000000e101';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (1b): el SDR cambió lead_type a mano'; end if;
end $$;
reset role;
do $$
declare t public.crm_lead_type; n int;
begin
  select lead_type into t from public.crm_leads where id = '00000000-0000-4000-8000-00000000e101';
  if t is distinct from 'ONBOARDING' then raise exception 'FALLO (1c): el lead quedó en %, esperaba ONBOARDING', t; end if;
  select count(*) into n from public.client_onboarding_members m join public.client_onboardings o on o.id = m.onboarding_id
   where o.lead_id = '00000000-0000-4000-8000-00000000e101' and m.is_owner and m.is_contact and m.role = 'admin'
     and m.first_name = 'Marta' and m.last_name = 'Gil' and m.phone = '+99900000101';
  if n <> 1 then raise exception 'FALLO (1d): el onboarding no nació con el responsable del cliente'; end if;
end $$;

-- ---------- 2. El SUPERADMIN importa el equipo y completa ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c1a0","role":"authenticated"}';
do $$
declare v_ob uuid; n int; ok boolean := false;
begin
  select id into v_ob from public.client_onboardings where lead_id = '00000000-0000-4000-8000-00000000e101';
  if v_ob is null then raise exception 'FALLO (2a): el SUPERADMIN no ve el onboarding'; end if;
  -- 2b. Dos responsables: no entra nada.
  begin
    perform public.client_onboarding_importar_equipo(v_ob, '00000000-0000-4000-8000-0000000c0de1',
      '[{"first_name":"A","is_owner":true,"role":"admin"},{"first_name":"B","is_owner":true,"role":"admin"}]');
  exception when invalid_parameter_value then ok := true;
  end;
  if not ok then raise exception 'FALLO (2b): importó un equipo con dos responsables'; end if;
  perform public.client_onboarding_importar_equipo(v_ob, '00000000-0000-4000-8000-0000000c0de1',
    '[{"first_name":"Marta","last_name":"Gil","email":"m@prueba.test","phone":"+99900000101","role":"admin","is_owner":true},
      {"first_name":"Pablo","last_name":"Ruiz","email":"p@prueba.test","phone":"+99900000102","role":"agent","is_owner":false}]');
  select count(*) into n from public.client_onboarding_members where onboarding_id = v_ob;
  if n <> 2 then raise exception 'FALLO (2c): quedaron % miembros, esperaba 2 (el Excel reemplaza)', n; end if;
  select count(*) into n from public.crm_leads where id = '00000000-0000-4000-8000-00000000e101'
    and propelia_organization_id = '00000000-0000-4000-8000-0000000c0de1';
  if n <> 1 then raise exception 'FALLO (2d): la org no quedó en el lead'; end if;
  select count(*) into n from public.client_onboarding_tasks where onboarding_id = v_ob
    and task_id in ('contacto.excel-recibido', 'contacto.importar-usuarios');
  if n <> 2 then raise exception 'FALLO (2e): el import no tildó sus dos tareas'; end if;
  -- 2f. Tampoco el SUPERADMIN escribe lead_type a mano.
  ok := false;
  begin
    update public.crm_leads set lead_type = 'CLIENT' where id = '00000000-0000-4000-8000-00000000e101';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (2f): el SUPERADMIN cambió lead_type a mano'; end if;
  perform public.client_onboarding_completar(v_ob);
  select count(*) into n from public.crm_leads where id = '00000000-0000-4000-8000-00000000e101' and lead_type = 'CLIENT';
  if n <> 1 then raise exception 'FALLO (2g): completar no pasó el lead a CLIENT'; end if;
end $$;
reset role;

-- ---------- 3. Un CLIENT que vuelve a pasar por la etapa no reabre nada ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c101","role":"authenticated"}';
update public.crm_leads set funnel_stage_id = (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)
  where id = '00000000-0000-4000-8000-00000000e101';
update public.crm_leads set funnel_stage_id = '00000000-0000-4000-8000-00000000e1e1'
  where id = '00000000-0000-4000-8000-00000000e101';
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.crm_leads where id = '00000000-0000-4000-8000-00000000e101' and lead_type = 'CLIENT';
  if n <> 1 then raise exception 'FALLO (3a): el CLIENT volvió a ONBOARDING al pasar por la etapa'; end if;
  select count(*) into n from public.client_onboardings where lead_id = '00000000-0000-4000-8000-00000000e101' and completed_at is not null;
  if n <> 1 then raise exception 'FALLO (3b): se reabrió el onboarding'; end if;
end $$;

select 'clientes-onboarding: OK' as resultado;
rollback;
