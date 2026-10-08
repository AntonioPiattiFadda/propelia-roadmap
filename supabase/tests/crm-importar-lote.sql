-- Pruebas de crm_importar_lote (spec 2026-10-07-crm-importar-lote).
--
-- Igual que crm-permisos.sql: se corren enteras contra la base de verdad (MCP execute_sql),
-- todo pasa en una transacción que termina en ROLLBACK y cada afirmación es un DO que tira
-- `FALLO (…)`. Si llega al final, devuelve `crm-importar-lote: OK`.
--
-- Uuids con la marca c0de, imposibles en la base real:
--   ADMIN …c0a0 (SUPERADMIN), SDR …c001. Clientes …d001 (ficha «prueba-existe», con lead del
--   SDR) y …d002 («Inmo Parecida», comparte el +34600000009).
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000c0a0', 'imp-admin@prueba.test', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c001', 'imp-sdr@prueba.test',   'authenticated', 'authenticated');
insert into public.users (id, email, nombre, iniciales, color, rol, activo) values
  ('00000000-0000-4000-8000-00000000c0a0', 'imp-admin@prueba.test', 'Admin Prueba', 'AP', '#888888', 'SUPERADMIN', true),
  ('00000000-0000-4000-8000-00000000c001', 'imp-sdr@prueba.test',   'SDR Prueba',   'SP', '#888888', 'SDR',        true);

insert into public.crm_clients (id, company_name, idealista_url, google_maps_phone, sdr_advice) values
  ('00000000-0000-4000-8000-00000000d001', 'Inmo Existe', 'https://www.idealista.com/pro/prueba-existe/', '+34600000001',
   E'PERSONAS DE LA EMPRESA\nAna Uno | CEO | https://existe.test'),
  ('00000000-0000-4000-8000-00000000d002', 'Inmo Parecida', 'https://www.idealista.com/pro/prueba-parecida/', '+34600000009', null);
insert into public.crm_leads (client_id, assigned_to, funnel_stage_id) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1));

-- Una fila del lote, con el research en sus cuatro secciones.
create function pg_temp.fila(n int, empresa text, url text, gmaps text, personas text, telefonos text, crm text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'fila', n, 'company_name', empresa, 'idealista_url', url, 'google_maps_phone', gmaps,
    'idealista_phone', '+34936000000', 'idealista_listings', 3, 'idealista_years', 1, 'city', 'Barcelona',
    'current_crm', crm, 'selection_reason', 'new', 'import_batch', 'PRUEBA-01', 'batch_activated_on', '2026-10-07',
    'sdr_research', 'TIP PARA LA PRIMERA LLAMADA' || E'\nLlamá.\n\n' || 'PERSONAS DE LA EMPRESA' || E'\n' || personas
      || E'\n\n' || 'TELEFONOS DE CONTACTO' || E'\n' || telefonos || E'\n\n' || 'POR QUE SE ELIGIO' || E'\nPorque sí.')
$$;

create temp table lote as select jsonb_build_array(
  pg_temp.fila(2, 'Inmo Nueva', 'https://www.idealista.com/pro/prueba-nueva/', null,
               'Carla Tres | Directora | https://nueva.test', E'+34600000002 | Oficina | https://nueva.test', 'CRM Prueba Zeta'),
  -- La misma ficha que d001, sin www ni barra, y sin nada nuevo: se saltea.
  pg_temp.fila(3, 'INMO EXISTE', 'https://idealista.com/pro/prueba-existe', '+34600000001',
               'Ana Uno | CEO | https://existe.test', 'Sin numeros adicionales', 'Sin identificar'),
  -- Ficha nueva que comparte teléfono con d002: posible repetida.
  pg_temp.fila(4, 'Otra Parecida', 'https://www.idealista.com/pro/prueba-otra/', null,
               'Nadie Cuatro | Gerente | https://otra.test', E'+34600000009 | Oficina | https://otra.test')
) as filas;
grant select on lote to authenticated;

-- ---------- 1. Un SDR no importa ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
begin
  perform public.crm_importar_lote('00000000-0000-4000-8000-00000000c001', (select filas from lote), true);
  raise exception 'FALLO (1): un SDR pudo correr el import';
exception when others then
  if sqlerrm not like 'crm_sin_acceso%' then raise; end if;
end $$;
reset role;

