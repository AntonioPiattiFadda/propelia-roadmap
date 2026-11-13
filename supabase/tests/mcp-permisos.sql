-- Pruebas de permisos del conector MCP (13/11/2026, por pedido: «que las tools respeten las RLS y
-- los roles de cada user»). Las vistas `mcp_*` corren como su dueño y copian la regla de la RLS
-- (docs/mcp/README.md): si alguien cambia una policy y no la vista, esto lo tiene que decir.
--
-- Como crm-permisos.sql: se corre entera contra la base de verdad (MCP execute_sql, como postgres),
-- todo en una transacción que termina en ROLLBACK (usuarios, filas y la función de ayuda
-- incluidos). Cada afirmación tira `FALLO (…)` y aborta; si llega al final devuelve
-- `mcp-permisos: OK`.
--
-- Qué prueba, para cada persona (SDR sin accesos, SDR con read sobre otro, SUPERADMIN y un
-- segundo SUPERADMIN):
--   1. Cada vista del CRM devuelve EXACTAMENTE las filas de prueba que la RLS de su tabla le
--      deja leer (ni una más, ni una menos), y que eso no es vacío por accidente.
--   2. Lo que va más allá de la RLS, por rol: roadmap, caja, altas y notas de la demo.
--   3. Los leads de prueba (`solo_para`) no salen ni para otro SUPERADMIN.
--   4. Con el token del conector (`client_id`), las tablas devuelven cero y las vistas lo mismo.
--
-- Sólo mira filas de prueba (por id o por lead, con `= any`): recorrer la tabla entera con el rol
-- `authenticated` paga la RLS de cada fila (README › Cuánto cuesta cada consulta).
--
-- Uuids fijos con la variante 9000: imposibles en la base real.
--   SDR1 …a001, SDR2 …a002, ADMIN …a0a0, ADMIN2 …a0a1 (SUPERADMIN los dos)
--   leads …c001 (SDR1), …c002 (SDR2), …c005 (de ADMIN y sólo para ADMIN)
begin;

-- ---------- Fixtures (como postgres: saltea la RLS) ----------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-9000-00000000a001', 'mcp-sdr1@prueba.test',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-9000-00000000a002', 'mcp-sdr2@prueba.test',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-9000-00000000a0a0', 'mcp-admin@prueba.test',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-9000-00000000a0a1', 'mcp-admin2@prueba.test', 'authenticated', 'authenticated');

insert into public.users (id, email, nombre, iniciales, color, rol, activo) values
  ('00000000-0000-4000-9000-00000000a001', 'mcp-sdr1@prueba.test',   'MCP SDR Uno', 'M1', '#888888', 'SDR',        true),
  ('00000000-0000-4000-9000-00000000a002', 'mcp-sdr2@prueba.test',   'MCP SDR Dos', 'M2', '#888888', 'SDR',        true),
  ('00000000-0000-4000-9000-00000000a0a0', 'mcp-admin@prueba.test',  'MCP Admin',   'MA', '#888888', 'SUPERADMIN', true),
  ('00000000-0000-4000-9000-00000000a0a1', 'mcp-admin2@prueba.test', 'MCP Admin 2', 'MB', '#888888', 'SUPERADMIN', true);

insert into public.crm_clients (id, first_name, company_name, phone, email) values
  ('00000000-0000-4000-9000-00000000b001', 'Uno',   'MCP Inmo Uno',   '+99800000001', 'mcp1@prueba.test'),
  ('00000000-0000-4000-9000-00000000b002', 'Dos',   'MCP Inmo Dos',   '+99800000002', 'mcp2@prueba.test'),
  ('00000000-0000-4000-9000-00000000b005', 'Cinco', 'MCP Inmo Cinco', '+99800000005', 'mcp5@prueba.test');

insert into public.crm_leads (id, client_id, assigned_to, funnel_stage_id, solo_para) values
  ('00000000-0000-4000-9000-00000000c001', '00000000-0000-4000-9000-00000000b001', '00000000-0000-4000-9000-00000000a001',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1), null),
  ('00000000-0000-4000-9000-00000000c002', '00000000-0000-4000-9000-00000000b002', '00000000-0000-4000-9000-00000000a002',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1), null),
  ('00000000-0000-4000-9000-00000000c005', '00000000-0000-4000-9000-00000000b005', '00000000-0000-4000-9000-00000000a0a0',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1),
   '00000000-0000-4000-9000-00000000a0a0');

