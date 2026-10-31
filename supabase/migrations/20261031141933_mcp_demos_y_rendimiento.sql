-- Conector MCP: las vistas del CRM sin `crm_puede()` fila por fila, y lo que hace falta para
-- preparar una demo (más contexto del lead, la reunión con sus notas, los emails enviados y las
-- reasignaciones). Sobre 20261031135450_mcp_tools; detalle en docs/mcp/README.md.
--
-- RENDIMIENTO. Las vistas llamaban a `crm_puede(owner, 'read')` / `crm_puede_lead(lead, 'read')`
-- por cada fila: tres consultas a `users` y `crm_data_access` por fila, y `security_barrier` no
-- deja empujar un filtro como `ilike` antes de ese corte. Medido el 31/10/2026: la lista de leads
-- de un SUPERADMIN tardaba 139 ms en 431 filas, y crece con la tabla. Ahora la regla es la MISMA
-- pero se evalúa una vez por consulta:
--   · `(select crm_es_superadmin())` — initplan, una vez;
--   · `owner in (select mcp_carteras_visibles())` — subplan con hash, una vez: vos y las carteras
--     que te da `crm_data_access` (read o write), si sos usuario activo.
-- Es lo que dice `crm_puede(owner, 'read')`. Si esa función cambia, cambia acá.

create or replace function public.mcp_carteras_visibles()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() where public.es_usuario()
  union
  select a.subject_id
  from public.crm_data_access a
  where a.viewer_id = auth.uid() and a.access in ('read', 'write') and public.es_usuario();
$$;

-- La llaman sólo las vistas, que corren como su dueño: nadie más la necesita.
revoke all on function public.mcp_carteras_visibles() from public, anon, authenticated;

-- ─── CRM: las mismas vistas, con el corte nuevo y columnas al final ────────
-- (`create or replace view` deja agregar columnas al final, no cambiar las que había.)

create or replace view public.mcp_crm_leads
with (security_barrier = true)
as
select
  l.id, l.assigned_to, l.funnel_stage_id, s.label as stage_label,
  coalesce(s.value = 'DISCARDED', false) as descartado, ch.label as channel_label,
  l.lead_type::text as lead_type, l.importante, l.discard_reason, l.recontact_at,
  l.created_at, l.updated_at, l.last_important_event_at,
  c.company_name, c.city, c.neighborhood, c.website, c.idealista_url, c.google_maps_url,
  c.agents_count, coalesce(sw.label, c.current_crm) as current_crm,
  c.idealista_years, c.idealista_listings, c.sdr_advice, c.import_batch, c.selection_reason,
  -- Contactos sin teléfono ni email: nombre, rol, si decide y lo que se anotó de cada uno.
  (
    select coalesce(jsonb_agg(x.contacto) filter (where x.contacto is not null), '[]'::jsonb)
    from (values
      (case when coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.contact_role) is not null
            then jsonb_build_object('nombre', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                                    'rol', c.contact_role, 'decisor', c.contact_is_decision_maker,
                                    'notas', nullif(trim(c.contact_notes), '')) end),
      (case when coalesce(nullif(trim(c.alternative_phone_1_note), ''), c.alternative_phone_1_role) is not null
            then jsonb_build_object('nombre', nullif(trim(c.alternative_phone_1_note), ''),
                                    'rol', c.alternative_phone_1_role, 'decisor', c.alternative_phone_1_is_decision_maker,
                                    'notas', nullif(trim(c.alternative_phone_1_notes), '')) end),
      (case when coalesce(nullif(trim(c.alternative_phone_2_note), ''), c.alternative_phone_2_role) is not null
            then jsonb_build_object('nombre', nullif(trim(c.alternative_phone_2_note), ''),
                                    'rol', c.alternative_phone_2_role, 'decisor', c.alternative_phone_2_is_decision_maker,
                                    'notas', nullif(trim(c.alternative_phone_2_notes), '')) end)
    ) as x(contacto)
  ) as contactos,
  lower(concat_ws(' ', c.company_name, c.city, c.neighborhood, c.website, c.import_batch)) as busqueda,
  -- nuevas (31/10/2026)
  l.created_via, c.batch_activated_on, c.notes as client_notes, c.office_address
