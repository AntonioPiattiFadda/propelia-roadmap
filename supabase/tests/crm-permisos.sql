-- Pruebas de permisos del CRM (spec 2026-09-30-crm-pantalla §6).
--
-- Se corren contra la base de verdad (MCP execute_sql, como postgres) y NO dejan rastro: todo
-- pasa en una transacción que termina en ROLLBACK, incluidos los usuarios de prueba. Cada
-- afirmación es un DO que tira `FALLO (…)`: la transacción aborta y el MCP devuelve ese error.
-- Si llega al final, la última consulta devuelve `crm-permisos: OK`.
--
-- Uuids fijos y con la marca c0de: son imposibles en la base real (los genera gen_random_uuid)
-- y así el mensaje de un fallo dice de qué fila se habla.
--   SDR1 …c001, SDR2 …c002, SDR3 …c003, ADMIN …c0a0 (SUPERADMIN), INACTIVO …c0f0
--   clientes …d001-d004, leads …e001-e004 (L1 de SDR1, L2 de SDR2, L3 de SDR3, L4 del inactivo)
begin;

-- ---------- Fixtures (como postgres: saltea la RLS) ----------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000c001', 'crm-sdr1@prueba.test',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c002', 'crm-sdr2@prueba.test',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c003', 'crm-sdr3@prueba.test',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c0a0', 'crm-admin@prueba.test',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c0f0', 'crm-inactivo@prueba.test', 'authenticated', 'authenticated');

insert into public.users (id, email, nombre, iniciales, color, rol, activo) values
  ('00000000-0000-4000-8000-00000000c001', 'crm-sdr1@prueba.test',     'SDR Uno',  'S1', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c002', 'crm-sdr2@prueba.test',     'SDR Dos',  'S2', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c003', 'crm-sdr3@prueba.test',     'SDR Tres', 'S3', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c0a0', 'crm-admin@prueba.test',    'Admin',    'AD', '#888888', 'SUPERADMIN', true),
  ('00000000-0000-4000-8000-00000000c0f0', 'crm-inactivo@prueba.test', 'Inactivo', 'IN', '#888888', 'SDR',        false);

insert into public.crm_clients (id, first_name, company_name, phone, email) values
  ('00000000-0000-4000-8000-00000000d001', 'Uno',    'Inmo Uno',    '+99900000001', 'c1@prueba.test'),
  ('00000000-0000-4000-8000-00000000d002', 'Dos',    'Inmo Dos',    '+99900000002', 'c2@prueba.test'),
  ('00000000-0000-4000-8000-00000000d003', 'Tres',   'Inmo Tres',   '+99900000003', 'c3@prueba.test'),
  ('00000000-0000-4000-8000-00000000d004', 'Cuatro', 'Inmo Cuatro', '+99900000004', 'c4@prueba.test');

insert into public.crm_leads (id, client_id, assigned_to, funnel_stage_id) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c002',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)),
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c003',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)),
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000c0f0',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1));

insert into public.crm_tasks (id, lead_id, title, assigned_to) values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000e002', 'Llamar',         '00000000-0000-4000-8000-00000000c002'),
  ('00000000-0000-4000-8000-00000000f002', null,                                   'Suelta de SDR2', '00000000-0000-4000-8000-00000000c002');
insert into public.crm_comments (lead_id, description) values
  ('00000000-0000-4000-8000-00000000e002', 'comentario de SDR2');
insert into public.crm_meetings (id, lead_id, assigned_to, starts_at, ends_at) values
  ('00000000-0000-4000-8000-00000000f101', null, '00000000-0000-4000-8000-00000000c002', now(), now() + interval '1 hour');

-- ---------- 1. Un SDR sin accesos ve solo su cartera y no escribe en otra ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.crm_leads where id::text like '00000000-0000-4000-8000-00000000e00%';
  if n <> 1 then raise exception 'FALLO (1a): SDR1 sin accesos ve % leads de prueba, esperaba 1 (el suyo)', n; end if;
  select count(*) into n from public.crm_clients where id::text like '00000000-0000-4000-8000-00000000d00%';
  if n <> 1 then raise exception 'FALLO (1b): SDR1 sin accesos ve % clientes de prueba, esperaba 1', n; end if;
  select count(*) into n from public.crm_tasks where id::text like '00000000-0000-4000-8000-00000000f00%';
  if n <> 0 then raise exception 'FALLO (1c): SDR1 ve % tareas de SDR2 (con y sin lead)', n; end if;
  select count(*) into n from public.crm_meetings where id = '00000000-0000-4000-8000-00000000f101';
  if n <> 0 then raise exception 'FALLO (1d): SDR1 ve la reunión sin lead de SDR2'; end if;
  select count(*) into n from public.crm_comments where lead_id = '00000000-0000-4000-8000-00000000e002';
  if n <> 0 then raise exception 'FALLO (1e): SDR1 ve comentarios de un lead ajeno'; end if;
  update public.crm_leads set discard_reason = 'x' where id = '00000000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (1f): SDR1 actualizó un lead ajeno'; end if;
end $$;
do $$
declare ok boolean := false;
begin
  begin
    insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e002', 'intruso');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (1g): SDR1 comentó en un lead ajeno'; end if;
end $$;
reset role;

-- ---------- 2. Con `read` ve pero no escribe ----------
insert into public.crm_data_access (viewer_id, subject_id, access) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'read');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.crm_leads where id::text like '00000000-0000-4000-8000-00000000e00%';
  if n <> 2 then raise exception 'FALLO (2a): con read sobre SDR2, SDR1 ve % leads, esperaba 2', n; end if;
  select count(*) into n from public.crm_clients where id::text like '00000000-0000-4000-8000-00000000d00%';
  if n <> 2 then raise exception 'FALLO (2b): con read, SDR1 ve % clientes, esperaba 2', n; end if;
  select count(*) into n from public.crm_tasks where id::text like '00000000-0000-4000-8000-00000000f00%';
  if n <> 2 then raise exception 'FALLO (2c): con read, SDR1 ve % tareas de SDR2, esperaba 2 (con y sin lead)', n; end if;
  select count(*) into n from public.crm_meetings where id = '00000000-0000-4000-8000-00000000f101';
  if n <> 1 then raise exception 'FALLO (2d): con read, SDR1 no ve la reunión sin lead de SDR2'; end if;
  select count(*) into n from public.crm_data_access;
  if n <> 1 then raise exception 'FALLO (2e): SDR1 ve % filas de crm_data_access, esperaba solo la suya', n; end if;
  update public.crm_leads set discard_reason = 'x' where id = '00000000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (2f): con read, SDR1 actualizó el lead de SDR2'; end if;
  begin
    insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e002', 'solo miro');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (2g): con read, SDR1 comentó en el lead de SDR2'; end if;
