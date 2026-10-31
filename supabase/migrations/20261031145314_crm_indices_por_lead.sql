-- Índices por lead en las tablas de historia del CRM. Medido el 31/10/2026 con EXPLAIN ANALYZE
-- sobre las vistas del MCP (get_demo_briefing): leer la actividad o los cambios de etapa de UN lead
-- recorría la tabla entera (1.692 comentarios, 927 cambios de etapa) porque no había índice por
-- `lead_id`. Hoy son milisegundos, pero crece con cada llamada registrada, y lo paga también la app
-- cada vez que abre un lead. Las demás (`crm_tasks`, `crm_meetings`, `crm_emails`) ya lo tenían.
--
-- Con el orden en que se leen (lo más nuevo primero), así el `order by … desc limit N` sale del
-- índice sin ordenar. Las tablas son chicas: crearlos tarda milisegundos y no hace falta
-- `concurrently`.

create index if not exists crm_comments_lead_idx
  on public.crm_comments (lead_id, created_at desc) where deleted_at is null;

create index if not exists crm_stage_history_lead_idx
  on public.crm_stage_history (lead_id, changed_at desc);

create index if not exists crm_assignment_history_lead_idx
  on public.crm_assignment_history (lead_id, changed_at desc);
