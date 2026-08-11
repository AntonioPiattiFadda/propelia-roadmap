-- supabase/schema-v6.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUES de schema-v5.sql. Idempotente: se puede correr mas de una vez.
--
-- QUE HACE, EN CRIOLLO:
--   Vision deja de ser un enlace a Notion y vuelve a ser una hoja del tablero: una
--   lista de tildes anidada, donde cada linea puede tener lineas adentro con el mismo
--   tilde. Esta tabla es esa hoja.
--
-- SIN ESTE ARCHIVO CORRIDO la pestaña Vision se abre, pero avisa en pantalla que no
-- puede guardar y no pierde nada de lo que escribas en otro lado.

-- ============================================================
-- 1) La hoja: una fila por linea, anidada contra si misma
-- ------------------------------------------------------------
-- `padre` nulo = linea de primer nivel. El borrado es en cascada: al borrar una linea
-- se van con ella todas las de adentro, que es lo que uno espera al tachar un bloque
-- entero.
--
-- `orden` es un decimal, igual que en tareas y caja: mover una linea entre otras dos es
-- escribir el promedio de las dos, sin renumerar la hoja entera.
--
-- El plegado NO esta aca a proposito: que una persona cierre un bloque para leer comodo
-- no tiene por que cerrarselo a las otras. Eso vive en el navegador de cada uno.
-- ============================================================
-- La clave foranea va DEFERRABLE INITIALLY DEFERRED a proposito: al pegar una pagina
-- entera se manda todo en un solo upsert, y asi no importa si la fila de adentro llega
-- antes que la que la contiene. La comprobacion corre al cerrar la transaccion, cuando
-- ya estan las dos.
create table if not exists public.roadmap_vision (
  id text primary key,
  padre text references public.roadmap_vision(id) on delete cascade
    deferrable initially deferred,
  texto text not null default '',
  hecho boolean not null default false,
  -- Como se dibuja el renglon: 'titulo' | 'subtitulo' | 'check' | 'texto'.
  -- El default es 'check' y no 'texto' a proposito: la hoja arranco siendo solo tareas,
  -- asi que cualquier fila sin tipo es una tarea.
  tipo text not null default 'check',
  orden double precision not null default 1,
  updated_at timestamptz not null default now()
);

-- Por si la tabla se creo con una version anterior de este archivo, cuando no habia tipos.
alter table public.roadmap_vision add column if not exists tipo text not null default 'check';

create index if not exists roadmap_vision_padre_idx on public.roadmap_vision (padre, orden);

drop trigger if exists roadmap_vision_set_updated_at on public.roadmap_vision;
create trigger roadmap_vision_set_updated_at before update on public.roadmap_vision
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2) Permisos: los mismos que el resto del tablero
-- ============================================================
alter table public.roadmap_vision enable row level security;
drop policy if exists roadmap_vision_m on public.roadmap_vision;
create policy roadmap_vision_m on public.roadmap_vision
  for all using (public.es_miembro('propelia')) with check (public.es_miembro('propelia'));

-- ============================================================
-- 3) Realtime: la hoja se edita entre varios y se ve al toque
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='roadmap_vision'
  ) then
    alter publication supabase_realtime add table public.roadmap_vision;
  end if;
end $$;

-- ============================================================
-- 4) Opcional: limpiar la tabla que nunca se uso
-- ------------------------------------------------------------
-- `roadmap_notas` la creo schema-v3.sql para las dos hojas de texto libre de la Vision
-- vieja. Nunca se escribio una fila: para cuando el esquema se corrio, Vision ya era un
-- documento de Notion. La hoja nueva no la usa.
--
-- Esta comentado a proposito. Descomentalo solo despues de mirar en la base que
-- efectivamente esta vacia (`select count(*) from public.roadmap_notas;`).
-- ============================================================
-- drop table if exists public.roadmap_notas;
