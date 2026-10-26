-- Import de propiedades desde Excel para el onboarding (página /importar-propiedades, sólo
-- superadmin). El superadmin carga la cartera de una organización NUEVA, que no es la suya:
-- por eso no sirve `createProperty` (escribe en la org de quien llama) y hace falta un RPC
-- que reciba la org.
--
-- Tres piezas:
--
--   1. `resolve_sync_tasks_for_ad_in_org`: el cuerpo de `resolve_sync_tasks_for_ad` con la
--      organización como parámetro. NO se le da execute a authenticated: un definer que
--      acepta la org del que llama es un agujero. Sólo lo llaman los otros dos definers.
--   2. `resolve_sync_tasks_for_ad`: queda igual por fuera (misma firma, mismo resultado);
--      saca la org de current_organization_id() y delega en (1).
--   3. `superadmin_import_properties`: crea dirección + propiedad por fila y, si la fila trae
--      código de Idealista, corre (1). Sin eso, los leads que llegaron ANTES del import
--      (cruce pendiente esperando el código) quedarían en "Pendiente de matching" para
--      siempre: hoy el único disparador de la cascada es el front al vincular un anuncio.
--
-- Las propiedades nacen sin captured_by ni commercialized_by: se asignan después, cuando la
-- organización tenga a su equipo cargado. La ingesta de mails trata commercialized_by NULL
-- como "disponible" (leadIngestion.ts), así que el lead se vincula igual.

