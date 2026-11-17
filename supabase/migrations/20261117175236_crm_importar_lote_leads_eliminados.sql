-- crm_importar_lote: un lead eliminado es como si no existiera (17/11/2026, por pedido).
-- Antes, la inmobiliaria de un lead eliminado seguía viva y el import la tomaba como repetida:
-- no le creaba lead y no volvía a la lista. Ahora se le da de baja y la fila entra como nueva.

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
--
-- Un lead eliminado (`deleted_at`) es como si no existiera (17/11/2026, por pedido), y con él su
-- inmobiliaria: un cliente sin ningún lead vivo no es «repetida» ni «posible repetida». Si la fila
-- trae su ficha o su email, el cliente huérfano se da de baja (soft delete, para liberar los
-- índices únicos) y la fila entra como nueva, con cliente y lead de cero.
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
  v_huerfanos   integer;
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

  -- Los contactos de todos los clientes vivos con un lead vivo, calculados una sola vez: buscarlos
  -- fila por fila recorrería la tabla entera con regex 300 veces. Las inserciones del lote se suman acá.
  create temp table if not exists crm_import_contactos (
    client_id uuid not null, tipo text not null, valor text not null
  ) on commit drop;
  truncate crm_import_contactos;
  insert into crm_import_contactos
  with vivos as (
    select c.* from public.crm_clients c
     where c.deleted_at is null
       and exists (select 1 from public.crm_leads l where l.client_id = c.id and l.deleted_at is null)
  )
  select c.id, 'tel', t from vivos c,
         unnest(public.crm_telefonos(concat_ws(' ', c.phone, c.alternative_phone_1, c.alternative_phone_2,
                                               c.google_maps_phone, c.sdr_advice))) t
  union all
  select c.id, 'email', lower(btrim(c.email)) from vivos c
   where nullif(btrim(c.email), '') is not null
  union all
  select c.id, 'nombre', public.crm_normalizar(c.company_name) from vivos c
   where public.crm_normalizar(c.company_name) is not null;

  begin
    for v_fila in select * from jsonb_array_elements(p_filas) loop
      v_research := nullif(btrim(v_fila->>'sdr_research'), '');
      v_email    := lower(nullif(btrim(v_fila->>'email'), ''));
      v_nombre   := public.crm_normalizar(v_fila->>'company_name');
      v_lote     := nullif(btrim(v_fila->>'import_batch'), '');
      -- Los teléfonos de la fila: el de Google Maps y todos los del research. NO el de Idealista.
      v_tels     := public.crm_telefonos(concat_ws(' ', v_fila->>'google_maps_phone', v_research));

      -- La inmobiliaria cuyo lead se eliminó cuenta como eliminada: se le da de baja, así la ficha
      -- y el email quedan libres y la fila entra como nueva.
      update public.crm_clients c set deleted_at = now()
       where c.deleted_at is null
         and not exists (select 1 from public.crm_leads l where l.client_id = c.id and l.deleted_at is null)
         and (public.crm_url_clave(c.idealista_url) = public.crm_url_clave(v_fila->>'idealista_url')
              or (v_email is not null and lower(btrim(c.email)) = v_email));
      get diagnostics v_huerfanos = row_count;

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
        'detalle', nullif(concat_ws(' ', v_aviso,
          case when v_huerfanos > 0 then 'Tenía un lead eliminado: entra de cero.' end), ''));
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
