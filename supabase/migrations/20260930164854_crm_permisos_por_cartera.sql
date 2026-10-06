-- ===== INICIO permisos por cartera =====
-- Permisos por cartera (30/9/2026, spec docs/superpowers/specs/2026-09-30-crm-pantalla-design.md §2).
-- Hasta acá cualquier usuario activo veía y editaba todo el CRM. Ahora cada lead es de una
-- cartera (`assigned_to`) y ver o editar la de otro es un permiso de `crm_data_access`. Se aplica
-- ACÁ, en la RLS, y no solo en pantalla: existe el rol SDR, y un permiso sin cerradura no es un
-- permiso. Todo lo que sigue es idempotente y va entre las marcas INICIO/FIN porque es lo que se
-- aplicó como migración sobre la base en producción.

-- ---------- crm_data_access: quién ve la cartera de quién ----------
-- Copia de `user_data_access` del producto. Plana y no transitiva: A ve a B y B ve a C no hace
-- que A vea a C. Sin soft delete: un permiso borrado a medias es la fila que un día revive porque
-- un lector se olvidó el filtro, y acá revivir es devolverle a alguien datos que le sacaste.
create table if not exists public.crm_data_access (
  id         uuid primary key default gen_random_uuid(),
  viewer_id  uuid not null references public.users(id) on delete cascade,
  subject_id uuid not null references public.users(id) on delete cascade,
  -- `write` implica `read`: es una escalera de dos escalones, no dos permisos sueltos.
  access     text not null check (access in ('read', 'write')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- La cartera propia no se concede: ya es tuya.
  constraint crm_data_access_no_self check (viewer_id <> subject_id),
  constraint crm_data_access_par_key unique (viewer_id, subject_id)
);

drop trigger if exists crm_data_access_set_updated_at on public.crm_data_access;
create trigger crm_data_access_set_updated_at before update on public.crm_data_access
  for each row execute function public.set_updated_at();

-- ---------- Las funciones de permiso ----------
-- Todas las policies llaman a estas: la regla vive en un lugar, como es_usuario(). Son
-- security definer porque leen `users` y `crm_data_access`; con invoker quedarían atadas a las
-- policies de esas mismas tablas. Todas exigen es_usuario(): un inactivo no puede nada.
create or replace function public.crm_es_superadmin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.users where id = auth.uid() and activo and rol = 'SUPERADMIN');
$$;

create or replace function public.crm_puede(p_owner uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.es_usuario() and coalesce(
    p_owner = auth.uid()
    or public.crm_es_superadmin()
    or exists (
      select 1 from public.crm_data_access a
      where a.viewer_id = auth.uid() and a.subject_id = p_owner
        and (a.access = 'write' or (p_nivel = 'read' and a.access = 'read'))
    ), false);
$$;

-- Lo mismo a través de la cartera del lead. Un lead que no existe no se puede nada.
create or replace function public.crm_puede_lead(p_lead_id uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select public.crm_puede(l.assigned_to, p_nivel) from public.crm_leads l where l.id = p_lead_id),
    false);
$$;

-- Un cliente no tiene cartera propia: se ve si alguno de sus leads activos se ve. Así un
-- cliente cuyo único lead se reasignó a otra cartera deja de verse, que es lo correcto. Función
-- aparte (y no un exists en la policy) para no apilar la RLS de crm_leads dentro de la de clientes.
create or replace function public.crm_puede_cliente(p_client_id uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.crm_leads l
    where l.client_id = p_client_id and l.deleted_at is null
      and public.crm_puede(l.assigned_to, p_nivel));
$$;

-- security definer + EXECUTE de fábrica para PUBLIC = también anon. Devolverían false, pero no
-- hay por qué dejar la puerta: las llama la RLS de `authenticated`.
revoke execute on function public.crm_es_superadmin() from public, anon;
revoke execute on function public.crm_puede(uuid, text) from public, anon;
revoke execute on function public.crm_puede_lead(uuid, text) from public, anon;
revoke execute on function public.crm_puede_cliente(uuid, text) from public, anon;
grant execute on function public.crm_es_superadmin() to authenticated;
grant execute on function public.crm_puede(uuid, text) to authenticated;
grant execute on function public.crm_puede_lead(uuid, text) to authenticated;
grant execute on function public.crm_puede_cliente(uuid, text) to authenticated;

-- ---------- RLS ----------
-- Primero se borra todo lo que pudo haber: las `*_equipo`/`*_lectura` de la versión anterior
-- (todos veían todo) y las `*_leer`/`*_escribir` de una corrida previa de este mismo archivo.
do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels','crm_clients',
                           'crm_leads','crm_meetings','crm_tasks','crm_comments',
                           'crm_management_events','crm_stage_history','crm_assignment_history',
                           'crm_data_access'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_equipo', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('drop policy if exists %I on public.%I', t || '_escribir', t);
  end loop;
end $$;