from public.crm_leads l
join public.crm_clients c on c.id = l.client_id
left join public.crm_funnel_stages s on s.id = l.funnel_stage_id
left join public.crm_channels ch on ch.id = l.channel_id
left join public.crm_software sw on sw.id = c.current_crm_id
where l.deleted_at is null
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

-- Tarea o reunión con lead: manda la cartera del lead; sin lead, la de su responsable (como su RLS).
create or replace view public.mcp_crm_tasks
with (security_barrier = true)
as
select t.id, t.lead_id, t.title, t.due_date, t.due_time, t.completed, t.completed_at,
       t.assigned_to, t.created_at
from public.crm_tasks t
left join public.crm_leads l on l.id = t.lead_id
where t.deleted_at is null
  and (t.lead_id is null or l.id is not null)
  and ((select public.crm_es_superadmin())
       or (case when t.lead_id is not null then l.assigned_to else t.assigned_to end)
          in (select public.mcp_carteras_visibles()));

-- `description` es la de las demos viejas (invitación, quién asiste y notas, hasta el 22/10/2026):
-- la tool le saca el renglón del email. De los invitados va sólo cuántos.
create or replace view public.mcp_crm_meetings
with (security_barrier = true)
as
select m.id, m.lead_id, m.assigned_to, m.starts_at, m.ends_at, m.status, m.title,
       m.cancel_reason, m.created_by, m.created_at,
       -- nuevas (31/10/2026)
       m.description, coalesce(cardinality(m.guest_emails), 0) as invitados, m.updated_at
from public.crm_meetings m
left join public.crm_leads l on l.id = m.lead_id
where m.deleted_at is null
  and (m.lead_id is null or l.id is not null)
  and ((select public.crm_es_superadmin())
       or (case when m.lead_id is not null then l.assigned_to else m.assigned_to end)
          in (select public.mcp_carteras_visibles()));

create or replace view public.mcp_crm_comments
with (security_barrier = true)
as
select k.id, k.lead_id, k.comment_type, k.description, k.long_description, k.created_by, k.created_at,
       -- nueva (31/10/2026): el registro que deja una demo al agendarse (meta `tipo: 'demo'`).
       coalesce(k.long_description like '<!--act-->%"tipo":"demo"%', false) as es_registro_de_demo
from public.crm_comments k
join public.crm_leads l on l.id = k.lead_id
where k.deleted_at is null
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

create or replace view public.mcp_crm_stage_history
with (security_barrier = true)
as
select h.id, h.lead_id, h.from_stage_id, h.to_stage_id, h.changed_by, h.changed_at
from public.crm_stage_history h
join public.crm_leads l on l.id = h.lead_id
where (select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles());

-- ─── nuevas: reasignaciones y emails enviados ──────────────────────────────
create or replace view public.mcp_crm_assignment_history
with (security_barrier = true)
as
select h.id, h.lead_id, h.from_user_id, h.to_user_id, h.changed_by, h.changed_at
from public.crm_assignment_history h
join public.crm_leads l on l.id = h.lead_id
where (select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles());

-- Qué se le mandó al lead y si llegó. Sin `to_email` ni el id de Resend. Misma regla que su RLS:
-- lo que mandaste vos, o lo de un lead que ves.
create or replace view public.mcp_crm_emails
with (security_barrier = true)
as
select e.id, e.lead_id, e.sent_by, e.subject, e.plantilla, e.status, e.status_at, e.sent_at
from public.crm_emails e
left join public.crm_leads l on l.id = e.lead_id
where (select public.es_usuario())
  and (e.sent_by = (select auth.uid())
       or (e.lead_id is not null and l.id is not null
           and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()))));

do $$
declare
  v text;
begin
  foreach v in array array['mcp_crm_assignment_history', 'mcp_crm_emails'] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ─── lista blanca (completa) ───────────────────────────────────────────────
-- Misma lista que MCP_RELATIONS en supabase/functions/_shared/mcp/relations.ts.
create or replace function public.mcp_oauth_relations()
returns text[]
language sql
immutable
as $$
  select array[
    'mcp_team', 'mcp_roadmap_tareas', 'mcp_roadmap_grupos', 'mcp_crm_stages', 'mcp_crm_leads',
    'mcp_crm_tasks', 'mcp_crm_meetings', 'mcp_crm_comments', 'mcp_crm_stage_history',
    'mcp_onboardings', 'mcp_expenses', 'mcp_crm_assignment_history', 'mcp_crm_emails'
  ]::text[];
$$;
