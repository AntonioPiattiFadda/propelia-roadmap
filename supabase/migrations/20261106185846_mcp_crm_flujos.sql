-- Conector MCP: el CRM como lo muestran las páginas (6/11/2026, por pedido). Sobre
-- 20261031141933_mcp_demos_y_rendimiento; detalle en docs/mcp/README.md.
--
-- 1. LEADS DE PRUEBA. Las vistas no miraban `crm_leads.solo_para` (20261105173247): el conector de
--    un SUPERADMIN traía los leads de prueba de otro, con sus tareas, reuniones, actividad y alta.
--    Ahora todas cortan con la misma regla que la policy `crm_leads_solo_para` y `crm_puede_lead()`:
--    `solo_para is null or solo_para = auth.uid()`.
-- 2. FUNNEL. `mcp_crm_stages` suma `allows_tasks` y `show_in_dashboard`: con eso salen «Pendiente
--    agendar tarea» y los importantes del Dashboard.
-- 3. CAMPANA. `mcp_crm_emails` suma `seen_at` / `seen_by` («Listo» en un email que no llegó).
-- 4. NOTAS DE LA DEMO. Vista nueva `mcp_crm_demo_notas`: el cuadro de la pestaña «Demo» del lead
--    (`roadmap_notas`, fila `demo-guion-<lead>`). En la app esa fila la lee cualquier
--    `es_usuario()`; acá, sólo quien ve el lead (el cuadro se ve adentro del lead).
--
-- 5. ROADMAP. `mcp_roadmap_tareas` y `mcp_roadmap_grupos` pasan a sólo SUPERADMIN, como la página
--    (13/11/2026): la RLS de `roadmap_*` es `es_usuario()` y un SDR lo leía por el conector.
--
-- Sin columnas nuevas en las tablas. `create or replace view` deja agregar columnas al final,
-- no cambiar las que había: por eso cada vista repite las suyas en el mismo orden.

-- ─── roadmap: sólo SUPERADMIN, como la página (13/11/2026) ─────────────────
-- La RLS de `roadmap_*` deja leer a cualquier `es_usuario()`, pero /roadmap es sólo SUPERADMIN
-- (`NAV` en src/components/nav.ts). Hasta acá un SDR leía el roadmap entero por el conector.
create or replace view public.mcp_roadmap_tareas
with (security_barrier = true)
as
select
  t.id, t.tarea, t.estado, t.prioridad, t.pend, t.backlog, t.sprint, t.modulo, t.dep,
  t.creada, t.updated_at, t.expl, t.subtareas, t.chat,
  lower(concat_ws(' ', t.id, t.tarea, t.modulo, t.dep)) as busqueda
from public.roadmap_tareas t
where (select public.crm_es_superadmin());

create or replace view public.mcp_roadmap_grupos
with (security_barrier = true)
as
select substr(n.id, 7)::int as numero, nullif(trim(n.titulo), '') as nombre
from public.roadmap_notas n
where n.id ~ '^grupo-[0-9]+$'
  and (select public.crm_es_superadmin());

-- ─── funnel ─────────────────────────────────────────────────────────────────
create or replace view public.mcp_crm_stages
with (security_barrier = true)
as
select s.id, s.label, s.value, s.position, s.is_out_of_funnel, s.management_type, s.starts_onboarding,
       -- nuevas (6/11/2026)
       s.allows_tasks, s.show_in_dashboard
from public.crm_funnel_stages s
where s.deleted_at is null
  and (select public.es_usuario());

-- ─── CRM: las mismas vistas, con el corte de `solo_para` ───────────────────
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
  l.created_via, c.batch_activated_on, c.notes as client_notes, c.office_address
from public.crm_leads l
join public.crm_clients c on c.id = l.client_id
left join public.crm_funnel_stages s on s.id = l.funnel_stage_id
left join public.crm_channels ch on ch.id = l.channel_id
left join public.crm_software sw on sw.id = c.current_crm_id
where l.deleted_at is null
  and (l.solo_para is null or l.solo_para = (select auth.uid()))
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
  and (t.lead_id is null
       or (l.id is not null and (l.solo_para is null or l.solo_para = (select auth.uid()))))
  and ((select public.crm_es_superadmin())
       or (case when t.lead_id is not null then l.assigned_to else t.assigned_to end)
          in (select public.mcp_carteras_visibles()));

