-- supabase/schema.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm).
-- Idempotente: se puede correr más de una vez sin error.

create table if not exists public.roadmap_secciones (
  id text primary key,
  titulo text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.roadmap_tareas (
  id text primary key,
  sec_id text not null references public.roadmap_secciones(id) on delete cascade,
  modulo text not null default '',
  tarea text not null default '',
  expl text not null default '',
  resp text not null default '',
  estado text not null default 'Pendiente',
  img text not null default '',
  com text not null default '',
  fecha date,
  files jsonb not null default '[]'::jsonb,
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create index if not exists roadmap_tareas_sec_id_idx on public.roadmap_tareas (sec_id);

create or replace function public.roadmap_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists roadmap_secciones_set_updated_at on public.roadmap_secciones;
create trigger roadmap_secciones_set_updated_at
  before update on public.roadmap_secciones
  for each row execute function public.roadmap_set_updated_at();

drop trigger if exists roadmap_tareas_set_updated_at on public.roadmap_tareas;
create trigger roadmap_tareas_set_updated_at
  before update on public.roadmap_tareas
  for each row execute function public.roadmap_set_updated_at();

alter table public.roadmap_secciones enable row level security;
alter table public.roadmap_tareas enable row level security;

drop policy if exists roadmap_secciones_all on public.roadmap_secciones;
create policy roadmap_secciones_all on public.roadmap_secciones
  for all using (true) with check (true);

drop policy if exists roadmap_tareas_all on public.roadmap_tareas;
create policy roadmap_tareas_all on public.roadmap_tareas
  for all using (true) with check (true);

alter publication supabase_realtime add table public.roadmap_secciones;
alter publication supabase_realtime add table public.roadmap_tareas;

insert into storage.buckets (id, name, public)
values ('roadmap-adjuntos', 'roadmap-adjuntos', true)
on conflict (id) do nothing;

drop policy if exists roadmap_adjuntos_read on storage.objects;
create policy roadmap_adjuntos_read on storage.objects
  for select using (bucket_id = 'roadmap-adjuntos');

drop policy if exists roadmap_adjuntos_write on storage.objects;
create policy roadmap_adjuntos_write on storage.objects
  for insert with check (bucket_id = 'roadmap-adjuntos');

drop policy if exists roadmap_adjuntos_delete on storage.objects;
create policy roadmap_adjuntos_delete on storage.objects
  for delete using (bucket_id = 'roadmap-adjuntos');
