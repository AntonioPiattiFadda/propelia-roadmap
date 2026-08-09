-- supabase/schema-v4.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUES de schema-v3.sql. Idempotente: se puede correr mas de una vez.
--
-- QUE HACE, EN CRIOLLO:
--   Le agrega a la caja dos campos para los gastos fijos (los que se repiten todos los
--   meses: alquiler, servicios, suscripciones). Es lo unico que toca.
--
--     repite -> ''         movimiento normal, de una sola vez
--               'mensual'  gasto fijo: el tablero lo vuelve a cargar solo cada mes
--     origen -> vacio      lo cargo una persona a mano
--               <id>       es la copia de ese mes del gasto fijo con ese id
--
--   El tablero mira `origen` para saber que meses ya genero y no cargar dos veces lo
--   mismo. Cada copia es un movimiento comun: se edita el importe, se cambia la fecha
--   o se borra, sin tocar la plantilla.
--
-- SIN ESTE ARCHIVO CORRIDO la caja se ve y se usa, pero al guardar cualquier movimiento
-- falla, porque el tablero manda estas dos columnas. El propio tablero avisa arriba,
-- en el triangulito del encabezado, que falta correrlo.

alter table public.roadmap_caja add column if not exists repite text not null default '';
alter table public.roadmap_caja add column if not exists origen text not null default '';

-- Buscar "todas las copias de este gasto fijo" es lo unico que se consulta por origen.
create index if not exists roadmap_caja_origen_idx on public.roadmap_caja (origen)
  where origen <> '';

-- Nada mas: la tabla ya tiene su RLS y su realtime desde schema-v2.sql, y las columnas
-- nuevas quedan cubiertas por las mismas policies (son por fila, no por columna).
