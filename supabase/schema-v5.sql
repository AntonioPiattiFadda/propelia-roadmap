-- supabase/schema-v5.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUES de schema-v4.sql. Idempotente: se puede correr mas de una vez.
--
-- QUE HACE, EN CRIOLLO:
--   Saca las tematicas. Dejaron de usarse: el tablero ya no las muestra en la tarjeta,
--   no las filtra, no las deja elegir en la tarea ni administrar. La tabla y la columna
--   que las ataba quedaron de adorno.
--
-- POR QUE CONVIENE CORRERLO Y NO DEJAR LA BASE COMO ESTA:
--   `roadmap_tareas.sec_id` apunta a `roadmap_secciones` con ON DELETE CASCADE. Mientras
--   eso siga en pie, borrar una fila de secciones desde el panel de Supabase se lleva
--   puestas TODAS las tareas de esa tematica. El tablero ya no puede hacerlo, pero la
--   trampa sigue armada en la base. Esto la desarma.
--
-- SIN ESTE ARCHIVO CORRIDO el tablero funciona igual: no lee ni escribe `sec_id`.
--
-- OJO: no tiene vuelta atras, se pierde que tarea estaba en que tematica. Si preferís
-- conservar esa clasificacion como registro, no corras el archivo entero: corré solo el
-- bloque "ALTERNATIVA" del final, que quita la cascada y deja los datos donde estan.
--
-- Y ojo tambien: despues de esto NO vuelvas a correr schema.sql / v2 / v3. Dan por hecho
-- que `roadmap_secciones` y `sec_id` existen.

-- Al soltar la columna se va con ella la foreign key y su indice: no hay cascada que
-- pueda dispararse mientras se borra la tabla del paso siguiente.
alter table public.roadmap_tareas drop column if exists sec_id;

drop table if exists public.roadmap_secciones;

-- ---------------------------------------------------------------------------
-- ALTERNATIVA (excluyente con lo de arriba): conservar la clasificacion vieja.
-- Deja la tabla y la columna intactas, y solo desactiva el borrado en cascada.
--
--   alter table public.roadmap_tareas
--     drop constraint if exists roadmap_tareas_sec_id_fkey;
-- ---------------------------------------------------------------------------
