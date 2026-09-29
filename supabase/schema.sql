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

create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
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
-- Un mismo cliente puede tener un lead por comercial (el del producto, sin lead_type).
create unique index if not exists crm_leads_client_assignee_active_uidx
  on public.crm_leads (client_id, assigned_to) where deleted_at is null;
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

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels','crm_clients',
                           'crm_leads','crm_meetings','crm_tasks','crm_comments',
                           'crm_management_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_equipo', t);
    execute format('create policy %I on public.%I for all
                    using (public.es_usuario()) with check (public.es_usuario())', t || '_equipo', t);
  end loop;
  -- Los historiales solo se leen: los insertan triggers security definer.
  foreach t in array array['crm_stage_history','crm_assignment_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('create policy %I on public.%I for select using (public.es_usuario())', t || '_lectura', t);
  end loop;
end $$;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_tasks','crm_comments','crm_management_events','crm_meetings'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

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