end $$;
reset role;

-- ---------- 3. Con `write` escribe ----------
update public.crm_data_access set access = 'write'
 where viewer_id = '00000000-0000-4000-8000-00000000c001' and subject_id = '00000000-0000-4000-8000-00000000c002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int;
begin
  update public.crm_leads set discard_reason = null where id = '00000000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (3a): con write, SDR1 no pudo actualizar el lead de SDR2'; end if;
  insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e002', 'con permiso');
  insert into public.crm_tasks (lead_id, title, assigned_to) values (null, 'Suelta para SDR2', '00000000-0000-4000-8000-00000000c002');
  update public.crm_clients set notes = 'editado' where id = '00000000-0000-4000-8000-00000000d002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (3b): con write, SDR1 no pudo editar el cliente de SDR2'; end if;
end $$;
reset role;

-- ---------- 4. Reasignar exige write en la cartera vieja y en la nueva ----------
-- SDR1 tiene write sobre SDR2 y nada sobre SDR3.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  begin
    update public.crm_leads set assigned_to = '00000000-0000-4000-8000-00000000c003'
     where id = '00000000-0000-4000-8000-00000000e001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (4a): SDR1 le pasó su lead a SDR3 sin write sobre SDR3'; end if;

  update public.crm_leads set assigned_to = '00000000-0000-4000-8000-00000000c001'
   where id = '00000000-0000-4000-8000-00000000e003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (4b): SDR1 se quedó con el lead de SDR3 sin permiso sobre SDR3'; end if;

  update public.crm_leads set assigned_to = '00000000-0000-4000-8000-00000000c002'
   where id = '00000000-0000-4000-8000-00000000e001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (4c): SDR1 no pudo pasarle su lead a SDR2 teniendo write sobre SDR2'; end if;