insert into public.crm_tasks (id, lead_id, title, assigned_to) values
  ('00000000-0000-4000-9000-00000000d001', '00000000-0000-4000-9000-00000000c001', 'Llamar', '00000000-0000-4000-9000-00000000a001'),
  ('00000000-0000-4000-9000-00000000d002', '00000000-0000-4000-9000-00000000c002', 'Llamar', '00000000-0000-4000-9000-00000000a002'),
  ('00000000-0000-4000-9000-00000000d005', '00000000-0000-4000-9000-00000000c005', 'Llamar', '00000000-0000-4000-9000-00000000a0a0'),
  ('00000000-0000-4000-9000-00000000d0f0', null, 'Suelta de SDR2', '00000000-0000-4000-9000-00000000a002');

insert into public.crm_meetings (id, lead_id, assigned_to, starts_at, ends_at) values
  ('00000000-0000-4000-9000-00000000e001', '00000000-0000-4000-9000-00000000c001', '00000000-0000-4000-9000-00000000a001', now() + interval '1 day', now() + interval '25 hours'),
  ('00000000-0000-4000-9000-00000000e002', '00000000-0000-4000-9000-00000000c002', '00000000-0000-4000-9000-00000000a002', now() + interval '1 day', now() + interval '25 hours'),
  ('00000000-0000-4000-9000-00000000e005', '00000000-0000-4000-9000-00000000c005', '00000000-0000-4000-9000-00000000a0a0', now() + interval '1 day', now() + interval '25 hours'),
  ('00000000-0000-4000-9000-00000000e0f0', null, '00000000-0000-4000-9000-00000000a002', now() + interval '1 day', now() + interval '25 hours');

insert into public.crm_comments (lead_id, description, created_by) values
  ('00000000-0000-4000-9000-00000000c001', 'de SDR1',  '00000000-0000-4000-9000-00000000a001'),
  ('00000000-0000-4000-9000-00000000c002', 'de SDR2',  '00000000-0000-4000-9000-00000000a002'),
  ('00000000-0000-4000-9000-00000000c005', 'de prueba', '00000000-0000-4000-9000-00000000a0a0');

insert into public.crm_stage_history (lead_id, to_stage_id, changed_by)
select l.id, l.funnel_stage_id, l.assigned_to from public.crm_leads l
 where l.id in ('00000000-0000-4000-9000-00000000c001', '00000000-0000-4000-9000-00000000c002', '00000000-0000-4000-9000-00000000c005');
insert into public.crm_assignment_history (lead_id, to_user_id, changed_by)
select l.id, l.assigned_to, l.assigned_to from public.crm_leads l
 where l.id in ('00000000-0000-4000-9000-00000000c001', '00000000-0000-4000-9000-00000000c002', '00000000-0000-4000-9000-00000000c005');

insert into public.crm_emails (id, resend_id, sent_by, to_email, lead_id, status) values
  ('00000000-0000-4000-9000-00000000f001', 'mcp-prueba-1', '00000000-0000-4000-9000-00000000a001', 'x1@prueba.test', '00000000-0000-4000-9000-00000000c001', 'bounced'),
  ('00000000-0000-4000-9000-00000000f002', 'mcp-prueba-2', '00000000-0000-4000-9000-00000000a002', 'x2@prueba.test', '00000000-0000-4000-9000-00000000c002', 'bounced'),
  ('00000000-0000-4000-9000-00000000f005', 'mcp-prueba-5', '00000000-0000-4000-9000-00000000a0a0', 'x5@prueba.test', '00000000-0000-4000-9000-00000000c005', 'bounced'),
  -- Sin lead: lo ve sólo quien lo mandó.
  ('00000000-0000-4000-9000-00000000f0f0', 'mcp-prueba-f', '00000000-0000-4000-9000-00000000a002', 'xf@prueba.test', null, 'bounced');

insert into public.client_onboardings (lead_id) values
  ('00000000-0000-4000-9000-00000000c001'), ('00000000-0000-4000-9000-00000000c005');

insert into public.roadmap_notas (id, titulo, texto, orden) values
  ('demo-guion-00000000-0000-4000-9000-00000000c001', '', 'notas de la demo de SDR1', 0),
  ('demo-guion-00000000-0000-4000-9000-00000000c005', '', 'notas de la demo de prueba', 0),
  ('grupo-990001', 'MCP grupo de prueba', '', 0);
insert into public.roadmap_tareas (id, tarea, orden) values ('MCP-PRUEBA-1', 'Tarea de prueba del MCP', 0);
insert into public.expenses (id, expense_name, expense_type, amount, period) values
  ('00000000-0000-4000-9000-0000000000e1', 'Gasto de prueba del MCP', 'VARIABLE', 1, '2026-11');

