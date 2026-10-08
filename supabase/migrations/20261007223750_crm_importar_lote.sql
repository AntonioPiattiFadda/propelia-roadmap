-- Importar un lote de inmobiliarias desde el Excel (formato BCN-S01). Diseño en
-- docs/superpowers/specs/2026-10-07-crm-importar-lote-design.md. Es el mismo bloque que está en
-- supabase/schema.sql.

-- ---------- Columnas nuevas y catálogo de CRMs ----------

-- El link a la ficha de Google Maps de la inmobiliaria: reseñas, horarios, fotos de la oficina.
alter table public.crm_clients add column if not exists google_maps_url text;

-- Para comparar textos escritos por personas distintas: «Moderna Gestió» = «MODERNA GESTIO»,
-- «Mobilia » = «mobilia». Sin la extensión unaccent (no está instalada): las tildes del
-- castellano y el catalán a mano. Vacío es null.
create or replace function public.crm_normalizar(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+', ' ', 'g')), '')
$$;

-- La clave de una ficha de Idealista: la misma URL con o sin https, www o barra final.
create or replace function public.crm_url_clave(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))),
    '^[a-z]+://(www\.)?', ''), '/+$', ''), '')
$$;

-- Todos los teléfonos españoles (+34 y 9 cifras) que aparecen en un texto, sin repetir.
create or replace function public.crm_telefonos(p text) returns text[]
language sql immutable as $$
  select coalesce(array(select distinct m[1] from regexp_matches(coalesce(p, ''), '(\+34[0-9]{9})', 'g') m), '{}')
$$;

-- Los renglones de una sección del research del Excel: lo que va entre el título
-- («PERSONAS DE LA EMPRESA») y el primer renglón en blanco.
create or replace function public.crm_lineas_de_seccion(p_texto text, p_titulo text) returns text[]
language sql immutable as $$
  select coalesce(array(
    select btrim(l) from unnest(string_to_array(
      substring(coalesce(p_texto, '') from p_titulo || E'\n(.*?)(?:\n[ \t]*\n|$)'), E'\n')) l
    where btrim(l) <> ''), '{}')
$$;

