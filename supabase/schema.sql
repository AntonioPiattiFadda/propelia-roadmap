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