-- ---------- 2. El simulacro cuenta y no escribe ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0a0","role":"authenticated"}';
do $$
declare r jsonb;
begin
  r := public.crm_importar_lote('00000000-0000-4000-8000-00000000c001', (select filas from lote), true)::jsonb;
  if r->'filas'->0->>'resultado' <> 'nueva' then raise exception 'FALLO (2a): fila 2 dio %', r->'filas'->0; end if;
  if r->'filas'->1->>'resultado' <> 'sin_novedad' then raise exception 'FALLO (2b): fila 3 dio %', r->'filas'->1; end if;
  if r->'filas'->2->>'resultado' <> 'posible_repetida' then raise exception 'FALLO (2c): fila 4 dio %', r->'filas'->2; end if;
  if r->'filas'->2->>'detalle' not like '%Inmo Parecida%+34600000009%' then
    raise exception 'FALLO (2d): el aviso no dice con quién ni qué comparte: %', r->'filas'->2->>'detalle';
  end if;
  if r->'etiquetas_nuevas' <> '["CRM Prueba Zeta"]'::jsonb then raise exception 'FALLO (2e): etiquetas %', r->'etiquetas_nuevas'; end if;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.crm_clients where idealista_url like '%prueba-nueva%') then
    raise exception 'FALLO (2f): el simulacro dejó el cliente escrito';
  end if;
  if exists (select 1 from public.crm_software where label = 'CRM Prueba Zeta') then
    raise exception 'FALLO (2g): el simulacro dejó la etiqueta escrita';
  end if;
end $$;

-- ---------- 3. El de verdad crea clientes, leads y etiqueta ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0a0","role":"authenticated"}';
select public.crm_importar_lote('00000000-0000-4000-8000-00000000c001', (select filas from lote), false);
reset role;
do $$
declare c public.crm_clients%rowtype; n int;
begin
  select * into c from public.crm_clients where idealista_url like '%prueba-nueva%';
  if c.id is null then raise exception 'FALLO (3a): no se creó la fila 2'; end if;
  if c.sdr_advice not like 'TIP PARA LA PRIMERA LLAMADA%' then raise exception 'FALLO (3b): el consejo no es el research'; end if;
  if c.current_crm_id is null or (select label from public.crm_software where id = c.current_crm_id) <> 'CRM Prueba Zeta' then
    raise exception 'FALLO (3c): la etiqueta del CRM no quedó puesta';
  end if;
  select count(*) into n from public.crm_leads
   where client_id = c.id and assigned_to = '00000000-0000-4000-8000-00000000c001' and created_via = 'import';
  if n <> 1 then raise exception 'FALLO (3d): la fila 2 tiene % leads importados para el SDR', n; end if;

  select count(*) into n from public.crm_clients where public.crm_url_clave(idealista_url) = 'idealista.com/pro/prueba-existe';
  if n <> 1 then raise exception 'FALLO (3e): la ficha existente quedó % veces', n; end if;
  if (select sdr_advice from public.crm_clients where id = '00000000-0000-4000-8000-00000000d001') like '%NUEVOS CONTACTOS%' then
    raise exception 'FALLO (3f): sin nada nuevo igual le agregó contactos';
  end if;

  select * into c from public.crm_clients where idealista_url like '%prueba-otra%';
  if c.sdr_advice not like 'POSIBLE REPETIDA de «Inmo Parecida» (lead de%' and c.sdr_advice not like 'POSIBLE REPETIDA de «Inmo Parecida»:%' then
    raise exception 'FALLO (3g): el aviso no va arriba del consejo: %', left(c.sdr_advice, 120);
  end if;
end $$;

-- ---------- 4. Reaparece con un contacto nuevo: se suma al final, no se duplica ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0a0","role":"authenticated"}';
do $$
declare r jsonb;
begin
  r := public.crm_importar_lote('00000000-0000-4000-8000-00000000c0a0', jsonb_build_array(
    pg_temp.fila(2, 'Inmo Existe', 'https://www.idealista.com/pro/prueba-existe/', '+34600000001',
                 E'Ana Uno | CEO | https://existe.test\nBeto Dos | Socio | https://existe.test',
                 E'+34600000003 | Oficina | https://existe.test')), false)::jsonb;
  if r->'filas'->0->>'resultado' <> 'contactos_nuevos' then raise exception 'FALLO (4a): dio %', r->'filas'->0; end if;
end $$;
reset role;
do $$
declare a text; n int;
begin
  select sdr_advice into a from public.crm_clients where id = '00000000-0000-4000-8000-00000000d001';
  if a not like E'PERSONAS DE LA EMPRESA\nAna Uno%' then raise exception 'FALLO (4b): se pisó el consejo de antes'; end if;
  if a not like '%NUEVOS CONTACTOS (lote PRUEBA-01, 07/10/2026)%+34600000003 | Oficina%Beto Dos | Socio%' then
    raise exception 'FALLO (4c): el bloque nuevo no está o está mal: %', a;
  end if;
  if a like '%Ana Uno | CEO%Ana Uno | CEO%' then raise exception 'FALLO (4d): repitió una persona que ya estaba'; end if;
  select count(*) into n from public.crm_leads where client_id = '00000000-0000-4000-8000-00000000d001' and deleted_at is null;
  if n <> 1 then raise exception 'FALLO (4e): la inmobiliaria quedó con % leads', n; end if;
end $$;

-- ---------- 5. Un cliente, un lead (también para el alta a mano) ----------
do $$
begin
  insert into public.crm_leads (client_id, assigned_to, funnel_stage_id) values
    ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c0a0',
     (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1));
  raise exception 'FALLO (5): un cliente quedó con dos leads';
exception when unique_violation then null;
end $$;

select 'crm-importar-lote: OK' as resultado;
rollback;