end $$;
reset role;

-- ---------- 5. Un SDR no toca el catálogo, los historiales ni crm_data_access ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.crm_funnel_stages;
  if n = 0 then raise exception 'FALLO (5a): un SDR no puede LEER el funnel'; end if;
  update public.crm_funnel_stages set label = label where value = 'NEW';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (5b): un SDR editó una etapa del funnel'; end if;

  ok := false;
  begin insert into public.crm_channels (label) values ('canal intruso');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5c): un SDR creó un canal'; end if;

  ok := false;
  begin insert into public.crm_priorities (name, color) values ('intrusa', '#000000');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5d): un SDR creó una prioridad'; end if;

  -- El caso que importa: darse permiso a sí mismo sobre otra cartera.
  ok := false;
  begin insert into public.crm_data_access (viewer_id, subject_id, access)
        values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c003', 'write');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5e): un SDR se concedió acceso a otra cartera'; end if;

  delete from public.crm_data_access where viewer_id = '00000000-0000-4000-8000-00000000c001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (5f): un SDR borró filas de crm_data_access'; end if;

  ok := false;
  begin insert into public.crm_stage_history (lead_id, to_stage_id)
        values ('00000000-0000-4000-8000-00000000e002', (select id from public.crm_funnel_stages limit 1));
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5g): un SDR escribió el historial de etapas a mano'; end if;
end $$;
reset role;

-- ---------- 6. Un SUPERADMIN ve y edita todo, catálogo incluido ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0a0","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.crm_leads where id::text like '00000000-0000-4000-8000-00000000e00%';
  if n <> 4 then raise exception 'FALLO (6a): el SUPERADMIN ve % leads de prueba, esperaba 4', n; end if;
  insert into public.crm_channels (label) values ('canal del admin');
  update public.crm_funnel_stages set label = label where value = 'NEW';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'FALLO (6b): el SUPERADMIN no pudo editar una etapa'; end if;
  insert into public.crm_data_access (viewer_id, subject_id, access)
  values ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000c001', 'read');
  -- Un cliente sin ningún lead, creado por nadie: solo el SUPERADMIN puede verlo y editarlo.
  insert into public.crm_clients (id, first_name, company_name, phone, email)
  values ('00000000-0000-4000-8000-00000000d005', 'Cinco', 'Inmo Sin Lead', '+99900000005', 'c5@prueba.test');
  select count(*) into n from public.crm_clients where id = '00000000-0000-4000-8000-00000000d005';
  if n <> 1 then raise exception 'FALLO (6c): el SUPERADMIN no ve un cliente sin leads'; end if;
  update public.crm_clients set notes = 'admin' where id = '00000000-0000-4000-8000-00000000d005';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (6d): el SUPERADMIN no pudo editar un cliente sin leads'; end if;
end $$;
reset role;

-- ---------- 7. Un usuario inactivo no puede nada, ni sobre su propia cartera ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0f0","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.crm_leads where id = '00000000-0000-4000-8000-00000000e004';
  if n <> 0 then raise exception 'FALLO (7a): un inactivo ve su propio lead'; end if;
  select count(*) into n from public.crm_funnel_stages;
  if n <> 0 then raise exception 'FALLO (7b): un inactivo lee el catálogo'; end if;
  begin
    insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e004', 'fantasma');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (7c): un inactivo comentó'; end if;
end $$;
reset role;

