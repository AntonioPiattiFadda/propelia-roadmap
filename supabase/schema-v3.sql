-- supabase/schema-v3.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUES de schema.sql y schema-v2.sql. Idempotente: se puede correr mas de una vez.
--
-- QUE HACE, EN CRIOLLO:
--   Unifica los dos tableros (Propelia y Captalia) en UN SOLO sistema, y le agrega a las
--   tareas los campos que necesita el tablero nuevo (prioridad, tipo, "hoy", varios
--   responsables) mas las hojas de la vista Vision.
--
--   Nada se borra. Las tablas captalia_* quedan intactas en la base como respaldo;
--   simplemente dejan de usarse. Sus tareas se COPIAN a las tablas roadmap_* con el
--   prefijo "c-" en el id, asi no chocan con las que ya existian.
--
-- SIN ESTE ARCHIVO CORRIDO el tablero abre y muestra las tareas, pero no puede guardar
-- prioridad, tipo, "realizar hoy", varios responsables ni las hojas de Vision.
--
-- Pasos: 1) campos nuevos  2) tabla de notas  3) merge de Captalia  4) membresias.

-- ============================================================
-- 1) Campos nuevos en las tareas (se aplican a las dos tablas:
--    a roadmap_tareas porque es la definitiva, y a captalia_tareas
--    para que el merge del paso 3 pueda leerlos sin romperse).
-- ============================================================
do $$
declare tbl text;
begin
  foreach tbl in array array['roadmap_tareas','captalia_tareas']
  loop
    execute format('alter table public.%I add column if not exists prioridad text not null default %L', tbl, 'semanal');
    execute format('alter table public.%I add column if not exists tipo      text not null default %L', tbl, 'nuevo');
    execute format('alter table public.%I add column if not exists hoy       boolean not null default false', tbl);
    execute format('alter table public.%I add column if not exists pend      jsonb not null default %L::jsonb', tbl, '[]');
    execute format('alter table public.%I add column if not exists creada    timestamptz not null default now()', tbl);
    -- "Sin tematica" necesita poder dejar sec_id vacio. La foreign key se mantiene:
    -- un valor nulo no apunta a ninguna seccion y el borrado en cascada sigue igual.
    execute format('alter table public.%I alter column sec_id drop not null', tbl);
  end loop;
end $$;

-- Color por tematica (en el tablero nuevo, cada seccion es una "tematica").
alter table public.roadmap_secciones  add column if not exists color text not null default '';
alter table public.captalia_secciones add column if not exists color text not null default '';

-- La vista "Hoy" filtra por esta columna en cada pintado.
create index if not exists roadmap_tareas_hoy_idx on public.roadmap_tareas (hoy) where hoy;

-- ============================================================
-- 2) Hojas de la vista Vision (texto libre, una fila por hoja)
-- ============================================================
create table if not exists public.roadmap_notas (
  id text primary key,
  titulo text not null default '',
  texto text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists roadmap_notas_set_updated_at on public.roadmap_notas;
create trigger roadmap_notas_set_updated_at before update on public.roadmap_notas
  for each row execute function public.set_updated_at();

alter table public.roadmap_notas enable row level security;
drop policy if exists roadmap_notas_m on public.roadmap_notas;
create policy roadmap_notas_m on public.roadmap_notas
  for all using (public.es_miembro('propelia')) with check (public.es_miembro('propelia'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='roadmap_notas'
  ) then
    alter publication supabase_realtime add table public.roadmap_notas;
  end if;
end $$;

-- ============================================================
-- 3) MERGE: Captalia entra al tablero unico
-- ============================================================
-- Los adjuntos de Captalia viven en otro bucket (captalia-adjuntos) y los archivos ya
-- subidos NO se mueven. En vez de eso, a cada archivo copiado se le anota de que bucket
-- sale, en la clave "b". El tablero lee esa clave y, si no esta, usa el bucket principal.
create or replace function public._marcar_bucket(arr jsonb, bucket text)
returns jsonb language sql immutable as $$
  select coalesce((
    select jsonb_agg(case when e ? 'b' then e else e || jsonb_build_object('b', bucket) end)
    from jsonb_array_elements(case when jsonb_typeof(arr)='array' then arr else '[]'::jsonb end) e
  ), '[]'::jsonb)
$$;

-- Igual que la anterior, pero entrando a los archivos de cada subtarea.
create or replace function public._marcar_bucket_subs(subs jsonb, bucket text)
returns jsonb language sql immutable as $$
  select coalesce((
    select jsonb_agg(s || jsonb_build_object('files', public._marcar_bucket(s->'files', bucket)))
    from jsonb_array_elements(case when jsonb_typeof(subs)='array' then subs else '[]'::jsonb end) s
  ), '[]'::jsonb)
$$;

-- 3.a) Secciones de Captalia -> tematicas del tablero unico, despues de las existentes.
insert into public.roadmap_secciones (id, titulo, orden, color)
select 'c-' || s.id,
       s.titulo,
       s.orden + (select coalesce(max(orden), 0) + 1000 from public.roadmap_secciones),
       coalesce(s.color, '')
