-- Si cada contacto de la inmobiliaria decide (el principal y los dos alternativos). Lo marca el
-- perfil del lead, al lado del rol, y se completa solo cuando en una llamada se contesta que el
-- contacto es decisor: así la próxima llamada con esa persona no lo vuelve a preguntar.
-- null es «no se sabe». Solo agrega columnas que aceptan null: no toca ninguna fila existente y
-- la RLS de crm_clients ya las cubre. Es el mismo bloque que está en supabase/schema.sql.
alter table public.crm_clients add column if not exists contact_is_decision_maker             boolean;
alter table public.crm_clients add column if not exists alternative_phone_1_is_decision_maker boolean;
alter table public.crm_clients add column if not exists alternative_phone_2_is_decision_maker boolean;