create or replace view public.mcp_crm_meetings
with (security_barrier = true)
as
select m.id, m.lead_id, m.assigned_to, m.starts_at, m.ends_at, m.status, m.title,
       m.cancel_reason, m.created_by, m.created_at,
       m.description, coalesce(cardinality(m.guest_emails), 0) as invitados, m.updated_at
from public.crm_meetings m
left join public.crm_leads l on l.id = m.lead_id
where m.deleted_at is null
  and (m.lead_id is null
       or (l.id is not null and (l.solo_para is null or l.solo_para = (select auth.uid()))))
  and ((select public.crm_es_superadmin())
       or (case when m.lead_id is not null then l.assigned_to else m.assigned_to end)
          in (select public.mcp_carteras_visibles()));

create or replace view public.mcp_crm_comments
with (security_barrier = true)
as
select k.id, k.lead_id, k.comment_type, k.description, k.long_description, k.created_by, k.created_at,
       coalesce(k.long_description like '<!--act-->%"tipo":"demo"%', false) as es_registro_de_demo
from public.crm_comments k
join public.crm_leads l on l.id = k.lead_id
where k.deleted_at is null
  and (l.solo_para is null or l.solo_para = (select auth.uid()))
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

create or replace view public.mcp_crm_stage_history
with (security_barrier = true)
as
select h.id, h.lead_id, h.from_stage_id, h.to_stage_id, h.changed_by, h.changed_at
from public.crm_stage_history h
join public.crm_leads l on l.id = h.lead_id
where (l.solo_para is null or l.solo_para = (select auth.uid()))
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

create or replace view public.mcp_crm_assignment_history
with (security_barrier = true)
as
select h.id, h.lead_id, h.from_user_id, h.to_user_id, h.changed_by, h.changed_at
from public.crm_assignment_history h
join public.crm_leads l on l.id = h.lead_id
where (l.solo_para is null or l.solo_para = (select auth.uid()))
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

-- Lo que mandaste vos, o lo de un lead que ves (como su RLS). Suma «Listo» (`seen_at`, `seen_by`).
create or replace view public.mcp_crm_emails
with (security_barrier = true)
as
select e.id, e.lead_id, e.sent_by, e.subject, e.plantilla, e.status, e.status_at, e.sent_at,
       -- nuevas (6/11/2026)
       e.seen_at, e.seen_by
from public.crm_emails e
left join public.crm_leads l on l.id = e.lead_id
where (select public.es_usuario())
  and (e.sent_by = (select auth.uid())
       or (e.lead_id is not null and l.id is not null
           and (l.solo_para is null or l.solo_para = (select auth.uid()))
           and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()))));

-- El alta de un lead de prueba tampoco se ve (en /clientes la corta el join `!inner` con el lead).
create or replace view public.mcp_onboardings
with (security_barrier = true)
as
select o.id, o.lead_id, o.company_name, o.website, o.assigned_to, o.created_at,
       o.submitted_at, o.completed_at,
       coalesce((select array_agg(t.task_id order by t.task_id)
                 from public.client_onboarding_tasks t where t.onboarding_id = o.id), '{}') as tareas_hechas
from public.client_onboardings o
where (select public.crm_es_superadmin())
  and exists (select 1 from public.crm_leads l
              where l.id = o.lead_id and (l.solo_para is null or l.solo_para = (select auth.uid())));

-- ─── nueva: las notas de la pestaña «Demo» del lead ────────────────────────
-- Se compara como texto (`l.id::text`) y no con un cast a uuid: una fila `demo-guion-…` mal
-- escrita haría fallar la consulta entera.
create or replace view public.mcp_crm_demo_notas
with (security_barrier = true)
as
select l.id as lead_id, n.texto, n.updated_at
from public.roadmap_notas n
join public.crm_leads l on l.id::text = substr(n.id, 12)
where n.id like 'demo-guion-%'
  and nullif(trim(n.texto), '') is not null
  and l.deleted_at is null
  and (l.solo_para is null or l.solo_para = (select auth.uid()))
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

revoke all on public.mcp_crm_demo_notas from public, anon, authenticated;
grant select on public.mcp_crm_demo_notas to authenticated;

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
    'mcp_onboardings', 'mcp_expenses', 'mcp_crm_assignment_history', 'mcp_crm_emails',
    'mcp_crm_demo_notas'
  ]::text[];
$$;
