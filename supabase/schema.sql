-- ============================================================
-- Esquema completo del tablero. ES EL ÚNICO ARCHIVO: se corre una vez, entero, sobre un
-- proyecto Supabase vacío.
--
-- Reemplaza a la cadena schema.sql → v2 → v3 → v4 → v5 → v7 → v8 (29/9/2026). Esa cadena
-- contaba cómo se llegó hasta acá; este archivo es a dónde se llegó. Se armó leyendo el
-- catálogo en vivo del proyecto `propelia` (gvkdyxhxsnpumxlhvhsm) y no sumando los
-- archivos viejos: es el estado real, con la v7 y la v8 (`carga`) corridas.
--
-- Qué quedó afuera respecto de aquella base, a propósito:
--   - `roadmap_secciones` y `roadmap_tareas.sec_id`: las temáticas muertas (0 filas, 0
--     tareas con sec_id). Es lo que haría la v5; en la base nueva nace ya limpia.
--   - `captalia_*`: el tablero viejo de Captalia. El front no las lee desde la unificación.
--   - El bucket `captalia-adjuntos`: está vacío y ninguna tarea lo referencia.
--   - Todo lo demás de ese proyecto (el CRM: leads, properties, etc.) no es de este tablero.
--   - auth.users: las cuentas se crean nuevas en el proyecto nuevo. Quién es quién vive en
--     `users` (abajo), que reemplazó a `app_miembros` + `APP_CONFIG.personas` el 29/9/2026.
--
-- Idempotente: se puede correr dos veces.
-- ============================================================

-- ---------- Funciones ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Usuarios ----------
-- Tener fila activa acá ES tener acceso, y la fila dice quién sos. Reemplaza a
-- `app_miembros` (acceso por email) + `APP_CONFIG.personas` (identidad escrita en el HTML).
do $$ begin
  create type public.user_role as enum ('SUPERADMIN');
exception when duplicate_object then null;
end $$;
-- Aparte y no dentro del `create type`: una base que ya tenía el enum no pasaría por ahí.
-- Todavía no restringe nada; la primera regla por rol es una policy.
alter type public.user_role add value if not exists 'SDR';

