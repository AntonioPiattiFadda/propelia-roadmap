-- supabase/schema-v2.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUÉS de schema.sql. Idempotente: se puede correr más de una vez sin error.
--
-- Qué hace:
--   1. Agrega columnas `chat` y `subtareas` (jsonb) a roadmap_tareas.
--   2. Crea la caja de Propelia (roadmap_caja).
--   3. Crea las tablas de Captalia (captalia_secciones / captalia_tareas / captalia_caja) + bucket.
--   4. Crea app_miembros y RLS que AÍSLA: cada quien solo ve los proyectos donde es miembro.
--
-- >>> Antonio: al final de este archivo hay un bloque para cargar los miembros con los emails reales. <<<

-- ============================================================
-- 1) Columnas nuevas en tareas de Propelia
-- ============================================================
alter table public.roadmap_tareas add column if not exists chat      jsonb not null default '[]'::jsonb;
alter table public.roadmap_tareas add column if not exists subtareas jsonb not null default '[]'::jsonb;

-- ============================================================
-- 2) Función genérica updated_at (reutilizable por todas las tablas)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 3) Caja de Propelia
-- ============================================================
create table if not exists public.roadmap_caja (
  id text primary key,
  fecha date,
  concepto text not null default '',
  categoria text not null default '',
  monto numeric not null default 0,
  cuenta text not null default '',
  notas text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists roadmap_caja_set_updated_at on public.roadmap_caja;
create trigger roadmap_caja_set_updated_at before update on public.roadmap_caja
  for each row execute function public.set_updated_at();

-- ============================================================
-- 4) Tablas de Captalia (espejo de Propelia)
-- ============================================================
create table if not exists public.captalia_secciones (
  id text primary key,
  titulo text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.captalia_tareas (
  id text primary key,
  sec_id text not null references public.captalia_secciones(id) on delete cascade,
  modulo text not null default '',
  tarea text not null default '',
  expl text not null default '',
  resp text not null default '',
  estado text not null default 'Pendiente',
  img text not null default '',
  com text not null default '',
  fecha date,
  files jsonb not null default '[]'::jsonb,
  chat jsonb not null default '[]'::jsonb,
  subtareas jsonb not null default '[]'::jsonb,
  orden double precision not null,
  updated_at timestamptz not null default now()
);
create index if not exists captalia_tareas_sec_id_idx on public.captalia_tareas (sec_id);

create table if not exists public.captalia_caja (
  id text primary key,
  fecha date,
  concepto text not null default '',
  categoria text not null default '',
  monto numeric not null default 0,
  cuenta text not null default '',
  notas text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists captalia_secciones_set_updated_at on public.captalia_secciones;
create trigger captalia_secciones_set_updated_at before update on public.captalia_secciones
  for each row execute function public.set_updated_at();
drop trigger if exists captalia_tareas_set_updated_at on public.captalia_tareas;
create trigger captalia_tareas_set_updated_at before update on public.captalia_tareas
  for each row execute function public.set_updated_at();
drop trigger if exists captalia_caja_set_updated_at on public.captalia_caja;
create trigger captalia_caja_set_updated_at before update on public.captalia_caja
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5) Realtime para las tablas nuevas
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['roadmap_caja','captalia_secciones','captalia_tareas','captalia_caja']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- 6) Membresías + aislamiento por proyecto (RLS)
-- ============================================================
create table if not exists public.app_miembros (
  email text not null,
  proyecto text not null,        -- 'propelia' | 'captalia'
  primary key (email, proyecto)
);
alter table public.app_miembros enable row level security;
-- Cada usuario puede leer sus propias membresías (por si el front quisiera consultarlas).
drop policy if exists app_miembros_self on public.app_miembros;
create policy app_miembros_self on public.app_miembros
  for select using (lower(email) = lower(auth.jwt()->>'email'));

-- Helper: ¿el usuario logueado es miembro de <proyecto>?
create or replace function public.es_miembro(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_miembros m
    where m.proyecto = p
      and lower(m.email) = lower(auth.jwt()->>'email')
  );
$$;

