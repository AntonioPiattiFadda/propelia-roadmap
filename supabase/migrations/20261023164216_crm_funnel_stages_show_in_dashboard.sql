-- «¿Se ve en el Dashboard?» por etapa del funnel (23/10/2026, por pedido). Con
-- `show_in_dashboard = true`, el Dashboard del CRM (el resumen de /crm de un SUPERADMIN) lista los
-- leads que están en esa etapa. Lo elige un SUPERADMIN en la configuración del funnel: la RLS de
-- crm_funnel_stages ya cubre la columna. Default false: ninguna etapa aparece hasta que se elige.
-- Es solo de pantalla, sin trigger. Es el mismo bloque que está en supabase/schema.sql.

alter table public.crm_funnel_stages add column if not exists show_in_dashboard boolean not null default false;