-- ---------- Ayudas (se van con el rollback) ----------
-- Los ids (como texto, ordenados) de lo que devuelve `relacion` con `filtro`. Corre como quien
-- llama (invoker): con el rol `authenticated` una tabla pasa por su RLS y una vista por su corte.
create function public.mcp_prueba_ids(relacion text, filtro text)
returns text[] language plpgsql as $$
declare r text[];
begin
  execute format('select coalesce(array_agg(id::text order by id::text), ''{}'') from public.%I where %s', relacion, filtro) into r;
  return r;
end $$;

-- Para cada vista del CRM: las filas de prueba que devuelve tienen que ser las mismas que la RLS
-- deja leer de su tabla.
create function public.mcp_prueba_vistas_igual_que_rls(quien text)
returns void language plpgsql as $$
declare
  par text[];
  vista text[];
  tabla text[];
  leads text := $l$lead_id = any(array['00000000-0000-4000-9000-00000000c001','00000000-0000-4000-9000-00000000c002','00000000-0000-4000-9000-00000000c005']::uuid[])$l$;
begin
  foreach par slice 1 in array array[
    ['mcp_crm_leads', 'crm_leads', $f$id = any(array['00000000-0000-4000-9000-00000000c001','00000000-0000-4000-9000-00000000c002','00000000-0000-4000-9000-00000000c005']::uuid[])$f$],
    ['mcp_crm_tasks', 'crm_tasks', $f$id = any(array['00000000-0000-4000-9000-00000000d001','00000000-0000-4000-9000-00000000d002','00000000-0000-4000-9000-00000000d005','00000000-0000-4000-9000-00000000d0f0']::uuid[])$f$],
    ['mcp_crm_meetings', 'crm_meetings', $f$id = any(array['00000000-0000-4000-9000-00000000e001','00000000-0000-4000-9000-00000000e002','00000000-0000-4000-9000-00000000e005','00000000-0000-4000-9000-00000000e0f0']::uuid[])$f$],
    ['mcp_crm_comments', 'crm_comments', leads],
    ['mcp_crm_stage_history', 'crm_stage_history', leads],
    ['mcp_crm_assignment_history', 'crm_assignment_history', leads],
    ['mcp_crm_emails', 'crm_emails', $f$id = any(array['00000000-0000-4000-9000-00000000f001','00000000-0000-4000-9000-00000000f002','00000000-0000-4000-9000-00000000f005','00000000-0000-4000-9000-00000000f0f0']::uuid[])$f$]
  ] loop
    vista := public.mcp_prueba_ids(par[1], par[3]);
    tabla := public.mcp_prueba_ids(par[2], par[3]);
    if vista is distinct from tabla then
      raise exception 'FALLO (%: %): la vista devuelve % y la RLS de % deja leer %', quien, par[1], vista, par[2], tabla;
    end if;
  end loop;
end $$;

-- Cuántas filas de prueba devuelve una relación (para lo que corta más que la RLS).
create function public.mcp_prueba_cuantas(relacion text, filtro text)
returns int language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from public.%I where %s', relacion, filtro) into n;
  return n;
end $$;

grant execute on function public.mcp_prueba_ids(text, text), public.mcp_prueba_vistas_igual_que_rls(text),
  public.mcp_prueba_cuantas(text, text) to authenticated;

