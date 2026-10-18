-- La hora de una tarea del CRM, opcional (17/10/2026): «Llamar a Marc el lunes a las 10:30». Es la
-- hora de reloj local de quien la agendó, sin zona, igual que `due_date` es un día sin zona: el
-- equipo trabaja en un solo huso. Null = sin hora, la tarea de todo el día de siempre. Solo
-- significa algo junto con `due_date`. Con hora, el front avisa 5 minutos antes mientras el CRM
-- esté abierto en alguna pestaña. Solo agrega una columna que acepta null: no toca ninguna fila
-- existente y la RLS de crm_tasks ya la cubre. Es el mismo bloque que está en supabase/schema.sql.
alter table public.crm_tasks add column if not exists due_time time;