-- Cada inmobiliaria usa UN CRM. Es catálogo: lo lee cualquiera y lo edita un SUPERADMIN (el
-- import, que es security definer, agrega los que encuentra). Soft delete, como el resto.
create table if not exists public.crm_software (
  id         uuid primary key default gen_random_uuid(),
  label      text not null check (btrim(label) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- «Mobilia» y «MOBILIA» son el mismo; «Mobilia» y «Mobilia Gestion» no se juntan solos.
create unique index if not exists crm_software_label_active_uidx
  on public.crm_software (public.crm_normalizar(label)) where deleted_at is null;

drop trigger if exists crm_software_set_updated_at on public.crm_software;
create trigger crm_software_set_updated_at before update on public.crm_software
  for each row execute function public.set_updated_at();

alter table public.crm_software enable row level security;
drop policy if exists crm_software_leer on public.crm_software;
drop policy if exists crm_software_escribir on public.crm_software;
create policy crm_software_leer on public.crm_software for select using (public.es_usuario());
create policy crm_software_escribir on public.crm_software for all
  using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- `current_crm` (texto libre) queda sin uso: lo que vale es la etiqueta.
alter table public.crm_clients add column if not exists current_crm_id uuid
  references public.crm_software(id) on delete set null;

-- ---------- Una inmobiliaria no se repite ----------

-- Una inmobiliaria es una ficha de Idealista: dos clientes vivos con la misma no pueden existir.
create unique index if not exists crm_clients_idealista_url_active_uidx
  on public.crm_clients (public.crm_url_clave(idealista_url))
  where deleted_at is null and public.crm_url_clave(idealista_url) is not null;

-- Y un cliente tiene UN lead, sea de quien sea. Antes era uno por comercial
-- (client_id, assigned_to), como en el producto.
drop index if exists public.crm_leads_client_assignee_active_uidx;
create unique index if not exists crm_leads_client_active_uidx
  on public.crm_leads (client_id) where deleted_at is null;

-- El alta a mano: el chequeo de duplicado pasa a ser por cliente, sin mirar el responsable.
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

  insert into public.crm_tasks (lead_id, title, due_date, assigned_to, created_by)
  values (v_lead_id, 'Asesorar cliente', p_initial_task_due_date, p_assigned_to, auth.uid());

  return json_build_object('lead_id', v_lead_id, 'client_id', v_client_id, 'client_reused', v_reused);
end;
$$;

-- ---------- El import: crm_importar_lote ----------
-- Recibe las filas ya validadas por el front (src/pages/crm/lib/importarLote.ts) y, en una sola
-- transacción, crea los clientes y sus leads asignados a `p_assigned_to`. Solo SUPERADMIN.
-- Con `p_simular` hace TODO el trabajo y lo deshace al final: el preview cuenta exactamente lo
-- que va a pasar, incluidas las repetidas dentro del mismo archivo.
--
-- Por cada fila, una de cuatro:
--   nueva            — la ficha de Idealista no existe: cliente + lead nuevos.
--   posible_repetida — no existe la ficha, pero otro cliente comparte teléfono, email o nombre:
--                      se crea igual, con el aviso arriba de todo en el consejo del SDR.
--   contactos_nuevos — la ficha ya existe y la fila trae contactos que no estaban: se agregan
--                      al final de su consejo. No se pisa nada ni se crea otro lead.
--   sin_novedad      — la ficha ya existe y no trae ningún contacto nuevo: se saltea.
-- El teléfono de Idealista no cuenta como contacto nuevo: es un redirector y rota.
create or replace function public.crm_importar_lote(
  p_assigned_to uuid,
  p_filas       jsonb,
  p_simular     boolean default true
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_stage_id    uuid;
  v_fila        jsonb;
  v_resultados  jsonb := '[]'::jsonb;
  v_etiquetas   jsonb := '[]'::jsonb;
  v_respuesta   json;
  v_existente   public.crm_clients%rowtype;
  v_research    text;
  v_email       text;
  v_nombre      text;
  v_tels        text[];
  v_tels_viejos text[];
  v_lineas      text[];
  v_linea       text;
  v_tel         text;
  v_conocido    text;
  v_aviso       text;
  v_parecida    uuid;
  v_motivos     text[];
  v_crm         text;
  v_crm_id      uuid;
  v_client_id   uuid;
  v_email_carga text;
  v_lote        text;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_sin_acceso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_assigned_to and activo) then
    raise exception 'crm_responsable_inactivo';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'crm_lote_vacio';
  end if;
  if jsonb_array_length(p_filas) > 2000 then
    raise exception 'crm_lote_grande';
  end if;
  select id into v_stage_id from public.crm_funnel_stages
   where deleted_at is null order by (value = 'NEW') desc, position asc limit 1;

  -- Los contactos de todos los clientes vivos, calculados una sola vez: buscarlos fila por fila
  -- recorrería la tabla entera con regex 300 veces. Las inserciones del lote se suman acá.
  create temp table if not exists crm_import_contactos (
    client_id uuid not null, tipo text not null, valor text not null
  ) on commit drop;
  truncate crm_import_contactos;
  insert into crm_import_contactos
  select c.id, 'tel', t from public.crm_clients c,
         unnest(public.crm_telefonos(concat_ws(' ', c.phone, c.alternative_phone_1, c.alternative_phone_2,
                                               c.google_maps_phone, c.sdr_advice))) t
   where c.deleted_at is null
  union all
  select c.id, 'email', lower(btrim(c.email)) from public.crm_clients c
   where c.deleted_at is null and nullif(btrim(c.email), '') is not null
  union all
  select c.id, 'nombre', public.crm_normalizar(c.company_name) from public.crm_clients c
   where c.deleted_at is null and public.crm_normalizar(c.company_name) is not null;

  begin
    for v_fila in select * from jsonb_array_elements(p_filas) loop
      v_research := nullif(btrim(v_fila->>'sdr_research'), '');
      v_email    := lower(nullif(btrim(v_fila->>'email'), ''));
      v_nombre   := public.crm_normalizar(v_fila->>'company_name');
      v_lote     := nullif(btrim(v_fila->>'import_batch'), '');
      -- Los teléfonos de la fila: el de Google Maps y todos los del research. NO el de Idealista.
      v_tels     := public.crm_telefonos(concat_ws(' ', v_fila->>'google_maps_phone', v_research));

      select * into v_existente from public.crm_clients
       where deleted_at is null
         and public.crm_url_clave(idealista_url) = public.crm_url_clave(v_fila->>'idealista_url')
       limit 1;

      if found then
        -- ===== La ficha ya existe: solo se suman los contactos que no estaban =====
        v_tels_viejos := public.crm_telefonos(concat_ws(' ', v_existente.phone, v_existente.alternative_phone_1,
          v_existente.alternative_phone_2, v_existente.google_maps_phone, v_existente.idealista_phone,
          v_existente.sdr_advice));
        v_conocido := ' ' || coalesce(public.crm_normalizar(concat_ws(' ', v_existente.first_name,
          v_existente.last_name, v_existente.sdr_advice)), '') || ' ';
        v_lineas := '{}';

        -- Los renglones de teléfonos que traen un número nuevo, tal como los escribió el research.
        foreach v_linea in array public.crm_lineas_de_seccion(v_research, 'TELEFONOS DE CONTACTO') loop
          if exists (select 1 from unnest(public.crm_telefonos(v_linea)) t where t <> all (v_tels_viejos)) then
            v_lineas := v_lineas || v_linea;
          end if;
        end loop;
        -- El de Google Maps no figura en el research (ahí van los «adicionales»).
        v_tel := nullif(btrim(v_fila->>'google_maps_phone'), '');
        if v_tel is not null and v_tel <> all (v_tels_viejos)
           and not exists (select 1 from unnest(v_lineas) l where position(v_tel in l) > 0) then
          v_lineas := v_lineas || (v_tel || ' | Ficha de Google Maps');
        end if;
        -- Las personas que no se nombran en ningún lado de lo que ya hay.
        foreach v_linea in array public.crm_lineas_de_seccion(v_research, 'PERSONAS DE LA EMPRESA') loop
          if public.crm_normalizar(split_part(v_linea, '|', 1)) is not null
             and position(' ' || public.crm_normalizar(split_part(v_linea, '|', 1)) || ' ' in v_conocido) = 0 then
            v_lineas := v_lineas || v_linea;
          end if;
        end loop;
        if v_email is not null and v_email is distinct from lower(btrim(v_existente.email))
           and position(v_email in lower(coalesce(v_existente.sdr_advice, ''))) = 0 then
          v_lineas := v_lineas || v_email;
        end if;

        if cardinality(v_lineas) = 0 then
          v_resultados := v_resultados || jsonb_build_object('fila', v_fila->'fila',
            'empresa', v_fila->>'company_name', 'resultado', 'sin_novedad', 'detalle', null);
        else
          update public.crm_clients
             set sdr_advice = concat_ws(E'\n\n', nullif(btrim(sdr_advice), ''),
                   'NUEVOS CONTACTOS (lote ' || coalesce(v_lote, '¿?') || ', '
                   || to_char(coalesce((v_fila->>'batch_activated_on')::date, current_date), 'DD/MM/YYYY') || ')'
                   || E'\n' || array_to_string(v_lineas, E'\n'))
           where id = v_existente.id;
          v_resultados := v_resultados || jsonb_build_object('fila', v_fila->'fila',
            'empresa', v_fila->>'company_name', 'resultado', 'contactos_nuevos',
            'detalle', array_to_string(v_lineas, ' · '));
        end if;
        continue;
      end if;

      -- ===== Ficha nueva: ¿se parece a otra que ya está? =====
      select k.client_id,
             array_agg(distinct case k.tipo when 'tel' then 'el teléfono ' || k.valor
                                            when 'email' then 'el email ' || k.valor
                                            else 'el nombre' end)
        into v_parecida, v_motivos
        from crm_import_contactos k
       where (k.tipo = 'tel' and k.valor = any (v_tels))
          or (k.tipo = 'email' and k.valor = v_email)
          or (k.tipo = 'nombre' and k.valor = v_nombre)
       group by k.client_id
       order by count(*) desc
       limit 1;

      v_aviso := null;
      v_email_carga := v_email;
      if v_parecida is not null then
        select 'POSIBLE REPETIDA de «' || coalesce(c.company_name, 'sin nombre') || '»'
               || coalesce(' (lead de ' || (select u.nombre from public.crm_leads l
                                              join public.users u on u.id = l.assigned_to
                                             where l.client_id = c.id and l.deleted_at is null limit 1) || ')', '')
               || ': comparten ' || array_to_string(v_motivos, ', ')
               || '. Verificá que no sea la misma inmobiliaria.'
          into v_aviso
          from public.crm_clients c where c.id = v_parecida;
        -- El email es único entre los clientes vivos: si ya lo tiene otro, acá no se carga.
        if v_email is not null and exists (select 1 from public.crm_clients
             where deleted_at is null and lower(btrim(email)) = v_email) then
          v_email_carga := null;
          v_aviso := v_aviso || ' El email ' || v_email || ' ya lo tiene esa inmobiliaria: no se cargó acá.';
        end if;
      end if;

      -- La etiqueta del CRM. «Sin identificar» no es un CRM: es no saberlo.
      v_crm := nullif(btrim(v_fila->>'current_crm'), '');
      if public.crm_normalizar(v_crm) = 'sin identificar' then v_crm := null; end if;
      v_crm_id := null;
      if v_crm is not null then
        select id into v_crm_id from public.crm_software
         where deleted_at is null and public.crm_normalizar(label) = public.crm_normalizar(v_crm);
        if v_crm_id is null then
          insert into public.crm_software (label) values (v_crm) returning id into v_crm_id;
          v_etiquetas := v_etiquetas || to_jsonb(v_crm);
        end if;
      end if;

      insert into public.crm_clients (
        company_name, first_name, last_name, contact_role, email, website,
        idealista_url, google_maps_url, google_maps_phone, idealista_phone,
        idealista_listings, idealista_years, city, neighborhood, office_address, agents_count,
        current_crm_id, selection_reason, import_batch, batch_activated_on, sdr_advice, created_by)
      values (
        nullif(btrim(v_fila->>'company_name'), ''), nullif(btrim(v_fila->>'first_name'), ''),
        nullif(btrim(v_fila->>'last_name'), ''), nullif(btrim(v_fila->>'contact_role'), ''),
        v_email_carga, nullif(btrim(v_fila->>'website'), ''),
        nullif(btrim(v_fila->>'idealista_url'), ''), nullif(btrim(v_fila->>'google_maps_url'), ''),
        nullif(btrim(v_fila->>'google_maps_phone'), ''), nullif(btrim(v_fila->>'idealista_phone'), ''),
        (v_fila->>'idealista_listings')::integer, (v_fila->>'idealista_years')::integer,
        nullif(btrim(v_fila->>'city'), ''), nullif(btrim(v_fila->>'neighborhood'), ''),
        nullif(btrim(v_fila->>'office_address'), ''), (v_fila->>'agents_count')::integer,
        v_crm_id, nullif(btrim(v_fila->>'selection_reason'), ''), v_lote,
        (v_fila->>'batch_activated_on')::date,
        concat_ws(E'\n\n', v_aviso, v_research), auth.uid())
      returning id into v_client_id;

      insert into public.crm_leads (client_id, assigned_to, funnel_stage_id, created_via, created_by)
      values (v_client_id, p_assigned_to, v_stage_id, 'import', auth.uid());

      -- Lo que se acaba de crear también cuenta para las filas que siguen del mismo archivo.
      insert into crm_import_contactos
      select v_client_id, 'tel', t from unnest(v_tels) t
      union all select v_client_id, 'email', v_email_carga where v_email_carga is not null
      union all select v_client_id, 'nombre', v_nombre where v_nombre is not null;

      v_resultados := v_resultados || jsonb_build_object('fila', v_fila->'fila',
        'empresa', v_fila->>'company_name',
        'resultado', case when v_aviso is null then 'nueva' else 'posible_repetida' end,
        'detalle', v_aviso);
    end loop;

    v_respuesta := json_build_object('filas', v_resultados, 'etiquetas_nuevas', v_etiquetas,
                                     'simulado', p_simular);
    -- Las variables de plpgsql no son transaccionales: la respuesta sobrevive al rollback.
    if p_simular then
      raise exception 'crm_import_simulacro';
    end if;
  exception when raise_exception then
    if sqlerrm = 'crm_import_simulacro' then
      return v_respuesta;
    end if;
    raise;
  end;
  return v_respuesta;
end;
$$;

revoke all on function public.crm_importar_lote(uuid, jsonb, boolean) from public, anon;
grant execute on function public.crm_importar_lote(uuid, jsonb, boolean) to authenticated;