from public.captalia_secciones s
on conflict (id) do nothing;

-- 3.b) Tareas de Captalia. El sec_id apunta a la seccion ya copiada (mismo prefijo).
insert into public.roadmap_tareas
  (id, sec_id, modulo, tarea, expl, resp, estado, img, com, fecha,
   files, chat, subtareas, orden, prioridad, tipo, hoy, pend, creada)
select 'c-' || t.id,
       case when t.sec_id is null then null else 'c-' || t.sec_id end,
       t.modulo, t.tarea, t.expl, t.resp, t.estado, t.img, t.com, t.fecha,
       public._marcar_bucket(t.files, 'captalia-adjuntos'),
       case when jsonb_typeof(t.chat)='array' then t.chat else '[]'::jsonb end,
       public._marcar_bucket_subs(t.subtareas, 'captalia-adjuntos'),
       t.orden + (select coalesce(max(orden), 0) + 1000 from public.roadmap_tareas),
       t.prioridad, t.tipo, t.hoy, t.pend, t.creada
from public.captalia_tareas t
on conflict (id) do nothing;

-- 3.c) La CAJA de Captalia NO se mezcla a proposito: son movimientos de otra plata y
--      mezclarlos ensucia justo lo que se quiere tener limpio. Si igual la queres unir,
--      descomenta este bloque y volve a correr el archivo.
-- insert into public.roadmap_caja (id, fecha, concepto, categoria, monto, cuenta, notas, orden)
-- select 'c-' || id, fecha, concepto, categoria, monto, cuenta, notas,
--        orden + (select coalesce(max(orden), 0) + 1000 from public.roadmap_caja)
-- from public.captalia_caja
-- on conflict (id) do nothing;

-- 3.d) Backfill: el responsable unico que ya existia pasa a la lista de pendientes.
--      Solo toca filas con la lista vacia, asi correr esto de nuevo no pisa lo asignado
--      desde el tablero nuevo.
update public.roadmap_tareas
  set pend = jsonb_build_array(resp)
  where coalesce(resp, '') <> '' and pend = '[]'::jsonb;

-- ============================================================
-- 4) Membresias: un solo sistema, un solo proyecto ('propelia')
-- ============================================================
-- Al quedar un unico tablero, la membresia de 'captalia' no tiene sentido. Borrarla deja
-- las tablas captalia_* sin lectores (los datos siguen ahi, nadie los ve desde la app).
-- Diego era miembro SOLO de captalia, asi que esta linea tambien lo saca del sistema.
delete from public.app_miembros where proyecto = 'captalia';

-- Los adjuntos ya no se suben nunca mas al bucket de Captalia, pero hay que poder LEER
-- los que se copiaron en el paso 3.b. Por eso el bucket viejo pasa a ser de solo lectura
-- para los miembros del tablero.
drop policy if exists adjuntos_read   on storage.objects;
drop policy if exists adjuntos_write  on storage.objects;
drop policy if exists adjuntos_delete on storage.objects;

create policy adjuntos_read on storage.objects for select using (
  bucket_id in ('roadmap-adjuntos', 'captalia-adjuntos') and public.es_miembro('propelia')
);
create policy adjuntos_write on storage.objects for insert with check (
  bucket_id = 'roadmap-adjuntos' and public.es_miembro('propelia')
);
create policy adjuntos_delete on storage.objects for delete using (
  bucket_id in ('roadmap-adjuntos', 'captalia-adjuntos') and public.es_miembro('propelia')
);

-- ============================================================
-- 5) >>> ANTONIO: acá va lo único que queda por completar <<<
--
--     El tablero tiene tres personas: Lorenzo, Antonio y Luis.
--     Para que cada uno entre con su cuenta hacen falta DOS cosas por persona:
--
--       a) La cuenta creada en Authentication > Users con su email real.
--       b) La membresia de abajo (email en minuscula, igual al de Auth).
--
--     Y una tercera, del lado del tablero: poner ese mismo email en el bloque
--     `personas` de index.html, en el campo `email`. Eso es lo que hace que el
--     tablero sepa que la cuenta que entro es Lorenzo, Antonio o Luis.
-- ============================================================
-- insert into public.app_miembros (email, proyecto) values
--   ('lorenzopiattifadda@gmail.com',  'propelia'),
--   ('antonio.piattifadda@gmail.com', 'propelia'),
--   ('luis@ejemplo.com',              'propelia')
-- on conflict do nothing;

-- Comprobacion rapida: deberia devolver solo miembros de 'propelia'.
-- select * from public.app_miembros order by proyecto, email;