-- Lo que corta más que la RLS: esperado por persona.
--   roadmap / grupos / caja / altas: sólo SUPERADMIN. Notas de la demo: quien ve el lead.
create function public.mcp_prueba_cortes(quien text, roadmap int, caja int, altas int, notas_demo int, leads int)
returns void language plpgsql as $$
declare n int;
begin
  n := public.mcp_prueba_cuantas('mcp_roadmap_tareas', $f$id = 'MCP-PRUEBA-1'$f$);
  if n <> roadmap then raise exception 'FALLO (%: roadmap): ve % tareas del roadmap, esperaba %', quien, n, roadmap; end if;
  n := public.mcp_prueba_cuantas('mcp_roadmap_grupos', 'numero = 990001');
  if n <> roadmap then raise exception 'FALLO (%: grupos): ve % grupos del backlog, esperaba %', quien, n, roadmap; end if;
  n := public.mcp_prueba_cuantas('mcp_expenses', $f$id = '00000000-0000-4000-9000-0000000000e1'$f$);
  if n <> caja then raise exception 'FALLO (%: caja): ve % gastos, esperaba %', quien, n, caja; end if;
  n := public.mcp_prueba_cuantas('mcp_onboardings', $f$lead_id = any(array['00000000-0000-4000-9000-00000000c001','00000000-0000-4000-9000-00000000c005']::uuid[])$f$);
  if n <> altas then raise exception 'FALLO (%: altas): ve % altas, esperaba %', quien, n, altas; end if;
  n := public.mcp_prueba_cuantas('mcp_crm_demo_notas', $f$lead_id = any(array['00000000-0000-4000-9000-00000000c001','00000000-0000-4000-9000-00000000c005']::uuid[])$f$);
  if n <> notas_demo then raise exception 'FALLO (%: notas de la demo): ve %, esperaba %', quien, n, notas_demo; end if;
  -- Que la igualdad con la RLS no sea «las dos vacías» por un fixture roto.
  n := public.mcp_prueba_cuantas('mcp_crm_leads', $f$id = any(array['00000000-0000-4000-9000-00000000c001','00000000-0000-4000-9000-00000000c002','00000000-0000-4000-9000-00000000c005']::uuid[])$f$);
  if n <> leads then raise exception 'FALLO (%: leads): ve % leads de prueba, esperaba %', quien, n, leads; end if;
end $$;
grant execute on function public.mcp_prueba_cortes(text, int, int, int, int, int) to authenticated;

-- ---------- 1. SDR sin accesos: su cartera, nada por rol ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-9000-00000000a001","role":"authenticated"}';
select public.mcp_prueba_vistas_igual_que_rls('SDR1');
select public.mcp_prueba_cortes('SDR1', roadmap => 0, caja => 0, altas => 0, notas_demo => 1, leads => 1);
reset role;

-- ---------- 2. SDR con read sobre otro: suma esa cartera (y su demo, si tuviera notas) ----------
insert into public.crm_data_access (viewer_id, subject_id, access) values
  ('00000000-0000-4000-9000-00000000a001', '00000000-0000-4000-9000-00000000a002', 'read');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-9000-00000000a001","role":"authenticated"}';
select public.mcp_prueba_vistas_igual_que_rls('SDR1 con read sobre SDR2');
select public.mcp_prueba_cortes('SDR1 con read sobre SDR2', roadmap => 0, caja => 0, altas => 0, notas_demo => 1, leads => 2);
reset role;

-- ---------- 3. El otro SDR: no ve lo del primero ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-9000-00000000a002","role":"authenticated"}';
select public.mcp_prueba_vistas_igual_que_rls('SDR2');
select public.mcp_prueba_cortes('SDR2', roadmap => 0, caja => 0, altas => 0, notas_demo => 0, leads => 1);
reset role;

-- ---------- 4. SUPERADMIN dueño del lead de prueba: todo ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-9000-00000000a0a0","role":"authenticated"}';
select public.mcp_prueba_vistas_igual_que_rls('ADMIN');
select public.mcp_prueba_cortes('ADMIN', roadmap => 1, caja => 1, altas => 2, notas_demo => 2, leads => 3);
reset role;

-- ---------- 5. Otro SUPERADMIN: todo menos el lead de prueba ajeno y lo que cuelga de él ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-9000-00000000a0a1","role":"authenticated"}';
select public.mcp_prueba_vistas_igual_que_rls('ADMIN2');
select public.mcp_prueba_cortes('ADMIN2', roadmap => 1, caja => 1, altas => 1, notas_demo => 1, leads => 2);
reset role;

-- ---------- 6. Con el token del conector: las tablas, nada; las vistas, lo mismo ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-9000-00000000a0a0","role":"authenticated","client_id":"00000000-0000-4000-9000-0000000000c1"}';
do $$
declare n int;
begin
  n := public.mcp_prueba_cuantas('crm_leads', $f$id = any(array['00000000-0000-4000-9000-00000000c001','00000000-0000-4000-9000-00000000c002','00000000-0000-4000-9000-00000000c005']::uuid[])$f$);
  if n <> 0 then raise exception 'FALLO (6a): con el token del conector, la tabla crm_leads devuelve % filas', n; end if;
  n := public.mcp_prueba_cuantas('expenses', $f$id = '00000000-0000-4000-9000-0000000000e1'$f$);
  if n <> 0 then raise exception 'FALLO (6b): con el token del conector, la tabla expenses devuelve % filas', n; end if;
end $$;
select public.mcp_prueba_cortes('ADMIN por el conector', roadmap => 1, caja => 1, altas => 2, notas_demo => 2, leads => 3);
reset role;

select 'mcp-permisos: OK' as resultado;
rollback;
