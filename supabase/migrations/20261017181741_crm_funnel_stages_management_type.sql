-- Cómo se gestiona cada etapa del funnel (17/10/2026): `sin_contactar` (el lead todavía no se
-- contactó y se trabaja hasta lograrlo) o `por_tarea` (se gestiona con las tareas agendadas). Lo
-- elige un SUPERADMIN en la configuración del funnel. Null = sin clasificar. Los valores son los de
-- `GESTIONES_DE_ETAPA` del front (`src/pages/crm/lib/gestionDeEtapa.ts`): si se agrega uno, va en
-- los dos lados. Solo agrega una columna que acepta null: no toca ninguna fila existente y la RLS
-- de crm_funnel_stages ya la cubre. Es el mismo bloque que está en supabase/schema.sql.
alter table public.crm_funnel_stages add column if not exists management_type text
  check (management_type is null or management_type in ('sin_contactar', 'por_tarea'));
