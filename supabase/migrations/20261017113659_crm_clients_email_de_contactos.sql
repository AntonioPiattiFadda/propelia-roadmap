-- El email de cada contacto alternativo de la inmobiliaria (el principal ya tiene `email`). Se carga
-- desde el perfil del lead, en la ficha de cada persona. Solo agrega columnas que aceptan null: no
-- toca ninguna fila existente y la RLS de crm_clients ya las cubre. Es el mismo bloque que está en
-- supabase/schema.sql.
alter table public.crm_clients add column if not exists alternative_phone_1_email text;
alter table public.crm_clients add column if not exists alternative_phone_2_email text;