-- ---------------------------------------------------------------------------
-- 1. La cascada, con la organización como parámetro.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_sync_tasks_for_ad_in_org(
  p_org_id      uuid,
  p_action_id   text,
  p_property_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id     uuid := p_org_id;
  v_stage_id   uuid;
  v_leads      int := 0;
  v_linked     int := 0;
  v_closed     int := 0;
  -- Cuántos de los leads en cascada YA tenían el vínculo real ANTES de que esta llamada
  -- tocara una sola fila. Hace falta para que "linked_leads" siga significando "leads que
  -- ESTA llamada vinculó" y no "leads que están vinculados ahora" — un lead que ya tenía el
  -- piso vinculado de antes (con o sin huérfano de por medio) no es un vínculo nuevo, es uno
  -- que el RPC se salteó. Ver el recuento final, más abajo.
  v_pre_linked int := 0;
begin
  if v_org_id is null then
    raise exception 'Sin organización en el contexto';
  end if;

  -- El `idealista_property_id = p_action_id` no es un chequeo cosmético: sin él, quien
  -- llama al RPC puede pasar CUALQUIER propiedad de la organización junto con cualquier
  -- action_id, y la función igual cierra hasta 132 tareas de OTROS agentes y vincula esa
  -- propiedad equivocada a esos leads. El spec excluye explícitamente cualquier undo: esa
  -- escritura es irreversible en la práctica. Un bug en el llamador (un propertyId mal
  -- armado, un off-by-one en un batch) o un agente hostil que junte un action_id ajeno con
  -- una propiedad propia bastan para el mismo daño. Exigir que la propiedad YA declare ser
  -- ese anuncio hace que el RPC solo pueda cerrar las tareas que de verdad resuelve.
  if not exists (
    select 1 from public.properties
    where id = p_property_id and organization_id = v_org_id and deleted_at is null
      and idealista_property_id = p_action_id
  ) then
    raise exception 'La propiedad no representa el anuncio %', p_action_id;
  end if;

  -- Mismo criterio que resolveNewLeadFunnelStage en email-inbound: primero por value,
  -- después el primero por posición. El filtro deleted_at importa: sin él el fallback
  -- podía devolver un stage borrado (el viejo "Compartido", position 1).
  select id into v_stage_id
  from public.property_funnel_stages
  where organization_id = v_org_id and value = 'NEW_LEAD'
    and is_out_of_funnel = false and deleted_at is null
  limit 1;

  if v_stage_id is null then
    select id into v_stage_id
    from public.property_funnel_stages
    where organization_id = v_org_id and is_out_of_funnel = false and deleted_at is null
    order by position asc
    limit 1;
  end if;

  if v_stage_id is null then
    raise exception 'La organización no tiene ningún stage de embudo de propiedades';
  end if;

  -- El import corre la cascada una vez por fila DENTRO de la misma transacción, y el
  -- `on commit drop` recién la borra al final: sin este drop, la segunda fila choca con
  -- "relation _cascade_leads already exists".
  drop table if exists _cascade_leads;

  -- Los leads que esperaban este anuncio salen de las propias tareas abiertas: la tarea
  -- guarda las dos puntas (entity_id = lead, action_id = anuncio). Lo sirve el índice
  -- parcial tasks_action_idx.
  create temporary table _cascade_leads on commit drop as
  select distinct t.entity_id as lead_id
  from public.tasks t
  join public.leads l on l.id = t.entity_id and l.deleted_at is null
  where t.organization_id = v_org_id
    and t.entity_type     = 'lead_comprador'
    and t.action_type     = 'sync_idealista_property'
    and t.action_id       = p_action_id
    and t.completed       = false
    and t.deleted_at      is null;

  select count(*) into v_leads from _cascade_leads;

  -- Foto de "antes": cuántos de estos leads ya tenían el piso vinculado (activo) sin que
  -- esta llamada hiciera nada todavía. Esto incluye tanto al lead de la rama 1 (huérfano +
  -- vínculo real ya existente) como al lead que ya estaba vinculado sin huérfano de por
  -- medio (el caso que prueba el test "un lead que ya tenía el piso vinculado..."): en
  -- ambos, el vínculo real es anterior a esta llamada, así que no cuenta como "vinculado
  -- por esta llamada".
  select count(*) into v_pre_linked
  from public.lead_properties lp
  where lp.lead_id in (select lead_id from _cascade_leads)
    and lp.property_id = p_property_id
    and lp.deleted_at is null;

  -- 1º  Huérfano Y ADEMÁS el vínculo real ya existe  ->  soft-delete del huérfano.
  --
  --     Va PRIMERO, y no es cosmético: si la rama 2 corriera antes, su UPDATE pondría
  --     property_id = p_property_id en un lead que YA tiene ese piso vinculado, violando
  --     lead_properties_lead_property_active_uidx. Eso aborta la transacción ENTERA y no se
  --     cierra NINGUNA de las tareas del anuncio — el mismo modo de falla que el
  --     ON CONFLICT DO NOTHING de la rama 3 viene protegiendo desde el día uno.
  update public.lead_properties lp
     set deleted_at = now()
   where lp.lead_id in (select lead_id from _cascade_leads)
     and lp.pending_ad_code = p_action_id
     and lp.property_id is null
     and lp.deleted_at is null
     and exists (
       select 1 from public.lead_properties lp2
        where lp2.lead_id = lp.lead_id
          and lp2.property_id = p_property_id
          and lp2.deleted_at is null
     );

  -- 2º  Huérfano solo  ->  se rellena EN SU LUGAR.
  --
  --     El id de la fila no cambia, y lead_property_stage_history cuelga de ese id, así que
  --     el lead conserva "entró a Lead nuevo el día que llegó el mail" en vez de la fecha en
  --     que alguien se acordó de cargar el piso. Es el premio de haber modelado el cruce
  --     pendiente en lugar de un piso stub.
  --
  --     pending_ad_code se limpia porque lead_properties_target_xor lo exige: la fila ya
  --     apunta a un piso y no puede además estar esperando un anuncio.
  --
  --     Este UPDATE no toca property_funnel_stage_id, así que log_lead_property_stage_change
  --     no escribe una fila nueva de historial y no aparece un reopenedBySystem espurio que
  --     ponga el lead en Pendiente sin que haya pasado nada.
  update public.lead_properties lp
     set property_id     = p_property_id,
         pending_ad_code = null,
         updated_at      = now()
   where lp.lead_id in (select lead_id from _cascade_leads)
     and lp.pending_ad_code = p_action_id
     and lp.property_id is null
     and lp.deleted_at is null;

  -- 3º  Los leads que no tenían huérfano  ->  el INSERT de siempre.
  --
  -- El índice único es PARCIAL (lead_properties_lead_property_active_uidx: (lead_id,
  -- property_id) WHERE deleted_at IS NULL), así que el ON CONFLICT tiene que repetir el
  -- predicado o Postgres no lo puede inferir. Sin el DO NOTHING, un solo lead que ya
  -- tuviera el piso vinculado abortaría la transacción entera y no se cerraría NINGUNA tarea.
  insert into public.lead_properties (lead_id, property_id, organization_id, property_funnel_stage_id)
  select cl.lead_id, p_property_id, v_org_id, v_stage_id
  from _cascade_leads cl
  on conflict (lead_id, property_id) where deleted_at is null do nothing;

  -- v_linked tiene que contar TODO lo que quedó vinculado por ESTA llamada, no sólo lo que
  -- insertó la rama 3: es el número que el front le muestra al comercial ("se vincularon N
  -- leads"). Se recuenta el estado final contra el estado inicial (v_pre_linked) en vez de
  -- sumar row_count de cada rama por separado — así no puede quedar desincronizado si mañana
  -- se agrega una rama más — y se resta lo que ya estaba vinculado ANTES de esta llamada,
  -- para no contar como "nuevo" un vínculo que ya existía (rama 1, o el caso sin huérfano).
  select count(*) into v_linked
  from public.lead_properties lp
  where lp.lead_id in (select lead_id from _cascade_leads)
    and lp.property_id = p_property_id
    and lp.deleted_at is null;
  v_linked := v_linked - v_pre_linked;

  update public.tasks t
  set completed = true, completed_at = now()
  where t.organization_id = v_org_id
    and t.entity_type     = 'lead_comprador'
    and t.action_type     = 'sync_idealista_property'
    and t.action_id       = p_action_id
    and t.completed       = false
    and t.deleted_at      is null
    and t.entity_id in (select lead_id from _cascade_leads);
  get diagnostics v_closed = row_count;

  -- Los contadores no son decorativos: son lo que permite decirle al comercial "se
  -- vincularon N leads y se cerraron N tareas" en vez de que N filas aparezcan de la nada.
  return json_build_object(
    'leads',         v_leads,
    'linked_leads',  v_linked,
    'skipped_links', v_leads - v_linked,
    'closed_tasks',  v_closed
  );
end;
$$;

-- REVOKE primero y a PUBLIC además de anon (anon hereda de PUBLIC). Sin GRANT a
-- authenticated: la org viene por parámetro y sólo la pueden elegir los dos definers de abajo.
revoke all on function public.resolve_sync_tasks_for_ad_in_org(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_sync_tasks_for_ad_in_org(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. El RPC de siempre: misma firma y mismo resultado, la org sigue saliendo del contexto.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_sync_tasks_for_ad(
  p_action_id   text,
  p_property_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  -- La org sale de current_organization_id(), NUNCA de un parámetro: cualquier miembro de
  -- la organización puede llamar a este RPC.
  return public.resolve_sync_tasks_for_ad_in_org(
    public.current_organization_id(), p_action_id, p_property_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. El import.
-- ---------------------------------------------------------------------------
--
-- p_rows: array de { "property": {...columnas de properties}, "address": {...} | null }.
-- El front ya validó cada fila con las reglas de la carga rápida (validateForm) y completó
-- la dirección con Google (requestAddressCompletion): acá sólo se escribe.
--
-- Sólo se copian las columnas de la lista: un campo de más en el JSON (organization_id,
-- captured_by, id...) se ignora, no se escribe.
--
-- Devuelve una entrada por fila, en el mismo orden:
--   { "status": "created", "property_id": ..., "linked_leads": N }
--   { "status": "skipped_existing", "property_id": <la que ya tenía ese código> }
--
-- Todo o nada: si una fila falla, no queda ninguna a medias.

create or replace function public.superadmin_import_properties(
  p_org_id uuid,
  p_rows   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row         jsonb;
  v_prop        public.properties;
  v_addr        public.addresses;
  v_code        text;
  v_existing    uuid;
  v_address_id  uuid;
  v_property_id uuid;
  v_cascade     json;
  v_results     jsonb := '[]'::jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'Sólo un superadmin puede importar propiedades';
  end if;

  if not exists (select 1 from public.organizations where id = p_org_id and deleted_at is null) then
    raise exception 'La organización % no existe', p_org_id;
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows tiene que ser un array';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_prop := jsonb_populate_record(null::public.properties, v_row -> 'property');
    v_code := nullif(btrim(v_prop.idealista_property_id), '');

    -- Un código que ya está en la org no se pisa: la propiedad existente puede tener
    -- datos cargados a mano. Cubre también el código repetido dentro del mismo Excel (la
    -- primera fila ya quedó insertada en esta transacción).
    if v_code is not null then
      select id into v_existing
      from public.properties
      where organization_id = p_org_id and deleted_at is null
        and btrim(idealista_property_id) = v_code
      limit 1;
      if v_existing is not null then
        v_results := v_results || jsonb_build_object('status', 'skipped_existing', 'property_id', v_existing);
        v_existing := null;
        continue;
      end if;
    end if;

    v_address_id := null;
    if jsonb_typeof(v_row -> 'address') = 'object' then
      v_addr := jsonb_populate_record(null::public.addresses, v_row -> 'address');
      insert into public.addresses (
        organization_id, street, street_number, floor, door, neighborhood, city, province,
        postal_code, country, zone_id, district, comarca, local_entity, autonomous_community,
        premise, subpremise, google_place_id, latitude, longitude
      ) values (
        p_org_id, v_addr.street, v_addr.street_number, v_addr.floor, v_addr.door,
        v_addr.neighborhood, v_addr.city, v_addr.province, v_addr.postal_code, v_addr.country,
        v_addr.zone_id, v_addr.district, v_addr.comarca, v_addr.local_entity,
        v_addr.autonomous_community, v_addr.premise, v_addr.subpremise, v_addr.google_place_id,
        v_addr.latitude, v_addr.longitude
      )
      returning id into v_address_id;
    end if;

    insert into public.properties (
      organization_id, address_id, property_type, for_sale, for_rent, sale_price, rent_price,
      operation_type, price, sale_situation, rental_type, address_visibility, bedrooms,
      bathrooms, sqm_built, has_elevator, has_balcony, idealista_property_id
    ) values (
      p_org_id, v_address_id, v_prop.property_type, coalesce(v_prop.for_sale, false),
      coalesce(v_prop.for_rent, false), v_prop.sale_price, v_prop.rent_price,
      v_prop.operation_type, v_prop.price, v_prop.sale_situation, v_prop.rental_type,
      -- NOT NULL con default 'exact': un null explícito no toma el default, rompe el insert.
      coalesce(v_prop.address_visibility, 'exact'), v_prop.bedrooms, v_prop.bathrooms, v_prop.sqm_built,
      v_prop.has_elevator, v_prop.has_balcony, v_code
    )
    returning id into v_property_id;

    v_cascade := null;
    if v_code is not null then
      v_cascade := public.resolve_sync_tasks_for_ad_in_org(p_org_id, v_code, v_property_id);
    end if;

    v_results := v_results || jsonb_build_object(
      'status', 'created',
      'property_id', v_property_id,
      'linked_leads', coalesce((v_cascade ->> 'linked_leads')::int, 0)
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.superadmin_import_properties(uuid, jsonb) from public, anon;
grant execute on function public.superadmin_import_properties(uuid, jsonb) to authenticated, service_role;
