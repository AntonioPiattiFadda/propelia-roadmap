-- Motivos de descarte con fecha para volver a llamar (10/10/2026).
--
-- `crm_leads.recontact_at`: el día desde el que hay que volver a llamar a un lead descartado
-- que «no califica, pero podría calificar». Lo escribe el front al descartar (hoy + 6 meses) y
-- lo borra al volver a una etapa del funnel. `discard_reason` pasa a guardar el código del
-- motivo (`MOTIVOS_DE_DESCARTE` del front); los descartes viejos quedan con su texto libre.
--
-- Las etapas del funnel del SDR NO se tocan acá: producción ya tenía las suyas armadas a mano
-- (Contactado Decisor, Segumiento, Demo agendada…) y el insert por nombre exacto las habría
-- duplicado con otro nombre. Se acomodan desde la configuración del funnel. El seed de
-- `supabase/schema.sql` sí trae las etapas nuevas, que es lo que vale para un proyecto vacío.

alter table public.crm_leads add column if not exists recontact_at date;
