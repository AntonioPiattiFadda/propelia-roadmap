-- supabase/schema-v7.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUES de schema-v5.sql. Idempotente: se puede correr mas de una vez.
--
-- QUE HACE, EN CRIOLLO:
--   El Backlog. Son tareas de verdad, la misma fila de siempre, con dos campos nuevos:
--   una marca que las deja fuera del tablero hasta que alguien las manda, y el sprint al
--   que pertenecen. Pasar una tarea del backlog al tablero es apagar esa marca, nada mas:
--   llega con su explicacion, su checklist, sus archivos y su conversacion intactos.
--
-- POR QUE NO HAY UN schema-v6.sql: existio y creaba `roadmap_vision`, la hoja de texto
-- libre de la pestaña Vision. Esa pestaña paso a ser el Backlog antes de que el archivo
-- se corriera en ningun lado, asi que se borro en vez de dejarlo invitando a crear una
-- tabla que ya no usa nadie. Si llegaste a correrlo, mira el paso 3 de abajo.
--
-- SIN ESTE ARCHIVO CORRIDO la pestaña Backlog se abre y se ve, pero cada tarea que
-- agregues ahi va a aparecer tambien en el tablero: la marca no se guarda. El aviso del
-- triangulito del encabezado lo dice.

-- ============================================================
-- 1) Los dos campos nuevos de la tarea
-- ------------------------------------------------------------
-- `backlog` es lo unico que separa el backlog del tablero. Es una marca y no una tabla
-- aparte a proposito: con dos tablas, mandar una tarea al tablero seria copiar filas y
-- mover adjuntos cada vez; con una marca es un booleano.
--
-- `sprint` es un numero chico (1, 2, 3...) o nulo. Nulo es "sin clasificar", que es como
-- entra una tarea escrita a las apuradas: clasificar despues tiene que ser posible, si no
-- nadie anota nada. No es una clave foranea contra una tabla de sprints porque un sprint
-- no tiene mas datos que su numero.
--
-- El campo se guarda tambien en las tareas que ya estan en el tablero: sirve para mirar,
-- al cerrar un sprint, que salio de cada uno.
-- ============================================================
alter table public.roadmap_tareas add column if not exists backlog boolean not null default false;
alter table public.roadmap_tareas add column if not exists sprint smallint;
-- De que depende la tarea, escrito a mano ("T04", "diseño cerrado"). Texto libre y no una
-- relacion entre tareas a proposito: la mitad de las dependencias reales no son otra tarea
-- del tablero, y obligarlas a serlo hace que nadie las anote.
alter table public.roadmap_tareas add column if not exists dep text;
-- El enlace al Loom de la tarea. Es texto y no un booleano a proposito: saber que "hay
-- video" sin poder abrirlo obliga a ir a buscarlo a mano, que es justo lo que se queria
-- evitar. El tilde de la lista se prende solo cuando esta columna tiene algo.
alter table public.roadmap_tareas add column if not exists loom text;

-- El tablero pide siempre las que NO estan en el backlog, y el backlog las que si.
create index if not exists roadmap_tareas_backlog_idx on public.roadmap_tareas (backlog, sprint, orden);

-- ============================================================
-- 2) Permisos y realtime: nada que hacer
-- ------------------------------------------------------------
-- Son columnas de `roadmap_tareas`, que ya tiene su RLS y ya esta publicada en realtime
-- desde schema-v3.sql. Agregar columnas no toca ninguna de las dos cosas.
-- ============================================================

-- ============================================================
-- 3) Opcional: limpiar la hoja de Vision, si llegaste a crearla
-- ------------------------------------------------------------
-- Solo aplica si corriste el viejo schema-v6.sql. El front ya no lee ni escribe esa
-- tabla, asi que lo que tenga adentro se pierde: mirala antes
-- (`select count(*) from public.roadmap_vision;`) y recien despues descomenta.
-- ============================================================
-- drop table if exists public.roadmap_vision;