-- ---------- 8. La RPC de alta ----------
-- A esta altura SDR1 tiene write sobre SDR2 (caso 3) y nada sobre SDR3. El cliente d003 es de
-- un lead de SDR3: SDR1 no lo ve, y aun así la RPC tiene que encontrarlo y reutilizarlo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare r json; ok boolean; n int;
begin
  -- 8a: reutiliza un cliente ajeno por teléfono
  r := public.crm_create_lead_with_client(
    p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
    p_first_name := 'Otro nombre', p_phone := '+99900000003');
  if (r->>'client_reused')::boolean is distinct from true
     or (r->>'client_id')::uuid <> '00000000-0000-4000-8000-00000000d003' then
    raise exception 'FALLO (8a): no reutilizó el cliente ajeno por teléfono: %', r;
  end if;

  -- 8b: la tarea «Asesorar cliente», del responsable, con la fecha que mandó el front
  select count(*) into n from public.crm_tasks
   where lead_id = (r->>'lead_id')::uuid and title = 'Asesorar cliente'
     and due_date = date '2026-10-01' and assigned_to = '00000000-0000-4000-8000-00000000c001';
  if n <> 1 then raise exception 'FALLO (8b): la tarea inicial no quedó bien (encontradas: %)', n; end if;

  -- 8c: el mismo cliente con el mismo responsable es un duplicado
  ok := false;
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
      p_email := 'C3@prueba.test');
  exception when others then ok := sqlerrm = 'crm_lead_duplicado';
  end;
  if not ok then raise exception 'FALLO (8c): no rechazó el duplicado cliente+responsable (por email, sin distinguir mayúsculas)'; end if;

  -- 8d: sin write sobre la cartera destino
  ok := false;
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c003', p_initial_task_due_date := date '2026-10-01',
      p_phone := '+99900000099');
  exception when others then ok := sqlerrm = 'crm_sin_permiso_cartera';
  end;
  if not ok then raise exception 'FALLO (8d): cargó un lead en una cartera sin write'; end if;

  -- 8e: sin teléfono ni email no hay con qué deduplicar
  ok := false;
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
      p_company_name := 'Sin contacto', p_phone := '  ', p_email := '');
  exception when others then ok := sqlerrm = 'crm_falta_contacto';
  end;
  if not ok then raise exception 'FALLO (8e): aceptó un alta sin teléfono ni email'; end if;

  -- 8f: cliente nuevo en una cartera con write (SDR2)
  r := public.crm_create_lead_with_client(
    p_assigned_to := '00000000-0000-4000-8000-00000000c002', p_initial_task_due_date := date '2026-10-01',
    p_company_name := 'Inmo Nueva', p_email := 'nueva@prueba.test');
  if (r->>'client_reused')::boolean is distinct from false then
    raise exception 'FALLO (8f): un cliente nuevo salió como reutilizado: %', r;
  end if;
end $$;
reset role;

-- 8g: un inactivo no puede dar de alta
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0f0","role":"authenticated"}';
do $$
declare ok boolean := false;
begin
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c0f0', p_initial_task_due_date := date '2026-10-01',
      p_phone := '+99900000098');
  exception when others then ok := sqlerrm = 'crm_sin_acceso';
  end;
  if not ok then raise exception 'FALLO (8g): un inactivo dio de alta un lead'; end if;
end $$;
reset role;

-- 8h: anon ni siquiera la puede ejecutar
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
      p_phone := '+99900000097');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (8h): anon puede ejecutar la RPC de alta'; end if;
end $$;
reset role;

-- ---------- 9. Borrar un cliente es solo del SUPERADMIN ----------
-- Desde 8a SDR1 tiene un lead sobre d003, el cliente que comparte con el lead e003 de SDR3 (sobre
-- quien SDR1 no tiene nada). Con write sobre SU lead podía editar el cliente; si además pudiera
-- borrarlo, el `on delete cascade` de crm_leads —que corre por fuera de la RLS— se llevaría el
-- lead de SDR3 con sus tareas y comentarios.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.crm_clients where id = '00000000-0000-4000-8000-00000000d003';
  if n <> 1 then raise exception 'FALLO (9a): SDR1 no ve el cliente d003 a través de su lead (premisa del caso)'; end if;
  begin
    delete from public.crm_clients where id = '00000000-0000-4000-8000-00000000d003';
    get diagnostics n = row_count;
    ok := n = 0;
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (9b): SDR1 borró un cliente compartido con otra cartera'; end if;
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.crm_leads where id = '00000000-0000-4000-8000-00000000e003') then
    raise exception 'FALLO (9c): el lead de SDR3 desapareció al intentar borrar su cliente';
  end if;
end $$;

-- El SUPERADMIN sí borra (d005, el cliente sin leads del caso 6).
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0a0","role":"authenticated"}';
do $$
declare n int;
begin
  delete from public.crm_clients where id = '00000000-0000-4000-8000-00000000d005';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (9d): el SUPERADMIN no pudo borrar un cliente'; end if;
end $$;
reset role;

select 'crm-permisos: OK' as resultado;
rollback;