-- --- Propelia: requiere ser miembro de 'propelia' ---
alter table public.roadmap_secciones enable row level security;
alter table public.roadmap_tareas    enable row level security;
alter table public.roadmap_caja      enable row level security;
drop policy if exists roadmap_secciones_all  on public.roadmap_secciones;
drop policy if exists roadmap_secciones_auth on public.roadmap_secciones;
drop policy if exists roadmap_secciones_m    on public.roadmap_secciones;
create policy roadmap_secciones_m on public.roadmap_secciones
  for all using (public.es_miembro('propelia')) with check (public.es_miembro('propelia'));
drop policy if exists roadmap_tareas_all  on public.roadmap_tareas;
drop policy if exists roadmap_tareas_auth on public.roadmap_tareas;
drop policy if exists roadmap_tareas_m    on public.roadmap_tareas;
create policy roadmap_tareas_m on public.roadmap_tareas
  for all using (public.es_miembro('propelia')) with check (public.es_miembro('propelia'));
drop policy if exists roadmap_caja_m on public.roadmap_caja;
create policy roadmap_caja_m on public.roadmap_caja
  for all using (public.es_miembro('propelia')) with check (public.es_miembro('propelia'));

-- --- Captalia: requiere ser miembro de 'captalia' ---
alter table public.captalia_secciones enable row level security;
alter table public.captalia_tareas    enable row level security;
alter table public.captalia_caja      enable row level security;
drop policy if exists captalia_secciones_m on public.captalia_secciones;
create policy captalia_secciones_m on public.captalia_secciones
  for all using (public.es_miembro('captalia')) with check (public.es_miembro('captalia'));
drop policy if exists captalia_tareas_m on public.captalia_tareas;
create policy captalia_tareas_m on public.captalia_tareas
  for all using (public.es_miembro('captalia')) with check (public.es_miembro('captalia'));
drop policy if exists captalia_caja_m on public.captalia_caja;
create policy captalia_caja_m on public.captalia_caja
  for all using (public.es_miembro('captalia')) with check (public.es_miembro('captalia'));

-- ============================================================
-- 7) Storage: bucket de Captalia + policies por membresía
-- ============================================================
insert into storage.buckets (id, name, public)
values ('captalia-adjuntos', 'captalia-adjuntos', true)
on conflict (id) do nothing;

-- Reemplaza las policies abiertas de adjuntos de Propelia por policies de membresía.
drop policy if exists roadmap_adjuntos_read   on storage.objects;
drop policy if exists roadmap_adjuntos_write  on storage.objects;
drop policy if exists roadmap_adjuntos_delete on storage.objects;

drop policy if exists adjuntos_read   on storage.objects;
drop policy if exists adjuntos_write  on storage.objects;
drop policy if exists adjuntos_delete on storage.objects;

create policy adjuntos_read on storage.objects for select using (
  (bucket_id='roadmap-adjuntos'  and public.es_miembro('propelia')) or
  (bucket_id='captalia-adjuntos' and public.es_miembro('captalia'))
);
create policy adjuntos_write on storage.objects for insert with check (
  (bucket_id='roadmap-adjuntos'  and public.es_miembro('propelia')) or
  (bucket_id='captalia-adjuntos' and public.es_miembro('captalia'))
);
create policy adjuntos_delete on storage.objects for delete using (
  (bucket_id='roadmap-adjuntos'  and public.es_miembro('propelia')) or
  (bucket_id='captalia-adjuntos' and public.es_miembro('captalia'))
);

-- ============================================================
-- 8) >>> ANTONIO: cargar los miembros con los emails reales <<<
--     Loro y vos: acceso a AMBOS proyectos. Diego: solo Captalia.
--     Los emails deben coincidir EXACTO con los de Supabase Auth (usá minúscula).
-- ============================================================
-- insert into public.app_miembros (email, proyecto) values
--   ('lorenzopiattifadda@gmail.com', 'propelia'),
--   ('lorenzopiattifadda@gmail.com', 'captalia'),
--   ('antonio@ejemplo.com',          'propelia'),
--   ('antonio@ejemplo.com',          'captalia'),
--   ('diego@ejemplo.com',            'captalia')
-- on conflict do nothing;