-- Catálogo: lo lee cualquiera, lo edita solo un SUPERADMIN. Un SDR que renombra o borra una
-- etapa desarma el funnel de todos (cambia lo decidido el 29/9; aprobado el 30/9).
do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels'] loop
    execute format('create policy %I on public.%I for select using (public.es_usuario())', t || '_leer', t);
    execute format('create policy %I on public.%I for all
                    using (public.crm_es_superadmin()) with check (public.crm_es_superadmin())', t || '_escribir', t);
  end loop;
end $$;

-- Leads. El `with check` también pide write: reasignar exige write sobre la cartera vieja
-- (using, fila de antes) y sobre la nueva (with check, fila de después).
create policy crm_leads_leer on public.crm_leads for select
  using (public.crm_puede(assigned_to, 'read'));
create policy crm_leads_escribir on public.crm_leads for all
  using (public.crm_puede(assigned_to, 'write')) with check (public.crm_puede(assigned_to, 'write'));

-- Tareas y reuniones: con lead, por el lead; sin lead (las dos columnas son nullable), por su responsable.
create policy crm_tasks_leer on public.crm_tasks for select using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'read')
       else public.crm_puede(assigned_to, 'read') end);
create policy crm_tasks_escribir on public.crm_tasks for all using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end)
  with check (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);
create policy crm_meetings_leer on public.crm_meetings for select using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'read')
       else public.crm_puede(assigned_to, 'read') end);
create policy crm_meetings_escribir on public.crm_meetings for all using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end)
  with check (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);

-- Lo que cuelga de un lead.
do $$
declare t text;
begin
  foreach t in array array['crm_comments','crm_management_events'] loop
    execute format('create policy %I on public.%I for select using (public.crm_puede_lead(lead_id, ''read''))', t || '_leer', t);
    execute format('create policy %I on public.%I for all
                    using (public.crm_puede_lead(lead_id, ''write'')) with check (public.crm_puede_lead(lead_id, ''write''))', t || '_escribir', t);
  end loop;
  -- Los historiales solo se leen: los insertan triggers security definer. Sin policy de escritura.
  foreach t in array array['crm_stage_history','crm_assignment_history'] loop
    execute format('create policy %I on public.%I for select using (public.crm_puede_lead(lead_id, ''read''))', t || '_leer', t);
  end loop;
end $$;

-- Clientes. `created_by` porque el alta crea primero el cliente y después el lead: sin esa rama
-- el cliente recién creado no se podría ni leer de vuelta. El SUPERADMIN ve todo: también el
-- cliente sin ningún lead activo, que por la cartera no lo vería nadie.
create policy crm_clients_leer on public.crm_clients for select using (
  public.crm_puede_cliente(id, 'read') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()));
create policy crm_clients_escribir on public.crm_clients for all
  using (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()))
  with check (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()));

-- crm_data_access: cada uno ve lo que le dieron; solo un SUPERADMIN lo cambia.
create policy crm_data_access_leer on public.crm_data_access for select using (
  (public.es_usuario() and viewer_id = auth.uid()) or public.crm_es_superadmin());
create policy crm_data_access_escribir on public.crm_data_access for all
  using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- ---------- Realtime ----------
-- crm_data_access: si te dan o te sacan acceso, la pantalla se entera. crm_clients: editar la
-- empresa o el teléfono en una sesión tiene que verse en la otra (la spec dice que las demás
-- ya estaban publicadas; clientes no lo estaba). Realtime aplica la RLS a postgres_changes, así
-- que a cada uno le llega solo lo que ve.
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_tasks','crm_comments','crm_management_events','crm_meetings',
                           'crm_clients','crm_data_access'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Alta: crm_create_lead_with_client ----------
-- Copia de create_lead_with_client del producto (versión endurecida,
-- 20260913151338_harden_create_lead_with_client.sql) sin organización, tipo de lead, briefing
-- ni propiedades. SECURITY DEFINER y no invoker: para reutilizar el cliente tiene que
-- encontrarlo por teléfono o email AUNQUE sea de una cartera que quien llama no ve. Con invoker
-- la RLS lo esconde, el lookup no lo encuentra, el insert choca contra el índice único y el
-- alta falla. Como saltea la RLS, el permiso se chequea a mano al principio.
--
-- Los errores son claves fijas (`crm_…`) y no frases: la pantalla las traduce
-- (src/pages/crm/lib/errores.ts) y una frase cambiada acá no rompería ningún test de allá.
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

  -- El único (client_id, assigned_to) dicho con una clave que la pantalla sabe traducir.
  if exists (select 1 from public.crm_leads
             where client_id = v_client_id and assigned_to = p_assigned_to and deleted_at is null) then
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

-- REVOKE primero: un REVOKE ALL posterior se llevaría también el GRANT. Y a PUBLIC, no solo a
-- anon: anon hereda de PUBLIC.
revoke all on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  to authenticated;
;
