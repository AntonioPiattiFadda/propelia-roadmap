-- The email template is edited on purpose, not by sending (21/11/2026, by request). Until today
-- `send-email` saved the text of every send as the template; now editing the fields before sending
-- only affects that email, and «Editar plantilla» in the CRM writes the template directly.
-- Any active user can edit it (the team shares one row per template), and the author is themselves.
drop policy if exists crm_email_plantillas_insertar on public.crm_email_plantillas;
create policy crm_email_plantillas_insertar on public.crm_email_plantillas for insert
  with check (public.es_usuario() and updated_by = auth.uid());

drop policy if exists crm_email_plantillas_editar on public.crm_email_plantillas;
create policy crm_email_plantillas_editar on public.crm_email_plantillas for update
  using (public.es_usuario())
  with check (public.es_usuario() and updated_by = auth.uid());
