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
  -- La firma de los mails del CRM. Opcionales: ver la migración users_firma_de_email.
  firma_nombre   text,
  firma_cargo    text,
  firma_email    text,
  firma_telefono text,
  -- El teléfono del miembro (migración users_phone). Aparte del de la firma, que puede ser
  -- el de la oficina. Lo exige el alta (`crear-miembro`); los de antes pueden no tenerlo.
  phone      text,
  -- El apellido (migración users_last_name). `nombre` es el corto de los avatares; lo exige el
  -- alta (`crear-miembro`) y los de antes pueden no tenerlo.
  last_name  text,
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
-- Gastos fijos y variables (11/10/2026), copiado y podado de ms-frontend. Reemplazó a
-- `roadmap_caja`, la del tablero vanilla; el porqué está en la migración `expenses`.

-- Plantillas.
-- Un gasto fijo es una plantilla más una fila de `expenses` por período. Mientras el
-- período no tiene su fila, la plantilla cuenta igual como comprometido (con `default_amount`).
create table if not exists public.expense_presets (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  expense_type   text not null check (expense_type in ('FIXED', 'VARIABLE')),
  recurrence     text not null default 'ONE_TIME' check (recurrence in ('MONTHLY', 'ONE_TIME')),
  default_amount numeric check (default_amount is null or default_amount > 0),
  due_day        integer check (due_day between 1 and 31),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Gastos.
-- `preset_id` nulo es un gasto suelto. `period` ('YYYY-MM') es el mes al que se imputa, que no
-- tiene por qué ser el de `date` (el día en que se pagó, si se pagó).
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  preset_id    uuid references public.expense_presets(id) on delete restrict,
  expense_name text not null,
  expense_type text not null check (expense_type in ('FIXED', 'VARIABLE')),
  amount       numeric not null check (amount > 0),
  date         date,
  period       text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  recurrence   text not null default 'MONTHLY' check (recurrence in ('MONTHLY', 'ONE_TIME')),
  status       text not null default 'PAID' check (status in ('PENDING', 'PAID')),
  notes        text,
  -- Quién pagó, que no tiene por qué ser quién lo cargó (`created_by`).
  paid_by      uuid references public.users(id) on delete restrict,
  created_by   uuid default auth.uid() references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists expenses_period_idx on public.expenses (period)
  where deleted_at is null;
create index if not exists expenses_preset_idx on public.expenses (preset_id)
  where deleted_at is null;
-- Esto no está en ms-frontend: una etiqueta fija tiene a lo sumo un gasto vivo por mes. Sin el
-- índice, dos clics en «Pagar» lo cobran dos veces. Solo los fijos: los variables también llevan
-- etiqueta y puede haber varios por mes.
create unique index if not exists expenses_preset_period_key
  on public.expenses (preset_id, period)
  where expense_type = 'FIXED' and deleted_at is null;
-- Un fijo cargado está pagado: su pendiente es el mes sin fila, no una fila en PENDING.
alter table public.expenses drop constraint if exists expenses_fixed_paid_check;
alter table public.expenses add constraint expenses_fixed_paid_check
  check (expense_type <> 'FIXED' or status = 'PAID');
-- Pagado ⇒ alguien lo pagó. Un variable PENDING lo elige al confirmar el pago.
alter table public.expenses drop constraint if exists expenses_paid_by_check;
alter table public.expenses add constraint expenses_paid_by_check
  check (status <> 'PAID' or paid_by is not null);
-- Una etiqueta no se repite (sin importar mayúsculas); las borradas no cuentan.
create unique index if not exists expense_presets_name_key
  on public.expense_presets (lower(name))
  where deleted_at is null;

drop trigger if exists expense_presets_set_updated_at on public.expense_presets;
create trigger expense_presets_set_updated_at before update on public.expense_presets
  for each row execute function public.set_updated_at();
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- RLS.
-- La misma regla que tenía roadmap_caja: cualquiera con fila activa en `users`.
alter table public.expense_presets enable row level security;
alter table public.expenses        enable row level security;

drop policy if exists expense_presets_m on public.expense_presets;
create policy expense_presets_m on public.expense_presets for all
  using (public.es_usuario()) with check (public.es_usuario());
drop policy if exists expenses_m on public.expenses;
create policy expenses_m on public.expenses for all
  using (public.es_usuario()) with check (public.es_usuario());


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
-- `set_updated_at()`. Acá se usa una sola función para todas.
drop trigger if exists roadmap_tareas_set_updated_at on public.roadmap_tareas;
create trigger roadmap_tareas_set_updated_at before update on public.roadmap_tareas
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
alter table public.roadmap_notas  enable row level security;

-- Todo el equipo se ve (avatares, menús, firma del chat). Sin policies de escritura: altas,
-- cambios y roles van por el MCP o el service role, y nadie se sube de rol desde la consola.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (public.es_usuario());

drop policy if exists roadmap_tareas_m on public.roadmap_tareas;
create policy roadmap_tareas_m on public.roadmap_tareas for all
  using (public.es_usuario()) with check (public.es_usuario());
drop policy if exists roadmap_notas_m on public.roadmap_notas;
create policy roadmap_notas_m on public.roadmap_notas for all
  using (public.es_usuario()) with check (public.es_usuario());

-- ---------- Realtime ----------
-- users no va: el front la lee una vez al entrar.
do $$
declare t text;
begin
  foreach t in array array['roadmap_tareas','roadmap_notas'] loop
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

-- Público: lo que se manda afuera (el vídeo de los mails). Leer no pide policy; escribir, la
-- service role o un SUPERADMIN bajo `videos/` (policies al final del archivo).
insert into storage.buckets (id, name, public, file_size_limit)
values ('publico', 'publico', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists adjuntos_read on storage.objects;
create policy adjuntos_read on storage.objects for select
  using (bucket_id = 'roadmap-adjuntos' and public.es_usuario());
drop policy if exists adjuntos_write on storage.objects;
create policy adjuntos_write on storage.objects for insert
  with check (bucket_id = 'roadmap-adjuntos' and public.es_usuario());
drop policy if exists adjuntos_delete on storage.objects;
create policy adjuntos_delete on storage.objects for delete
  using (bucket_id = 'roadmap-adjuntos' and public.es_usuario());

-- El vídeo de los mails (`publico/videos/`) lo reemplaza un SUPERADMIN desde /ajustes. Las
-- policies van al final del archivo: llaman a crm_es_superadmin(), que se crea más abajo.

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
-- Cómo se gestiona la etapa: `sin_contactar` o `por_tarea` (null = sin clasificar). Lo elige un
-- SUPERADMIN en la configuración del funnel; los valores son los de `GESTIONES_DE_ETAPA` del front.
-- Migración `20261017181741_crm_funnel_stages_management_type`.
alter table public.crm_funnel_stages add column if not exists management_type text
  check (management_type is null or management_type in ('sin_contactar', 'por_tarea'));
-- «¿Se puede agendar tarea?» (23/10/2026): con false, a un lead en esta etapa no se le crean tareas
-- (lo corta el trigger `crm_tasks_etapa_permite`). Default true: las etapas de antes no cambian.
-- Migración `20261023160156_crm_funnel_stages_allows_tasks`.
alter table public.crm_funnel_stages add column if not exists allows_tasks boolean not null default true;
-- «¿Se ve en el Dashboard?» (23/10/2026): con true, el Dashboard del CRM lista los leads de esta
-- etapa. Default false: ninguna aparece hasta que se elige. Solo de pantalla.
-- Migración `20261023164216_crm_funnel_stages_show_in_dashboard`.
alter table public.crm_funnel_stages add column if not exists show_in_dashboard boolean not null default false;

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
-- Si cada contacto decide en la inmobiliaria (null = no se sabe). Lo marca el perfil y se completa
-- solo al contestar «sí» en una llamada, para no volver a preguntarlo.
alter table public.crm_clients add column if not exists contact_is_decision_maker             boolean;
alter table public.crm_clients add column if not exists alternative_phone_1_is_decision_maker boolean;
alter table public.crm_clients add column if not exists alternative_phone_2_is_decision_maker boolean;
-- El email de cada contacto alternativo (el principal usa `email`).
alter table public.crm_clients add column if not exists alternative_phone_1_email text;
alter table public.crm_clients add column if not exists alternative_phone_2_email text;
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
-- Desde cuándo volver a llamar a un descartado que «no califica, pero podría calificar» (descarte +
-- 6 meses). La escribe el front al descartar y la borra al volver al funnel; la lista los vuelve a
-- mostrar en «Para recontactar». `discard_reason` guarda el código del motivo (`MOTIVOS_DE_DESCARTE`
-- del front); los descartes de antes guardan texto libre. Migración `20261012214308_crm_etapas_y_motivos_descarte`.
alter table public.crm_leads add column if not exists recontact_at date;
-- Leads importantes (23/10/2026, por pedido): la estrella de la lista, solo SUPERADMIN, y del
-- equipo (lo marcado lo ven en el resumen de /crm todos los SUPERADMIN). Que solo un SUPERADMIN lo
-- cambie lo corta el trigger crm_leads_importante_solo_superadmin, más abajo: la RLS deja escribir
-- a cualquiera con write sobre la cartera. Migración `20261023135323_crm_leads_importante`.
alter table public.crm_leads add column if not exists importante boolean not null default false;

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
-- La hora de la tarea, opcional: hora de reloj local de quien la agendó, sin zona, como `due_date`
-- es un día sin zona. Null = sin hora (todo el día). Solo significa algo con `due_date`; con hora,
-- el front avisa 5 minutos antes mientras el CRM esté abierto. `add column` y no en el `create
-- table` para que alcance con correr esto sobre una base que ya tiene la tabla. Migración
-- `20261017130259_crm_tasks_due_time`.
alter table public.crm_tasks add column if not exists due_time time;

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

-- `importante` lo cambia solo un SUPERADMIN activo (espejo: `puedeMarcarImportante()` del front).
-- Sin sesión (auth.uid() null: service role, postgres) no se corta: la RLS ya no deja entrar a anon.
create or replace function public.crm_leads_importante_solo_superadmin()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.crm_es_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.importante then
      raise exception 'crm_importante_solo_superadmin' using errcode = '42501';
    end if;
  elsif new.importante is distinct from old.importante then
    raise exception 'crm_importante_solo_superadmin' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists crm_leads_importante_solo_superadmin on public.crm_leads;
create trigger crm_leads_importante_solo_superadmin before insert or update of importante on public.crm_leads
  for each row execute function public.crm_leads_importante_solo_superadmin();
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

  -- La tarea inicial, salvo que la etapa no deje agendar tareas (`allows_tasks`, 23/10/2026): el
  -- trigger de crm_tasks la rechazaría y se caería el alta entero.
  if coalesce((select allows_tasks from public.crm_funnel_stages where id = v_stage_id), true) then
    insert into public.crm_tasks (lead_id, title, due_date, assigned_to, created_by)
    values (v_lead_id, 'Asesorar cliente', p_initial_task_due_date, p_assigned_to, auth.uid());
  end if;

  return json_build_object('lead_id', v_lead_id, 'client_id', v_client_id, 'client_reused', v_reused);
end;
$$;

-- REVOKE primero: un REVOKE ALL posterior se llevaría también el GRANT. Y a PUBLIC, no solo a
-- anon: anon hereda de PUBLIC.
revoke all on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  to authenticated;

-- ===== Etapas donde no se agendan tareas (23/10/2026) =====
-- Con `crm_funnel_stages.allows_tasks = false`, no se crea ninguna tarea para un lead en esa etapa,
-- venga de donde venga. Solo la creación: las que ya tenía se siguen editando, completando y borrando.
-- Es la regla de verdad; `permiteAgendarTarea` (src/pages/crm/lib/gestionDeEtapa.ts) es el espejo
-- en pantalla. Sin lead o lead sin etapa, pasa. Security definer: lee la etapa sin depender de la
-- RLS de quien inserta. Migración `20261023160156_crm_funnel_stages_allows_tasks`.
create or replace function public.crm_tasks_etapa_permite()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.lead_id is not null and exists (
    select 1 from public.crm_leads l
      join public.crm_funnel_stages s on s.id = l.funnel_stage_id
     where l.id = new.lead_id and s.allows_tasks = false) then
    raise exception 'crm_etapa_sin_tareas';
  end if;
  return new;
end;
$$;
revoke execute on function public.crm_tasks_etapa_permite() from public, anon, authenticated;

drop trigger if exists crm_tasks_etapa_permite on public.crm_tasks;
create trigger crm_tasks_etapa_permite before insert on public.crm_tasks
  for each row execute function public.crm_tasks_etapa_permite();
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

-- ---------- Baja de un miembro: crm_dar_de_baja_miembro ----------
-- Migración `20261013181105_baja_de_miembro`.
-- Dar de baja a un miembro del equipo desde /equipo (13/10/2026).
--
-- La baja sigue siendo `activo = false` y nunca un delete (las crm_* apuntan a `users` con FK
-- restrict y el roadmap guarda los uuids adentro de su JSON). Lo nuevo es que, en la misma
-- transacción, lo que la persona tenía en curso pasa a otra:
--   - sus leads (todos los no borrados, descartados incluidos): la cartera queda vacía. El
--     historial de asignación lo escribe el trigger de siempre; el comentario SYSTEM, acá.
--   - sus tareas del CRM sin completar. Las completadas se quedan: dicen quién las hizo.
--   - sus reuniones programadas que todavía no empezaron. Las pasadas, igual que las tareas.
--   - las tareas del roadmap sin terminar donde figura en `pend` (y `resp`, que es `pend[0]`), y
--     los pasos sin terminar de esas tareas que tenía a su nombre.
--   - sus filas de `crm_data_access`, como viewer y como subject: un inactivo no ve nada, y la
--     cartera de la que eran el permiso quedó vacía. Si vuelve, los permisos se dan de nuevo.
-- La caja (`users.caja`, `expenses.paid_by`) no se toca: sacar a alguien del reparto mueve los
-- saldos de todos, y eso se decide aparte.
--
-- Solo SUPERADMIN, y no sobre sí mismo (se quedaría afuera a mitad de la pantalla).
-- Con `p_simular` no escribe nada y devuelve cuánto movería: es el preview del dialog, y sirve
-- también sin sucesor elegido. Los conteos usan los mismos filtros que los updates.
-- Sin sucesor solo se puede si no hay nada que mover.
create or replace function public.crm_dar_de_baja_miembro(
  p_user_id  uuid,
  p_sucesor  uuid default null,
  p_simular  boolean default true
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_nombre         text;
  v_nombre_sucesor text;
  v_leads          int;
  v_tareas         int;
  v_reuniones      int;
  v_roadmap        int;
  v_lead           uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_baja_solo_superadmin';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'crm_baja_propia';
  end if;
  select nombre into v_nombre from public.users where id = p_user_id and activo;
  if v_nombre is null then
    raise exception 'crm_baja_ya_inactivo';
  end if;
  if p_sucesor is not null then
    if p_sucesor = p_user_id then
      raise exception 'crm_baja_sucesor_invalido';
    end if;
    select nombre into v_nombre_sucesor from public.users where id = p_sucesor and activo;
    if v_nombre_sucesor is null then
      raise exception 'crm_responsable_inactivo';
    end if;
  end if;

  select count(*) into v_leads from public.crm_leads
    where assigned_to = p_user_id and deleted_at is null;
  select count(*) into v_tareas from public.crm_tasks
    where assigned_to = p_user_id and not completed and deleted_at is null;
  select count(*) into v_reuniones from public.crm_meetings
    where assigned_to = p_user_id and status = 'scheduled' and starts_at > now() and deleted_at is null;
  select count(*) into v_roadmap from public.roadmap_tareas t
    where t.estado <> 'Hecho'
      and (t.pend ? p_user_id::text
           or exists (select 1 from jsonb_array_elements(t.subtareas) s
                      where s->>'resp' = p_user_id::text and coalesce(s->>'estado', '') <> 'Hecho'));

  if p_simular then
    return json_build_object('leads', v_leads, 'tareas', v_tareas, 'reuniones', v_reuniones,
                             'roadmap', v_roadmap, 'simulado', true);
  end if;

  if p_sucesor is null and v_leads + v_tareas + v_reuniones + v_roadmap > 0 then
    raise exception 'crm_baja_falta_sucesor';
  end if;

  if p_sucesor is not null then
    -- De a uno para dejar el comentario de cada lead, como `reasignarLead()` del front.
    for v_lead in
      update public.crm_leads set assigned_to = p_sucesor, last_important_event_at = now()
      where assigned_to = p_user_id and deleted_at is null
      returning id
    loop
      insert into public.crm_comments (lead_id, description, comment_type, created_by)
      values (v_lead, format('Lead reasignado de %s a %s (baja de %s).', v_nombre, v_nombre_sucesor, v_nombre),
              'SYSTEM', auth.uid());
    end loop;

    update public.crm_tasks set assigned_to = p_sucesor
      where assigned_to = p_user_id and not completed and deleted_at is null;

    update public.crm_meetings set assigned_to = p_sucesor
      where assigned_to = p_user_id and status = 'scheduled' and starts_at > now() and deleted_at is null;

    -- `pend` sin el que se va y con el sucesor en su lugar, sin repetirlo si ya estaba.
    -- `resp` acompaña a `pend[0]`, como en el front.
    update public.roadmap_tareas t set
      pend = n.pend,
      resp = coalesce(n.pend->>0, ''),
      subtareas = n.subtareas
    from (
      select t2.id,
        (select coalesce(jsonb_agg(v order by o), '[]'::jsonb) from (
           select v, min(o) o from (
             select case when e = to_jsonb(p_user_id::text) then to_jsonb(p_sucesor::text) else e end v, o
             from jsonb_array_elements(t2.pend) with ordinality x(e, o)
           ) r group by v
         ) d) pend,
        (select coalesce(jsonb_agg(
           case when s->>'resp' = p_user_id::text and coalesce(s->>'estado', '') <> 'Hecho'
                then jsonb_set(s, '{resp}', to_jsonb(p_sucesor::text)) else s end order by o), '[]'::jsonb)
         from jsonb_array_elements(t2.subtareas) with ordinality y(s, o)) subtareas
      from public.roadmap_tareas t2
      where t2.estado <> 'Hecho'
        and (t2.pend ? p_user_id::text
             or exists (select 1 from jsonb_array_elements(t2.subtareas) s
                        where s->>'resp' = p_user_id::text and coalesce(s->>'estado', '') <> 'Hecho'))
    ) n
    where t.id = n.id;
  end if;

  delete from public.crm_data_access where viewer_id = p_user_id or subject_id = p_user_id;

  update public.users set activo = false where id = p_user_id;

  return json_build_object('leads', v_leads, 'tareas', v_tareas, 'reuniones', v_reuniones,
                           'roadmap', v_roadmap, 'simulado', false);
end;
$$;

revoke all on function public.crm_dar_de_baja_miembro(uuid, uuid, boolean) from public, anon;
grant execute on function public.crm_dar_de_baja_miembro(uuid, uuid, boolean) to authenticated;

-- ---------- Teléfono de un miembro: crm_set_member_phone ----------
-- Migración `20261019140832_users_phone`. El front no escribe `users`: el teléfono que se
-- carga desde /equipo pasa por acá. Solo SUPERADMIN, sobre cualquiera. Vacío lo borra. Que el
-- número sea válido lo mira el front (libphonenumber); acá solo que tenga dígitos.
create or replace function public.crm_set_member_phone(
  p_user_id  uuid,
  p_phone    text
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_phone_superadmin_only';
  end if;
  if v_phone is not null and length(regexp_replace(v_phone, '\D', '', 'g')) < 6 then
    raise exception 'crm_phone_invalid';
  end if;
  update public.users set phone = v_phone, updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'crm_member_not_found';
  end if;
end;
$$;

revoke execute on function public.crm_set_member_phone(uuid, text) from public, anon;
grant execute on function public.crm_set_member_phone(uuid, text) to authenticated;

-- ---------- Apellido de un miembro: crm_set_member_last_name ----------
-- Migración `20261019142535_users_last_name`. Como el teléfono: el front no escribe `users`.
-- Solo SUPERADMIN, sobre cualquiera. Vacío lo borra.
create or replace function public.crm_set_member_last_name(
  p_user_id   uuid,
  p_last_name text
) returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_last_name text := nullif(btrim(coalesce(p_last_name, '')), '');
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_last_name_superadmin_only';
  end if;
  update public.users set last_name = v_last_name, updated_at = now() where id = p_user_id;
  if not found then
    raise exception 'crm_member_not_found';
  end if;
end;
$$;

revoke execute on function public.crm_set_member_last_name(uuid, text) from public, anon;
grant execute on function public.crm_set_member_last_name(uuid, text) to authenticated;

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

-- Las etapas del SDR (10/10/2026). La primera es la NEW de siempre, renombrada: el alta y el
-- importador la buscan por `value`. Las del medio son CUSTOM, como las que se crean desde la
-- configuración del funnel. Solo para un proyecto vacío: en producción no hubo migración de
-- etapas (ya tenía las suyas armadas a mano) y se acomodan desde la configuración del funnel.
insert into public.crm_funnel_stages
  (label, value, position, priority_id, management_tolerance_hours,
   is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
select * from (values
  ('Intentando contactar',                   'NEW',       1, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, false, false, true),
  ('Intentando contactar decisor',           'CUSTOM',    2, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, true,  true,  true),
  ('Contactado (decisor o influencer)',      'CUSTOM',    3, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, true,  true,  true),
  ('Seguimiento (le interesa más adelante)', 'CUSTOM',    4, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, true,  true,  true),
  ('Meeting booked',                         'CUSTOM',    5, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, true,  true,  true),
  ('Descartado',                             'DISCARDED', 6, null::uuid, null::integer,
   true,  false, false, false)
) v(label, value, position, priority_id, management_tolerance_hours,
    is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
where not exists (select 1 from public.crm_funnel_stages);

-- ---------- El vídeo de los mails: publico/videos/, solo SUPERADMIN (/ajustes) ----------
drop policy if exists publico_videos_read on storage.objects;
create policy publico_videos_read on storage.objects for select to authenticated
  using (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin());
drop policy if exists publico_videos_insert on storage.objects;
create policy publico_videos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin());
drop policy if exists publico_videos_update on storage.objects;
create policy publico_videos_update on storage.objects for update to authenticated
  using (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin())
  with check (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin());

-- ---------- Emails enviados y rebotes: crm_emails (migraciones 20261020171333_crm_emails y
-- 20261020174926_crm_emails_listo) ----------
-- Los emails que salen por Resend y qué les pasó (20/10/2026). Hasta acá el envío no dejaba
-- rastro: Resend contestaba «aceptado» y el rebote llegaba minutos después sin que nadie se
-- enterara. `send-email` escribe la fila al mandar (con el id que devuelve Resend) y la edge
-- function `resend-webhook` le cambia el estado cuando Resend avisa. El front lee los que no
-- llegaron: la campana de la cabecera del CRM (los tuyos sin ver) y el cartel del lead.
-- Escribe solo la service role: no hay policies de escritura.
create table if not exists public.crm_emails (
  id            uuid primary key default gen_random_uuid(),
  resend_id     text not null unique,
  -- Null: el email de prueba de la cabecera, que no es de ningún lead.
  lead_id       uuid references public.crm_leads(id) on delete cascade,
  sent_by       uuid not null references public.users(id) on delete restrict,
  to_email      text not null,
  subject       text not null default '',
  plantilla     text,
  status        text not null default 'sent'
                check (status in ('sent', 'delivery_delayed', 'delivered', 'bounced', 'failed', 'suppressed', 'complained')),
  -- El motivo que da Resend (bounce.message, failed.reason, suppressed.message), tal cual.
  status_detail text,
  status_at     timestamptz,
  sent_at       timestamptz not null default now(),
  -- «Ya se atendió»: lo marca quien lo mandó (campana) o quien escribe el lead (cartel, «Listo»).
  -- Solo significa algo en los que no llegaron.
  seen_at       timestamptz,
  seen_by       uuid references public.users(id) on delete set null
);

create index if not exists crm_emails_lead_idx on public.crm_emails (lead_id);
create index if not exists crm_emails_sent_by_idx on public.crm_emails (sent_by, sent_at desc);

alter table public.crm_emails enable row level security;

-- Lo ve quien lo mandó y quien puede leer el lead.
drop policy if exists crm_emails_leer on public.crm_emails;
create policy crm_emails_leer on public.crm_emails for select using (
  public.es_usuario() and (
    sent_by = auth.uid()
    or (lead_id is not null and public.crm_puede_lead(lead_id, 'read'))
  )
);

-- El evento del webhook. Los eventos de Resend pueden llegar desordenados (un `delivered` atrasado
-- después del `bounced`), así que el estado solo avanza: enviado < demorado < entregado < no llegó.
-- `complained` va al final porque llega después de `delivered`. Devuelve si cambió algo.
create or replace function public.crm_email_evento(
  p_resend_id text,
  p_status    text,
  p_detalle   text,
  p_at        timestamptz
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  v_rango constant jsonb := '{"sent":0,"delivery_delayed":1,"delivered":2,"bounced":3,"failed":3,"suppressed":3,"complained":3}';
begin
  if not (v_rango ? p_status) then
    raise exception 'crm_email_estado_invalido';
  end if;
  update public.crm_emails
     set status = p_status,
         status_detail = coalesce(nullif(btrim(coalesce(p_detalle, '')), ''), status_detail),
         status_at = coalesce(p_at, now())
   where resend_id = p_resend_id
     and (v_rango ->> p_status)::int >= (v_rango ->> status)::int
     and status <> p_status;
  return found;
end;
$$;

revoke execute on function public.crm_email_evento(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_email_evento(text, text, text, timestamptz) to service_role;

-- «Listo» en cada email que no llegó (20/10/2026, por pedido). `seen_at` pasa a ser «ya se
-- atendió» para todos y no solo «quien lo mandó vio el aviso»: marcarlo desde el cartel del lead
-- apaga la campana de quien lo mandó, y al revés. Lo puede marcar quien lo mandó o cualquiera que
-- pueda escribir el lead, y se puede deshacer. `seen_by` dice quién lo marcó (el tooltip).
alter table public.crm_emails
  add column if not exists seen_by uuid references public.users(id) on delete set null;

create or replace function public.crm_email_visto(p_id uuid, p_visto boolean default true) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_email public.crm_emails%rowtype;
begin
  if not public.es_usuario() then
    raise exception 'crm_no_autorizado';
  end if;
  select * into v_email from public.crm_emails where id = p_id;
  if not found then
    raise exception 'crm_email_no_encontrado';
  end if;
  if v_email.sent_by <> auth.uid()
     and not (v_email.lead_id is not null and public.crm_puede_lead(v_email.lead_id, 'write')) then
    raise exception 'crm_no_autorizado';
  end if;
  if p_visto then
    update public.crm_emails set seen_at = coalesce(seen_at, now()), seen_by = coalesce(seen_by, auth.uid())
     where id = p_id;
  else
    update public.crm_emails set seen_at = null, seen_by = null where id = p_id;
  end if;
end;
$$;

revoke execute on function public.crm_email_visto(uuid, boolean) from public, anon;
grant execute on function public.crm_email_visto(uuid, boolean) to authenticated;

-- Realtime: el rebote se ve en la campana sin recargar. Aplica la RLS de arriba.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_emails') then
    alter publication supabase_realtime add table public.crm_emails;
  end if;
end $$;

-- ---------- La plantilla de cada email es el último enviado: crm_email_plantillas
-- (migración 20261021121051_crm_email_plantillas) ----------
-- El último email enviado de cada plantilla es la plantilla (21/10/2026). `send-email` guarda acá
-- el texto de cada envío («Presentación con vídeo» y «Mail puntual») y el diálogo «Mensajes» del
-- CRM arranca desde ahí en vez del texto de fábrica de `_shared/plantillasEmail.ts`. Una fila por
-- plantilla, del equipo. Sin el nombre del lead ni el botón armado solo (`plantillaGuardable`).
-- Escribe solo la service role: no hay policies de escritura.
create table if not exists public.crm_email_plantillas (
  plantilla  text primary key check (plantilla in ('presentacion-video', 'puntual')),
  campos     jsonb not null default '{}',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.crm_email_plantillas enable row level security;

drop policy if exists crm_email_plantillas_leer on public.crm_email_plantillas;
create policy crm_email_plantillas_leer on public.crm_email_plantillas for select using (public.es_usuario());

-- ---------- Google Calendar: conexión, agenda y sync de reuniones
-- (migración 20261021151726_crm_google_calendar) ----------
-- (Ver el encabezado de la migración: secrets que hacen falta y de dónde se copió.)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- La conexión de cada uno ----------
-- Una fila por persona y proveedor (hoy solo Google). Los tokens van cifrados (AES-GCM con
-- TOKEN_ENCRYPTION_KEY) y no los lee nadie más que la service role: el front ve solo las columnas
-- de abajo y solo su fila. Sin `organization_id` (el producto lo tiene): acá no hay organizaciones.
create table if not exists public.calendar_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  provider          text not null check (provider = 'google'),
  refresh_token     text not null,
  access_token      text,
  token_expires_at  timestamptz,
  connected_email   text,
  calendar_id       text not null default 'primary',
  watch_channel_id  text,
  watch_resource_id text,
  watch_expires_at  timestamptz,
  watch_token       text,
  sync_token        text,
  status            text not null default 'active' check (status in ('active', 'revoked', 'error')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint calendar_connections_user_provider_unique unique (user_id, provider)
);

alter table public.calendar_connections enable row level security;

drop policy if exists calendar_connections_leer on public.calendar_connections;
create policy calendar_connections_leer on public.calendar_connections for select
  using (user_id = (select auth.uid()));
-- Desconectar es borrar la fila propia. Escribirla (alta, tokens, watch) es solo de la service role.
drop policy if exists calendar_connections_borrar on public.calendar_connections;
create policy calendar_connections_borrar on public.calendar_connections for delete
  using (user_id = (select auth.uid()));

-- Grants por columna, como en el producto: aunque la RLS deje leer la fila, los tokens no salen.
revoke all on table public.calendar_connections from anon, authenticated;
grant select (id, user_id, provider, connected_email, calendar_id, status, created_at, updated_at)
  on table public.calendar_connections to authenticated;
grant delete on table public.calendar_connections to authenticated;
grant all on table public.calendar_connections to service_role;

-- ---------- El `state` de OAuth, de un solo uso ----------
-- El callback inserta el nonce del `state`: si ya estaba, es un replay. `calendar-sync` purga los
-- de más de una hora en cada barrido. Solo la service role.
create table if not exists public.oauth_state_nonces (
  nonce   text primary key,
  used_at timestamptz not null default now()
);

alter table public.oauth_state_nonces enable row level security;
revoke all on table public.oauth_state_nonces from anon, authenticated;
grant all on table public.oauth_state_nonces to service_role;

-- ---------- Las reuniones que van a Google ----------
-- Las columnas de sync de `visits` del producto, con el mismo significado:
--   sync_status: pending (hay algo para empujar), synced, error (reintenta hasta 5 veces),
--                disabled (su responsable no tiene Google conectado).
--   ics_sequence: el guard optimista contra el webhook (el nombre viene del .ics del producto).
--   color_id / reminder_minutes: el color y el aviso del evento en Google.
--   guest_user_ids / guest_emails: los invitados (compañeros por id, el resto por email); Google
--                les manda la invitación.
-- `sync_status` nace en 'disabled' para las que ya existen (nadie tenía Google conectado: se
-- ofrecen desde Ajustes con «Sincronizar N reuniones existentes») y el default pasa a 'pending'
-- después, para las nuevas. Así no hay un `update` de toda la tabla.
alter table public.crm_meetings
  add column if not exists sync_status       text not null default 'disabled',
  add column if not exists sync_error        text,
  add column if not exists sync_attempts     integer not null default 0,
  add column if not exists external_event_id text,
  add column if not exists external_provider text,
  add column if not exists ics_sequence      integer not null default 0,
  add column if not exists color_id          text,
  add column if not exists reminder_minutes  integer,
  add column if not exists guest_user_ids    uuid[] not null default '{}',
  add column if not exists guest_emails      text[] not null default '{}';
alter table public.crm_meetings alter column sync_status set default 'pending';

alter table public.crm_meetings drop constraint if exists crm_meetings_sync_status_check;
alter table public.crm_meetings add constraint crm_meetings_sync_status_check
  check (sync_status in ('pending', 'synced', 'error', 'disabled'));
alter table public.crm_meetings drop constraint if exists crm_meetings_external_provider_check;
alter table public.crm_meetings add constraint crm_meetings_external_provider_check
  check (external_provider = 'google');

-- El barrido busca las pendientes cada 5 minutos.
create index if not exists crm_meetings_sync_pending_idx on public.crm_meetings (updated_at)
  where deleted_at is null and sync_status in ('pending', 'error');

-- ---------- El último color elegido ----------
-- El producto recuerda el color con el que cada uno agendó su última visita y lo preselecciona.
-- Acá el front no escribe `users` (no hay policies de escritura), así que va por una RPC que solo
-- toca la columna de quien llama.
alter table public.users
  add column if not exists last_meeting_color_id text;

create or replace function public.crm_set_last_meeting_color(
  p_color_id text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.es_usuario() then
    raise exception 'crm_no_access';
  end if;
  update public.users set last_meeting_color_id = nullif(btrim(coalesce(p_color_id, '')), '')
   where id = auth.uid();
end;
$$;

revoke execute on function public.crm_set_last_meeting_color(text) from public, anon;
grant execute on function public.crm_set_last_meeting_color(text) to authenticated;

-- ---------- Los dos crons ----------
-- La anon key va escrita y no como placeholder (lección del producto: un placeholder sin
-- reemplazar dejó un cron dando 401 durante un mes sin que nadie se enterara). No es un secreto:
-- es la VITE_SUPABASE_ANON_KEY que viaja en el bundle. Si se rota, hay que re-schedulear los dos.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'calendar-sync-sweep') then
    perform cron.unschedule('calendar-sync-sweep');
  end if;
  if exists (select 1 from cron.job where jobname = 'calendar-watch-renewal') then
    perform cron.unschedule('calendar-watch-renewal');
  end if;
end
$$;

-- Lo pendiente que el fire-and-forget del front no llegó a empujar, y los reintentos.
select cron.schedule(
  'calendar-sync-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cXd4bm11eHVpaXlkc3VlYXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzA0NDgsImV4cCI6MjEwNjI0NjQ0OH0.DrjXR-_SrMnRTYX8TDa3L6K6sN93HWsI_jD1_0ENw9o'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Los watch de Google vencen a los ~7 días: se renuevan los que vencen en menos de uno.
select cron.schedule(
  'calendar-watch-renewal',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cXd4bm11eHVpaXlkc3VlYXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzA0NDgsImV4cCI6MjEwNjI0NjQ0OH0.DrjXR-_SrMnRTYX8TDa3L6K6sN93HWsI_jD1_0ENw9o'
    ),
    body := '{"action":"renew-watches"}'::jsonb
  );
  $$
);

-- ---------- Avisos a leads: preferencias, bandeja y triggers de crm_meetings
-- (migración 20261021155052_lead_notifications) ----------
-- Avisos a leads (21/10/2026), copiados de `propelia-frontend` (sus migraciones
-- 20261009154024_lead_notifications, 20261014202726_lead_notification_visit_property_events y
-- 20261015204322_lead_notification_preferences_by_org). Lo que allá son visitas acá son las demos:
-- toda reunión del CRM con lead (`crm_meetings`). Al agendarla, moverla o cancelarla se le avisa a la
-- inmobiliaria por las vías que un SUPERADMIN prendió en Ajustes → «Avisos a leads» (hoy solo email;
-- SMS y WhatsApp están cableados y apagados, como allá).
--
-- Outbox: los triggers de crm_meetings SÓLO encolan; el envío lo hace la edge function
-- `lead-notifications-dispatch`, que corre cada minuto por cron.
--
-- Diferencias con el producto: sin organizaciones (las preferencias son del equipo; escribe un
-- SUPERADMIN), sin el grupo «Propiedad» (vendida / alquilada: acá no hay inmuebles), y el cron va con
-- la anon key como los del calendario, no con un secreto de Vault.

-- ── Preferencias, del equipo ─────────────────────────────────────────────────────────────
-- Sin fila = apagado. Que una vía o un evento tenga fila no significa que se envíe: el
-- orquestador sólo despacha las vías disponibles (AVAILABLE_CHANNELS) y los eventos con handler.
create table if not exists public.lead_notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'demo_scheduled', 'demo_rescheduled', 'demo_cancelled',
    'demo_reminder_day_before', 'demo_reminder_same_day', 'demo_review_request'
  )),
  channel    text not null check (channel in ('email', 'sms', 'whatsapp')),
  enabled    boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint lead_notification_preferences_event_channel_key unique (event_type, channel)
);

alter table public.lead_notification_preferences enable row level security;

-- Leer: cualquiera del equipo. Escribir: solo un SUPERADMIN (el «admin de la org» del producto).
drop policy if exists lead_notification_preferences_leer on public.lead_notification_preferences;
create policy lead_notification_preferences_leer on public.lead_notification_preferences
  for select using (public.es_usuario());
drop policy if exists lead_notification_preferences_escribir on public.lead_notification_preferences;
create policy lead_notification_preferences_escribir on public.lead_notification_preferences
  for all using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- ── Bandeja de salida ────────────────────────────────────────────────────────────────────
-- subject_id sin FK a propósito: el registro sobrevive al borrado de la reunión.
-- Una demo se puede reprogramar varias veces: cada horario nuevo es un evento distinto
-- (dedupe_key = el horario). dedupe_key '' = un solo evento por (type, subject_id).
create table if not exists public.lead_notification_events (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  subject_id      uuid not null,
  actor_user_id   uuid not null references public.users(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text not null default '',
  created_at      timestamptz not null default now(),
  processed_at    timestamptz,
  constraint lead_notification_events_type_subject_dedupe_key unique (type, subject_id, dedupe_key)
);

create index if not exists lead_notification_events_due_idx on public.lead_notification_events (next_attempt_at)
  where status in ('pending', 'processing');

alter table public.lead_notification_events enable row level security;

-- Sólo lectura para quien tiene la demo; las escrituras son del service role y de los triggers.
drop policy if exists lead_notification_events_leer on public.lead_notification_events;
create policy lead_notification_events_leer on public.lead_notification_events
  for select using (actor_user_id = (select auth.uid()));

-- ── Lo que salió de verdad ───────────────────────────────────────────────────────────────
create table if not exists public.lead_notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.lead_notification_events(id) on delete cascade,
  channel             text not null check (channel in ('email', 'sms', 'whatsapp')),
  status              text not null check (status in ('sent', 'failed', 'skipped')),
  recipient           text,
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint lead_notification_deliveries_event_channel_key unique (event_id, channel)
);

alter table public.lead_notification_deliveries enable row level security;

drop policy if exists lead_notification_deliveries_leer on public.lead_notification_deliveries;
create policy lead_notification_deliveries_leer on public.lead_notification_deliveries
  for select using (
    exists (
      select 1 from public.lead_notification_events e
      where e.id = event_id and e.actor_user_id = (select auth.uid())
    )
  );

-- ── Trigger: demo con lead → evento demo_scheduled ───────────────────────────────────────
create or replace function public.enqueue_demo_scheduled_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_notification_events (type, subject_id, actor_user_id)
  values ('demo_scheduled', new.id, new.assigned_to)
  on conflict (type, subject_id, dedupe_key) do nothing;
  return new;
end;
$$;

revoke execute on function public.enqueue_demo_scheduled_lead_notification() from public, anon, authenticated;

drop trigger if exists crm_meetings_enqueue_lead_notification on public.crm_meetings;
create trigger crm_meetings_enqueue_lead_notification
  after insert on public.crm_meetings
  for each row
  when (new.lead_id is not null and new.deleted_at is null)
  execute function public.enqueue_demo_scheduled_lead_notification();

-- ── Trigger: demo reprogramada o cancelada ───────────────────────────────────────────────
-- Sólo si a la inmobiliaria ya le llegó la confirmación (delivery 'sent' del demo_scheduled de esa
-- demo): no se le avisa un cambio de una demo de la que nunca supo. Si la confirmación sigue
-- pendiente, sale con el horario nuevo y no hace falta otro mail.
create or replace function public.enqueue_demo_change_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_informed boolean;
begin
  if new.lead_id is null or new.deleted_at is not null then
    return new;
  end if;
  -- Una demo que ya pasó no se reprograma ni se cancela "para el lead": es limpieza.
  if new.starts_at <= now() and old.starts_at <= now() then
    return new;
  end if;
  select exists (
    select 1
      from public.lead_notification_events e
      join public.lead_notification_deliveries d on d.event_id = e.id
     where e.type = 'demo_scheduled' and e.subject_id = new.id and d.status = 'sent'
  ) into v_informed;
  if not v_informed then
    return new;
  end if;

  if old.status <> 'cancelled' and new.status = 'cancelled' then
    insert into public.lead_notification_events (type, subject_id, actor_user_id, payload)
    values ('demo_cancelled', new.id, new.assigned_to, jsonb_build_object('starts_at', new.starts_at))
    on conflict (type, subject_id, dedupe_key) do nothing;
  elsif new.status = 'scheduled' and old.starts_at is distinct from new.starts_at and new.starts_at > now() then
    insert into public.lead_notification_events (type, subject_id, actor_user_id, payload, dedupe_key)
    values ('demo_rescheduled', new.id, new.assigned_to,
            jsonb_build_object('previous_starts_at', old.starts_at, 'starts_at', new.starts_at),
            new.starts_at::text)
    on conflict (type, subject_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.enqueue_demo_change_lead_notification() from public, anon, authenticated;

drop trigger if exists crm_meetings_enqueue_lead_notification_change on public.crm_meetings;
create trigger crm_meetings_enqueue_lead_notification_change
  after update of starts_at, status on public.crm_meetings
  for each row
  when (old.starts_at is distinct from new.starts_at or old.status is distinct from new.status)
  execute function public.enqueue_demo_change_lead_notification();

-- ── Reclamo de eventos (lo llama sólo el orquestador) ────────────────────────────────────
-- skip locked: dos corridas superpuestas nunca agarran el mismo evento.
-- processing con locked_at > 10 min = worker caído: se vuelve a reclamar, pero sólo si le quedan
-- intentos (attempts < 3 = MAX_ATTEMPTS del dispatcher).
create or replace function public.claim_lead_notification_events(p_limit int)
returns setof public.lead_notification_events
language sql
security definer
set search_path = public
as $$
  update public.lead_notification_events e
     set status = 'processing',
         locked_at = now(),
         attempts = e.attempts + 1
   where e.id in (
     select c.id
       from public.lead_notification_events c
      where (c.status = 'pending' and c.next_attempt_at <= now())
         or (c.status = 'processing' and c.locked_at < now() - interval '10 minutes' and c.attempts < 3)
      order by c.created_at
      limit p_limit
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function public.claim_lead_notification_events(int) from public, anon, authenticated;
grant execute on function public.claim_lead_notification_events(int) to service_role;

-- ── El cron, cada minuto ─────────────────────────────────────────────────────────────────
-- Anon key escrita, como `calendar-sync-sweep` (ver 20261021151726_crm_google_calendar).
-- pg_net da `succeeded` aunque la function conteste 401. Para ver que ANDA:
--   select id, status_code, created from net._http_response order by created desc limit 5;
--   select status, count(*) from lead_notification_events group by 1;
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lead-notifications-dispatch') then
    perform cron.unschedule('lead-notifications-dispatch');
  end if;
end
$$;

select cron.schedule(
  'lead-notifications-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/lead-notifications-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cXd4bm11eHVpaXlkc3VlYXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzA0NDgsImV4cCI6MjEwNjI0NjQ0OH0.DrjXR-_SrMnRTYX8TDa3L6K6sN93HWsI_jD1_0ENw9o'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- (migración 20261021183824_lead_notifications_demos_activos)
-- Los tres avisos de demo prendidos por email (21/10/2026, por pedido): agendada, reprogramada y
-- cancelada. Es lo mismo que prenderlos en Ajustes → «Avisos a leads»; va acá para que quede
-- escrito. Si alguien ya los tocó a mano, gana lo de la pantalla: `on conflict do nothing`.
insert into public.lead_notification_preferences (event_type, channel, enabled)
values
  ('demo_scheduled', 'email', true),
  ('demo_rescheduled', 'email', true),
  ('demo_cancelled', 'email', true)
on conflict (event_type, channel) do nothing;

-- ===== Clientes y su onboarding (26/10/2026) =====
-- (migración 20261026184212_clientes_onboarding)
-- `crm_leads.lead_type`: LEAD, ONBOARDING (firmó y se está dando de alta) o CLIENT. Un lead pasa a
-- ONBOARDING solo al entrar a una etapa con `starts_onboarding` («Contratado»), y el trigger le crea
-- su `client_onboardings`. /clientes (solo SUPERADMIN) lista los ONBOARDING. Diseño en
-- docs/onboarding/clientes.html y docs/onboarding/MODELO_DATOS.md.
-- ---------- Qué es cada lead ----------
do $$ begin
  create type public.crm_lead_type as enum ('LEAD', 'ONBOARDING', 'CLIENT');
exception when duplicate_object then null;
end $$;

alter table public.crm_leads add column if not exists lead_type public.crm_lead_type not null default 'LEAD';
create index if not exists crm_leads_lead_type_idx on public.crm_leads (lead_type) where lead_type <> 'LEAD';

-- El vínculo con su organización en Propelia (el producto). Sin FK: es otro proyecto. El nombre
-- de la org no se guarda: se le pide al puente cuando hace falta.
alter table public.crm_leads add column if not exists propelia_organization_id uuid;
comment on column public.crm_leads.propelia_organization_id is
  'Organización del cliente en Propelia (proyecto gvkdyxhxsnpumxlhvhsm). Sin FK: es otra base. La deja el import de usuarios del onboarding, paso 1.';
-- Una organización va con un solo lead.
create unique index if not exists crm_leads_propelia_org_unique
  on public.crm_leads (propelia_organization_id)
  where propelia_organization_id is not null and deleted_at is null;

-- ---------- Qué etapa dispara el onboarding ----------
-- «Onboarding» (Sí/No) en la configuración del funnel, como «Dashboard» y «Tareas». No se busca
-- la etapa por nombre: las etapas se renombran. La RLS de crm_funnel_stages ya cubre la columna.
alter table public.crm_funnel_stages add column if not exists starts_onboarding boolean not null default false;
-- Arranca marcada «Contratado», que es la que hay hoy. Una sola vez: después se cambia desde el funnel.
update public.crm_funnel_stages set starts_onboarding = true
  where label = 'Contratado' and deleted_at is null
    and not exists (select 1 from public.crm_funnel_stages where starts_onboarding);

-- ---------- El onboarding ----------
create table if not exists public.client_onboardings (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null unique references public.crm_leads (id) on delete cascade,
  -- Quién de soporte lleva el alta. Nace vacío: el trigger no sabe quién la va a hacer.
  assigned_to  uuid references public.users (id) on delete set null,
  -- Quien movió el lead a la etapa (el comercial); null si fue por SQL.
  created_by   uuid references public.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  -- null = en curso. Lo escribe `client_onboarding_completar`.
  completed_at timestamptz
);

-- El equipo del cliente: lo carga el Excel de usuarios (paso 1). El responsable nace con el
-- onboarding, con los datos del cliente del CRM, para la plantilla del Excel y el WhatsApp.
create table if not exists public.client_onboarding_members (
  id            uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  first_name    text not null check (btrim(first_name) <> ''),
  last_name     text not null default '',
  email         text,
  phone         text,
  role          text not null default 'agent' check (role in ('agent', 'admin')),
  is_owner      boolean not null default false,
  is_contact    boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists client_onboarding_members_one_owner
  on public.client_onboarding_members (onboarding_id) where is_owner;
create unique index if not exists client_onboarding_members_one_contact
  on public.client_onboarding_members (onboarding_id) where is_contact;
create index if not exists client_onboarding_members_onboarding_id
  on public.client_onboarding_members (onboarding_id);

-- Las tareas hechas. task_id sin FK: el catálogo de pasos está en el código
-- (src/pages/clientes/lib/pasos.ts). Sin fila = pendiente.
create table if not exists public.client_onboarding_tasks (
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  task_id       text not null,
  done_by       uuid references public.users (id) on delete set null default auth.uid(),
  done_at       timestamptz not null default now(),
  primary key (onboarding_id, task_id)
);

-- Los WhatsApp del onboarding. Variables: {nombre} (el responsable), {soporte} (quien envía),
-- {inmobiliaria} y, en link_de_pago, {link}.
create table if not exists public.onboarding_message_templates (
  id         text primary key,
  body       text not null check (btrim(body) <> ''),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.onboarding_message_templates (id, body) values
(
  'contacto_inicial',
  E'¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋\n\n'
  'Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.\n\n'
  'Para crear vuestra cuenta necesito dos cosas:\n\n'
  '1. Que me confirméis el nombre de la inmobiliaria tal como queréis que aparezca en Propelia (¿lo dejamos como «{inmobiliaria}»?).\n\n'
  '2. Que rellenéis el Excel que os adjunto con las personas del equipo que van a usar Propelia: una fila por persona, con nombre, apellido, email, teléfono (con +34) y rol (Administrador o Agente).\n\n'
  'En la columna Responsable, marcad con «Sí» a una sola persona (con rol Administrador): quien se va a encargar de implementar Propelia en la inmobiliaria. Será con quien hable siempre, así la comunicación va por una sola vía y es más ágil.\n\n'
  'Cuando me lo devolváis, os creo todos los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.'
), (
  'configurar_organizacion',
  E'{nombre}, el siguiente paso es dejar lista la organización de {inmobiliaria}. En Propelia, entrad a Ajustes:\n\n'
  '- Organización: el nombre de la inmobiliaria y vuestra web.\n'
  '- Marca: el logo y los colores de la inmobiliaria.\n\n'
  'Si os viene bien, lo hacemos juntos en una llamada de 20 minutos: decidme día y hora.'
), (
  'link_de_pago',
  E'{nombre}, os dejo el enlace para activar la suscripción de {inmobiliaria}:\n\n'
  '{link}\n\n'
  'Se paga con tarjeta, sin necesidad de iniciar sesión. El enlace vale 7 días. Cuando esté hecho, avisadme por aquí.'
), (
  'asignar_y_mails',
  E'{nombre}, ya tenéis la cartera de {inmobiliaria} cargada en Propelia. Dos cosas para empezar a recibir los leads:\n\n'
  '1. En Propiedades, asignad cada inmueble al agente que lo lleva.\n'
  '2. En Idealista, configurad que los mensajes de cada agente se reenvíen a su dirección de Propelia. Os paso las direcciones por aquí.\n\n'
  'Cuando lo tengáis, hacemos una prueba juntos.'
), (
  'integrar_portales',
  E'{nombre}, ahora toca conectar los portales de {inmobiliaria}. En Propelia, entrad a Ajustes → Integraciones y conectad Idealista y Fotocasa.\n\n'
  'Si en algún paso os pide algo que no tenéis a mano, escribidme por aquí y lo vemos juntos.'
)
on conflict (id) do nothing;

-- ---------- RLS: solo SUPERADMIN ----------
alter table public.client_onboardings           enable row level security;
alter table public.client_onboarding_members    enable row level security;
alter table public.client_onboarding_tasks      enable row level security;
alter table public.onboarding_message_templates enable row level security;

drop policy if exists "client_onboardings_superadmin" on public.client_onboardings;
create policy "client_onboardings_superadmin" on public.client_onboardings
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());
drop policy if exists "client_onboarding_members_superadmin" on public.client_onboarding_members;
create policy "client_onboarding_members_superadmin" on public.client_onboarding_members
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());
drop policy if exists "client_onboarding_tasks_superadmin" on public.client_onboarding_tasks;
create policy "client_onboarding_tasks_superadmin" on public.client_onboarding_tasks
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- Las plantillas se editan, no se crean ni se borran desde la app.
drop policy if exists "onboarding_message_templates_select" on public.onboarding_message_templates;
create policy "onboarding_message_templates_select" on public.onboarding_message_templates
  for select to authenticated using (public.crm_es_superadmin());
drop policy if exists "onboarding_message_templates_update" on public.onboarding_message_templates;
create policy "onboarding_message_templates_update" on public.onboarding_message_templates
  for update to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

revoke all on public.client_onboardings, public.client_onboarding_members,
              public.client_onboarding_tasks, public.onboarding_message_templates from anon;
grant select, insert, update, delete on public.client_onboardings, public.client_onboarding_members,
                                        public.client_onboarding_tasks to authenticated;
grant select, update on public.onboarding_message_templates to authenticated;

-- ---------- El paso a ONBOARDING ----------
-- Crea el onboarding de un lead con su responsable (los datos del cliente del CRM). Idempotente:
-- si ya tiene, no hace nada. Solo la llaman el trigger y la service role: es security definer
-- porque lo dispara el comercial, que no ve estas tablas.
create or replace function public.client_onboarding_crear(p_lead_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
begin
  insert into public.client_onboardings (lead_id) values (p_lead_id)
  on conflict (lead_id) do nothing
  returning id into v_id;
  if v_id is null then
    return (select id from public.client_onboardings where lead_id = p_lead_id);
  end if;
  insert into public.client_onboarding_members
    (onboarding_id, first_name, last_name, email, phone, role, is_owner, is_contact)
  select v_id,
         coalesce(nullif(btrim(c.first_name), ''), nullif(btrim(c.company_name), ''), 'Responsable'),
         coalesce(btrim(c.last_name), ''),
         nullif(btrim(c.email), ''),
         nullif(btrim(c.phone), ''),
         'admin', true, true
  from public.crm_leads l
  join public.crm_clients c on c.id = l.client_id
  where l.id = p_lead_id;
  return v_id;
end;
$$;
revoke execute on function public.client_onboarding_crear(uuid) from public, anon, authenticated;

-- `lead_type` lo escribe solo la base. Antes de guardar el lead: rechaza cualquier cambio a mano
-- de la columna y, si el lead (LEAD) entra a una etapa con `starts_onboarding`, lo pasa a
-- ONBOARDING. Solo desde LEAD: un CLIENT que vuelve a pasar por Contratado no reabre nada. Sin
-- sesión (service role, migraciones) no se corta. `client_onboarding_completar` se habilita con
-- `crm.lead_type_rpc`, que vale solo dentro de su transacción.
create or replace function public.crm_leads_lead_type()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('crm.lead_type_rpc', true), '') <> 'on' then
    if (tg_op = 'INSERT' and new.lead_type <> 'LEAD')
       or (tg_op = 'UPDATE' and new.lead_type is distinct from old.lead_type) then
      raise exception 'crm_lead_type_solo_rpc' using errcode = '42501';
    end if;
  end if;
  if new.lead_type = 'LEAD' and new.deleted_at is null and new.funnel_stage_id is not null
     and (tg_op = 'INSERT' or new.funnel_stage_id is distinct from old.funnel_stage_id)
     and exists (select 1 from public.crm_funnel_stages s
                 where s.id = new.funnel_stage_id and s.starts_onboarding and s.deleted_at is null) then
    new.lead_type := 'ONBOARDING';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_lead_type on public.crm_leads;
create trigger crm_leads_lead_type before insert or update of lead_type, funnel_stage_id on public.crm_leads
  for each row execute function public.crm_leads_lead_type();

-- Ya guardado el lead, le crea el onboarding. Va después porque el onboarding apunta al lead.
-- Escucha también `funnel_stage_id`: el `update of` mira las columnas del SET, y el paso a
-- ONBOARDING lo hace el trigger de arriba, no el SET.
create or replace function public.crm_leads_crear_onboarding()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.lead_type = 'ONBOARDING' and (tg_op = 'INSERT' or old.lead_type is distinct from new.lead_type) then
    perform public.client_onboarding_crear(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists crm_leads_crear_onboarding on public.crm_leads;
create trigger crm_leads_crear_onboarding after insert or update of lead_type, funnel_stage_id on public.crm_leads
  for each row execute function public.crm_leads_crear_onboarding();

-- ---------- RPCs de la página ----------
-- El import del Excel de usuarios (paso 1): reemplaza el equipo por el del Excel, deja la org de
-- Propelia que creó el puente en el lead y tilda «Recibir el Excel» e «Importar el Excel». Todo o
-- nada. `p_miembros`: [{first_name, last_name, email, phone, role, is_owner}], uno con is_owner.
create or replace function public.client_onboarding_importar_equipo(
  p_onboarding_id uuid, p_organization_id uuid, p_miembros jsonb
) returns void language plpgsql security invoker set search_path to 'public' as $$
declare
  v_lead uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_solo_superadmin' using errcode = '42501';
  end if;
  select lead_id into v_lead from public.client_onboardings where id = p_onboarding_id;
  if v_lead is null then
    raise exception 'crm_onboarding_no_existe' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_miembros) <> 'array' or jsonb_array_length(p_miembros) = 0 then
    raise exception 'crm_onboarding_sin_miembros' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_miembros) m where coalesce((m->>'is_owner')::boolean, false)) <> 1 then
    raise exception 'crm_onboarding_un_responsable' using errcode = '22023';
  end if;

  delete from public.client_onboarding_members where onboarding_id = p_onboarding_id;
  insert into public.client_onboarding_members
    (onboarding_id, first_name, last_name, email, phone, role, is_owner, is_contact)
  select p_onboarding_id, btrim(m->>'first_name'), coalesce(btrim(m->>'last_name'), ''),
         nullif(btrim(m->>'email'), ''), nullif(btrim(m->>'phone'), ''),
         coalesce(m->>'role', 'agent'),
         coalesce((m->>'is_owner')::boolean, false), coalesce((m->>'is_owner')::boolean, false)
  from jsonb_array_elements(p_miembros) m;

  update public.crm_leads set propelia_organization_id = p_organization_id where id = v_lead;

  insert into public.client_onboarding_tasks (onboarding_id, task_id)
  values (p_onboarding_id, 'contacto.excel-recibido'), (p_onboarding_id, 'contacto.importar-usuarios')
  on conflict do nothing;
end;
$$;

-- Termina el alta: `completed_at` y el lead pasa a CLIENT (sale de la lista de /clientes).
create or replace function public.client_onboarding_completar(p_onboarding_id uuid)
returns void language plpgsql security invoker set search_path to 'public' as $$
declare
  v_lead uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_solo_superadmin' using errcode = '42501';
  end if;
  update public.client_onboardings set completed_at = now()
    where id = p_onboarding_id and completed_at is null
    returning lead_id into v_lead;
  if v_lead is null then
    raise exception 'crm_onboarding_no_existe' using errcode = 'P0002';
  end if;
  perform set_config('crm.lead_type_rpc', 'on', true);
  update public.crm_leads set lead_type = 'CLIENT' where id = v_lead;
  perform set_config('crm.lead_type_rpc', '', true);
end;
$$;

revoke execute on function public.client_onboarding_importar_equipo(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.client_onboarding_completar(uuid) from public, anon;
grant execute on function public.client_onboarding_importar_equipo(uuid, uuid, jsonb) to authenticated;
grant execute on function public.client_onboarding_completar(uuid) to authenticated;

-- ---------- Realtime ----------
-- Que dos SUPERADMIN vean lo mismo sin recargar: la página invalida al recibir cualquier cambio.
do $$
declare t text;
begin
  foreach t in array array['client_onboardings', 'client_onboarding_members', 'client_onboarding_tasks'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Los que ya estaban en la etapa antes de esta migración (hoy, ninguno): mismo camino que el
-- trigger. Sin sesión, el corte de `crm_leads_lead_type` no aplica.
update public.crm_leads l set lead_type = 'ONBOARDING'
from public.crm_funnel_stages s
where s.id = l.funnel_stage_id and s.starts_onboarding and s.deleted_at is null
  and l.lead_type = 'LEAD' and l.deleted_at is null;