create table if not exists public.users (
  -- restrict y no cascade: borrar la cuenta desde el panel no puede llevarse puesta la fila,
  -- que las tareas y el CRM referencian. Primero `activo = false`; la cuenta, si hace falta, después.
  id         uuid primary key references auth.users(id) on delete restrict,
  email      text not null unique,
  nombre     text not null,
  iniciales  text not null,
  color      text not null,
  rol        public.user_role not null default 'SUPERADMIN',
  -- Quién pone plata en la caja. Un booleano y no un rol: quién paga y qué permisos tiene
  -- una cuenta son dos preguntas distintas.
  caja       boolean not null default false,
  -- La baja es esto y nunca un delete: crm_* apunta acá con FK y el roadmap guarda estos
  -- uuids adentro de su JSON.
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Va después de la tabla: una función `language sql` se valida al crearla.
create or replace function public.es_usuario()
returns boolean language sql stable security definer
set search_path to 'public' as $$
  select exists (select 1 from public.users where id = auth.uid() and activo);
$$;

-- ---------- Tareas ----------
create table if not exists public.roadmap_tareas (
  id         text primary key,
  modulo     text not null default '',
  tarea      text not null default '',
  expl       text not null default '',
  resp       text not null default '',
  estado     text not null default 'Pendiente',
  img        text not null default '',
  com        text not null default '',
  fecha      date,
  files      jsonb not null default '[]'::jsonb,
  orden      double precision not null,
  updated_at timestamptz not null default now(),
  chat       jsonb not null default '[]'::jsonb,
  subtareas  jsonb not null default '[]'::jsonb,
  prioridad  text not null default 'semanal',
  tipo       text not null default 'nuevo',
  hoy        boolean not null default false,
  pend       jsonb not null default '[]'::jsonb,
  creada     timestamptz not null default now(),
  backlog    boolean not null default false,
  sprint     smallint,
  dep        text,
  loom       text
);
create index if not exists roadmap_tareas_backlog_idx on public.roadmap_tareas (backlog, sprint, orden);
create index if not exists roadmap_tareas_hoy_idx     on public.roadmap_tareas (hoy) where hoy;

-- ---------- Caja ----------
create table if not exists public.roadmap_caja (
  id         text primary key,
  fecha      date,
  concepto   text not null default '',
  categoria  text not null default '',
  monto      numeric not null default 0,
  cuenta     text not null default '',
  notas      text not null default '',
  orden      double precision not null,
  updated_at timestamptz not null default now(),
  repite     text not null default '',
  origen     text not null default '',
  carga      jsonb not null default '[]'::jsonb
);
create index if not exists roadmap_caja_origen_idx on public.roadmap_caja (origen) where origen <> '';

-- ---------- Notas (grupos del backlog + hoja de notas) ----------
create table if not exists public.roadmap_notas (
  id         text primary key,
  titulo     text not null default '',
  texto      text not null default '',
  orden      double precision not null,
  updated_at timestamptz not null default now()
);

-- ---------- Triggers de updated_at ----------
-- En el origen roadmap_tareas usaba `roadmap_set_updated_at()`, un gemelo idéntico de
-- `set_updated_at()`. Acá se usa una sola función para las tres.
drop trigger if exists roadmap_tareas_set_updated_at on public.roadmap_tareas;
create trigger roadmap_tareas_set_updated_at before update on public.roadmap_tareas
  for each row execute function public.set_updated_at();
drop trigger if exists roadmap_caja_set_updated_at on public.roadmap_caja;
create trigger roadmap_caja_set_updated_at before update on public.roadmap_caja
  for each row execute function public.set_updated_at();
drop trigger if exists roadmap_notas_set_updated_at on public.roadmap_notas;
create trigger roadmap_notas_set_updated_at before update on public.roadmap_notas
  for each row execute function public.set_updated_at();
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.users          enable row level security;
alter table public.roadmap_tareas enable row level security;
alter table public.roadmap_caja   enable row level security;
alter table public.roadmap_notas  enable row level security;

-- Todo el equipo se ve (avatares, menús, firma del chat). Sin policies de escritura: altas,
-- cambios y roles van por el MCP o el service role, y nadie se sube de rol desde la consola.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (public.es_usuario());

drop policy if exists roadmap_tareas_m on public.roadmap_tareas;
create policy roadmap_tareas_m on public.roadmap_tareas for all
  using (public.es_usuario()) with check (public.es_usuario());
drop policy if exists roadmap_caja_m on public.roadmap_caja;
create policy roadmap_caja_m on public.roadmap_caja for all
  using (public.es_usuario()) with check (public.es_usuario());
drop policy if exists roadmap_notas_m on public.roadmap_notas;
create policy roadmap_notas_m on public.roadmap_notas for all
  using (public.es_usuario()) with check (public.es_usuario());

-- ---------- Realtime ----------
-- users no va: el front la lee una vez al entrar.
do $$
declare t text;
begin
  foreach t in array array['roadmap_tareas','roadmap_caja','roadmap_notas'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public)
values ('roadmap-adjuntos', 'roadmap-adjuntos', false)
on conflict (id) do update set public = false;

drop policy if exists adjuntos_read on storage.objects;
create policy adjuntos_read on storage.objects for select
  using (bucket_id = 'roadmap-adjuntos' and public.es_usuario());
drop policy if exists adjuntos_write on storage.objects;
create policy adjuntos_write on storage.objects for insert
  with check (bucket_id = 'roadmap-adjuntos' and public.es_usuario());
drop policy if exists adjuntos_delete on storage.objects;
create policy adjuntos_delete on storage.objects for delete
  using (bucket_id = 'roadmap-adjuntos' and public.es_usuario());

-- ============================================================
-- CRM interno: Propelia siguiendo a SUS clientes (las inmobiliarias).
--
-- Mismo modelo que el CRM de compradores de propelia-frontend y con los mismos nombres de
-- columna, para que la pantalla se replique sin traducir. Sin organization_id (acá hay un
-- solo equipo) y sin nada inmobiliario: propiedades, cruces, briefing, matching, IA,
-- portales, calendario. Fuente: migracion/fuente-crm-producto.sql. Diseño:
-- docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md.
-- ============================================================

do $$ begin
  create type public.crm_management_action as enum ('MANUAL', 'POSTPONED');
exception when duplicate_object then null;
end $$;

-- ---------- Catálogos (los editan ellos desde la pantalla) ----------
create table if not exists public.crm_priorities (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  color                      text not null,
  position                   integer not null default 0,
  management_tolerance_hours integer default 24,
  show_in_filters            boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz
);

create table if not exists public.crm_funnel_stages (
  id                         uuid primary key default gen_random_uuid(),
  label                      text not null default '',
  value                      text not null default '',
  position                   integer not null default 0,
  priority_id                uuid references public.crm_priorities(id),
  is_out_of_funnel           boolean not null default false,
  allow_delete               boolean not null default false,
  allow_reorder              boolean not null default false,
  allow_rename               boolean not null default true,
  management_tolerance_hours integer,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz
);

create table if not exists public.crm_channels (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  position     integer not null default 0,
  allow_delete boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ---------- Entidades ----------
create table if not exists public.crm_clients (
  id                       uuid primary key default gen_random_uuid(),
  first_name               text,
  last_name                text,
  -- La única columna que el producto no tiene: acá los clientes son inmobiliarias, y la
  -- persona sin su empresa no dice nada.
  company_name             text,
  email                    text,
  phone                    text,
  alternative_phone_1      text,
  alternative_phone_1_note text,
  alternative_phone_2      text,
  alternative_phone_2_note text,
  notes                    text,
  created_by               uuid default auth.uid() references public.users(id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);
create unique index if not exists crm_clients_email_active_uidx on public.crm_clients (lower(email))
  where deleted_at is null and email is not null and email <> '';
create unique index if not exists crm_clients_phone_active_uidx on public.crm_clients (phone)
  where deleted_at is null and phone is not null and phone <> '';
-- Lo que se sabe de la inmobiliaria (la pestaña con su nombre en el dialog del lead). Van como
-- `add column` y no en el `create table` para que alcance con correr esto sobre una base que ya
-- tiene la tabla. En el proyecto entraron con la migración `20261006123359_crm_clients_inmobiliaria`.
alter table public.crm_clients add column if not exists website       text;
alter table public.crm_clients add column if not exists idealista_url text;
alter table public.crm_clients add column if not exists city          text;
-- El barrio donde opera y la dirección de la oficina. Texto libre.
alter table public.crm_clients add column if not exists neighborhood   text;
alter table public.crm_clients add column if not exists office_address text;
alter table public.crm_clients add column if not exists agents_count  integer
  check (agents_count is null or agents_count >= 0);
alter table public.crm_clients add column if not exists current_crm   text;
-- Cuánto hace que publica en Idealista y cuántos inmuebles tiene ahí: dicen el tamaño real de la
-- inmobiliaria mejor que el número de agentes. Enteros, nunca negativos.
alter table public.crm_clients add column if not exists idealista_years    integer
  check (idealista_years is null or idealista_years >= 0);
alter table public.crm_clients add column if not exists idealista_listings integer
  check (idealista_listings is null or idealista_listings >= 0);
-- El consejo para el SDR sobre cómo encarar esta inmobiliaria. Por ahora se escribe a mano; la idea
-- es que lo genere Claude más adelante, y esta columna es donde va a quedar.
alter table public.crm_clients add column if not exists sdr_advice    text;
-- El rol (texto libre) y las notas de cada contacto: el principal y los dos alternativos. El
-- front guarda cada una por separado.
alter table public.crm_clients add column if not exists contact_role             text;
alter table public.crm_clients add column if not exists contact_notes            text;
alter table public.crm_clients add column if not exists alternative_phone_1_role  text;
alter table public.crm_clients add column if not exists alternative_phone_1_notes text;
alter table public.crm_clients add column if not exists alternative_phone_2_role  text;
alter table public.crm_clients add column if not exists alternative_phone_2_notes text;
-- Lo que trae la importación desde Excel. Sin `unique` a
-- propósito: el Excel puede repetir datos y deduplicar es cosa de quien prepara la importación.
-- El lote del que salió (ej.: `BCN-S01`) y el día en que se activó para el SDR.
alter table public.crm_clients add column if not exists import_batch       text;
alter table public.crm_clients add column if not exists batch_activated_on date;
-- Por qué se eligió la inmobiliaria: le dice al SDR con qué ángulo abrir la llamada (usa
-- Inmovilla, es nueva, es pequeña). Los valores son los de `MOTIVOS_DE_SELECCION` del front.
alter table public.crm_clients add column if not exists selection_reason   text
  check (selection_reason is null or selection_reason in ('inmovilla', 'new', 'small'));
-- De dónde salió cada uno de los tres teléfonos. Los valores son los de `ORIGENES_DE_TELEFONO`.
alter table public.crm_clients add column if not exists phone_source               text
  check (phone_source is null or phone_source in ('agency_web', 'legal_notice', 'google_maps', 'company_registry'));
alter table public.crm_clients add column if not exists alternative_phone_1_source text
  check (alternative_phone_1_source is null or alternative_phone_1_source in ('agency_web', 'legal_notice', 'google_maps', 'company_registry'));
alter table public.crm_clients add column if not exists alternative_phone_2_source text
  check (alternative_phone_2_source is null or alternative_phone_2_source in ('agency_web', 'legal_notice', 'google_maps', 'company_registry'));
-- El teléfono tal como figura en la ficha de Google Maps, aparte de los otros tres.
alter table public.crm_clients add column if not exists google_maps_phone  text;
-- El teléfono de Idealista: ÚLTIMO RECURSO, solo si no hay ningún otro. Es un redirector de
-- Idealista: a la agencia le entra como un cliente interesado en un piso, no como una llamada
-- comercial. Por eso nunca es el número que se ofrece para llamar por defecto.
alter table public.crm_clients add column if not exists idealista_phone    text;

create table if not exists public.crm_leads (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.crm_clients(id) on delete cascade,
  assigned_to             uuid not null references public.users(id) on delete restrict,
  funnel_stage_id         uuid references public.crm_funnel_stages(id) on delete set null,
  channel_id              uuid references public.crm_channels(id) on delete set null,
  discard_reason          text,
  created_via             text not null default 'manual',
  last_important_event_at timestamptz not null default now(),
  last_opened_at          timestamptz,
  -- De cuándo cuenta la gestión. La escribe crm_gestion_refresh(), nunca el front.
  gestion_reference_at    timestamptz,
  gestion_postponed       boolean not null default false,
  gestion_has_events      boolean not null default false,
  created_by              uuid default auth.uid() references public.users(id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);
-- Un cliente tiene UN lead, sea de quien sea (7/10/2026). Hasta ese día era uno por comercial
-- (client_id, assigned_to), como en el producto: acá un cliente es una inmobiliaria y dos SDR
-- llamando a la misma oficina es justo lo que no tiene que pasar.
drop index if exists public.crm_leads_client_assignee_active_uidx;
create unique index if not exists crm_leads_client_active_uidx
  on public.crm_leads (client_id) where deleted_at is null;
create index if not exists crm_leads_gestion_reference_at_idx
  on public.crm_leads (gestion_reference_at desc nulls last) where deleted_at is null;

create table if not exists public.crm_meetings (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.crm_leads(id) on delete cascade,
  assigned_to   uuid not null references public.users(id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'scheduled'
                check (status in ('scheduled', 'completed', 'cancelled')),
  title         text,
  description   text,
  cancel_reason text,
  created_by    uuid default auth.uid() references public.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint crm_meetings_time_valid check (ends_at > starts_at)
);
create index if not exists crm_meetings_lead_idx on public.crm_meetings (lead_id) where deleted_at is null;

create table if not exists public.crm_tasks (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable: una tarea puede no ser de ningún lead, como en el producto. `lead_id` directo y
  -- no el par entity_type/entity_id: acá solo hay leads, y un par polimórfico no admite FK.
  lead_id      uuid references public.crm_leads(id) on delete cascade,
  title        text not null,
  due_date     date,
  planned_for  date,
  assigned_to  uuid not null default auth.uid() references public.users(id) on delete restrict,
  completed    boolean not null default false,
  completed_at timestamptz,
  recurrence   text check (recurrence is null
                or recurrence in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly')),
  created_by   uuid default auth.uid() references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists crm_tasks_assigned_pending_idx on public.crm_tasks (assigned_to, completed, due_date);
create index if not exists crm_tasks_lead_idx on public.crm_tasks (lead_id) where deleted_at is null;

create table if not exists public.crm_comments (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.crm_leads(id) on delete cascade,
  description      text not null,
  long_description text,
  comment_type     text not null default 'MANUAL' check (comment_type in ('MANUAL', 'SYSTEM')),
  created_by       uuid default auth.uid() references public.users(id) on delete restrict,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table if not exists public.crm_management_events (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.crm_leads(id) on delete cascade,
  action       public.crm_management_action not null,
  effective_at timestamptz not null default now(),
  note         text,
  created_by   uuid default auth.uid() references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists crm_management_events_lead_effective_idx
  on public.crm_management_events (lead_id, effective_at desc);

-- ---------- Historiales: los escriben triggers, nunca el front ----------
-- changed_by es nullable: lo que se hace por MCP o service role no tiene auth.uid().
create table if not exists public.crm_stage_history (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.crm_leads(id) on delete cascade,
  from_stage_id uuid references public.crm_funnel_stages(id),
  to_stage_id   uuid not null references public.crm_funnel_stages(id),
  changed_by    uuid references public.users(id) on delete restrict,
  changed_at    timestamptz not null default now()
);

create table if not exists public.crm_assignment_history (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.crm_leads(id) on delete cascade,
  from_user_id uuid references public.users(id) on delete restrict,
  to_user_id   uuid not null references public.users(id) on delete restrict,
  changed_by   uuid references public.users(id) on delete restrict,
  changed_at   timestamptz not null default now()
);

-- ---------- Funciones y triggers ----------
create or replace function public.crm_log_stage_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' and new.funnel_stage_id is not null then
    insert into public.crm_stage_history (lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, null, new.funnel_stage_id, auth.uid());
  elsif tg_op = 'UPDATE' and new.funnel_stage_id is not null
        and old.funnel_stage_id is distinct from new.funnel_stage_id then
    insert into public.crm_stage_history (lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, old.funnel_stage_id, new.funnel_stage_id, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.crm_log_assignment_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.crm_assignment_history (lead_id, from_user_id, to_user_id, changed_by)
  values (new.id, old.assigned_to, new.assigned_to, auth.uid());
  return new;
end;
$$;

/* De cuándo cuenta la gestión de un lead. Es la lead_gestion_reference() del producto sin su
   segunda mitad: allá también cuentan los cambios que hace el sistema sobre los cruces con
   propiedades, y acá no hay cruces. Por eso tampoco existe gestion_reopened_by_system. */
create or replace function public.crm_gestion_refresh(p_lead_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  with ganador as (
    -- El de mayor effective_at; el desempate por created_at lo vuelve determinístico.
    select e.effective_at, e.action
    from public.crm_management_events e
    where e.lead_id = p_lead_id and e.deleted_at is null
    order by e.effective_at desc, e.created_at desc
    limit 1
  ), calc as (
    select coalesce(g.effective_at, l.created_at)       as reference_at,
           coalesce(g.action = 'POSTPONED', false)       as postponed,
           g.effective_at is not null                    as has_events
    from public.crm_leads l left join ganador g on true
    where l.id = p_lead_id
  )
  update public.crm_leads l
  set gestion_reference_at = c.reference_at,
      gestion_postponed    = c.postponed,
      gestion_has_events   = c.has_events
  from calc c
  where l.id = p_lead_id
    -- Solo si cambió algo: cada update de un lead dispara realtime a los tres.
    and (l.gestion_reference_at is distinct from c.reference_at
      or l.gestion_postponed    is distinct from c.postponed
      or l.gestion_has_events   is distinct from c.has_events);
$$;

create or replace function public.crm_gestion_from_event()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.crm_gestion_refresh(new.lead_id);
  end if;
  -- Un evento que se mueve de lead (o se borra) también le cambia la cuenta al de antes.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id) then
    perform public.crm_gestion_refresh(old.lead_id);
  end if;
  return null;
end;
$$;

create or replace function public.crm_gestion_from_lead()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.crm_gestion_refresh(new.id);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels','crm_clients',
                           'crm_leads','crm_meetings','crm_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- security definer + EXECUTE de fábrica para PUBLIC = cualquiera, incluso sin sesión, podría
-- llamar a crm_gestion_refresh() por /rpc. Solo recalcula campos derivados, pero no hay por qué dejar abierta esa
-- puerta: la llaman los triggers, que corren como dueño.
revoke execute on function public.crm_gestion_refresh(uuid) from public, anon, authenticated;

drop trigger if exists crm_leads_log_stage on public.crm_leads;
create trigger crm_leads_log_stage after insert or update of funnel_stage_id on public.crm_leads
  for each row execute function public.crm_log_stage_change();
drop trigger if exists crm_leads_log_assignment on public.crm_leads;
create trigger crm_leads_log_assignment after update of assigned_to on public.crm_leads
  for each row when (old.assigned_to is distinct from new.assigned_to)
  execute function public.crm_log_assignment_change();
drop trigger if exists crm_leads_gestion on public.crm_leads;
create trigger crm_leads_gestion after insert on public.crm_leads
  for each row execute function public.crm_gestion_from_lead();
drop trigger if exists crm_management_events_gestion on public.crm_management_events;
create trigger crm_management_events_gestion after insert or update or delete on public.crm_management_events
  for each row execute function public.crm_gestion_from_event();

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
-- Escribir va partido en insert/update/delete y NO en un `for all`: un cliente es compartido
-- entre carteras, y `crm_leads.client_id … on delete cascade` corre por fuera de la RLS. Con
-- `for all`, alguien con write sobre UN lead del cliente podía borrarlo y arrastrar los leads,
-- tareas y comentarios de carteras que ni siquiera puede leer. Borrar un cliente es solo del
-- SUPERADMIN; el resto, si hace falta, es una baja lógica por update.
drop policy if exists crm_clients_escribir on public.crm_clients;
drop policy if exists crm_clients_insertar on public.crm_clients;
drop policy if exists crm_clients_editar on public.crm_clients;
drop policy if exists crm_clients_borrar on public.crm_clients;
create policy crm_clients_insertar on public.crm_clients for insert
  with check (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()));
create policy crm_clients_editar on public.crm_clients for update
  using (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()))
  with check (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()));
create policy crm_clients_borrar on public.crm_clients for delete
  using (public.crm_es_superadmin());

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

-- REVOKE primero: un REVOKE ALL posterior se llevaría también el GRANT. Y a PUBLIC, no solo a
-- anon: anon hereda de PUBLIC.
revoke all on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  to authenticated;
-- ===== Importar un lote desde el Excel (7/10/2026) =====
-- Diseño en docs/superpowers/specs/2026-10-07-crm-importar-lote-design.md.

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

-- Una inmobiliaria es una ficha de Idealista: dos clientes vivos con la misma no pueden existir.
create unique index if not exists crm_clients_idealista_url_active_uidx
  on public.crm_clients (public.crm_url_clave(idealista_url))
  where deleted_at is null and public.crm_url_clave(idealista_url) is not null;

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

-- ===== FIN permisos por cartera =====

-- ---------- Siembras (solo si la tabla está vacía: correr dos veces no duplica) ----------
insert into public.crm_priorities (name, color, position, management_tolerance_hours)
select * from (values
  ('Verde',       '#639922', 1,  24),
  ('Amarillo',    '#EF9F27', 2, 168),
  ('Rojo',        '#E24B4A', 3, 336),
  ('Oportunidad', '#B84300', 4,  24)
) v(name, color, position, management_tolerance_hours)
where not exists (select 1 from public.crm_priorities);

-- Arranca con dos: el resto lo arman ellos desde la configuración del funnel.
insert into public.crm_funnel_stages
  (label, value, position, priority_id, management_tolerance_hours,
   is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
select * from (values
  ('Nuevo',      'NEW',       1, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, false, false, true),
  ('Descartado', 'DISCARDED', 2, null::uuid, null::integer,
   true,  false, false, false)
) v(label, value, position, priority_id, management_tolerance_hours,
    is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
where not exists (select 1 from public.crm_funnel_stages);
