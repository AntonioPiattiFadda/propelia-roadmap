-- Las tools del conector MCP (Claude / ChatGPT): una vista `mcp_*` por cosa que se entrega y la
-- lista blanca que deja al token del conector leerlas. Todas de SÓLO LECTURA. Sobre la infra de
-- 20261030115614_mcp_oauth_infra; detalle en docs/mcp/README.md.
--
-- Las vistas corren como su dueño (sin `security_invoker`): la RLS restrictiva le cierra las
-- tablas al conector, así que el permiso de cada fila lo pone la vista misma, con las MISMAS
-- funciones que la RLS de la tabla (`es_usuario()`, `crm_puede*()`, `crm_es_superadmin()`).
-- `security_barrier` impide que un filtro del usuario se evalúe antes que ese corte. Una sesión
-- normal también las puede leer y ve lo mismo que en la app.
--
-- Qué NO sale, a propósito: teléfonos y emails (de contactos, de la inmobiliaria y de las
-- invitaciones), tokens de calendario y de alta pública, el equipo que carga el cliente en su
-- alta, y la caja y los onboardings para quien no es SUPERADMIN (como en el front).

-- ─── equipo ─────────────────────────────────────────────────────────────────
create or replace view public.mcp_team
with (security_barrier = true)
as
select u.id, u.nombre, u.last_name, u.rol::text as rol, u.activo
from public.users u
where (select public.es_usuario());

-- ─── roadmap ────────────────────────────────────────────────────────────────
-- `expl` va crudo (texto, HTML con `<!--h-->` o bloques con `<!--b-->`): lo pasa a texto la tool.
create or replace view public.mcp_roadmap_tareas
with (security_barrier = true)
as
select
  t.id, t.tarea, t.estado, t.prioridad, t.pend, t.backlog, t.sprint, t.modulo, t.dep,
  t.creada, t.updated_at, t.expl, t.subtareas, t.chat,
  lower(concat_ws(' ', t.id, t.tarea, t.modulo, t.dep)) as busqueda
from public.roadmap_tareas t
where (select public.es_usuario());

-- Los nombres de los grupos del backlog (`roadmap_notas`, id `grupo-N`; ver CLAUDE.md).
create or replace view public.mcp_roadmap_grupos
with (security_barrier = true)
as
select substr(n.id, 7)::int as numero, nullif(trim(n.titulo), '') as nombre
from public.roadmap_notas n
where n.id ~ '^grupo-[0-9]+$'
  and (select public.es_usuario());

-- ─── CRM ────────────────────────────────────────────────────────────────────
create or replace view public.mcp_crm_stages
with (security_barrier = true)
as
select s.id, s.label, s.value, s.position, s.is_out_of_funnel, s.management_type, s.starts_onboarding
from public.crm_funnel_stages s
where s.deleted_at is null
  and (select public.es_usuario());

-- El lead con su inmobiliaria. Los contactos van sin teléfono ni email: nombre, rol y si decide.
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
  (
    select coalesce(jsonb_agg(x.contacto) filter (where x.contacto is not null), '[]'::jsonb)
    from (values
      (case when coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.contact_role) is not null
            then jsonb_build_object('nombre', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
                                    'rol', c.contact_role, 'decisor', c.contact_is_decision_maker) end),
      (case when coalesce(nullif(trim(c.alternative_phone_1_note), ''), c.alternative_phone_1_role) is not null
            then jsonb_build_object('nombre', nullif(trim(c.alternative_phone_1_note), ''),
                                    'rol', c.alternative_phone_1_role, 'decisor', c.alternative_phone_1_is_decision_maker) end),
      (case when coalesce(nullif(trim(c.alternative_phone_2_note), ''), c.alternative_phone_2_role) is not null
            then jsonb_build_object('nombre', nullif(trim(c.alternative_phone_2_note), ''),
                                    'rol', c.alternative_phone_2_role, 'decisor', c.alternative_phone_2_is_decision_maker) end)
    ) as x(contacto)
  ) as contactos,
  lower(concat_ws(' ', c.company_name, c.city, c.neighborhood, c.website, c.import_batch)) as busqueda
from public.crm_leads l
join public.crm_clients c on c.id = l.client_id
left join public.crm_funnel_stages s on s.id = l.funnel_stage_id
left join public.crm_channels ch on ch.id = l.channel_id
left join public.crm_software sw on sw.id = c.current_crm_id
where l.deleted_at is null
  and public.crm_puede(l.assigned_to, 'read');

create or replace view public.mcp_crm_tasks
with (security_barrier = true)
as
select t.id, t.lead_id, t.title, t.due_date, t.due_time, t.completed, t.completed_at,
       t.assigned_to, t.created_at
from public.crm_tasks t
where t.deleted_at is null
  and case when t.lead_id is not null then public.crm_puede_lead(t.lead_id, 'read')
           else public.crm_puede(t.assigned_to, 'read') end;

-- Sin `guest_emails` ni lo de la sincronización con Google.
create or replace view public.mcp_crm_meetings
with (security_barrier = true)
as
select m.id, m.lead_id, m.assigned_to, m.starts_at, m.ends_at, m.status, m.title,
       m.cancel_reason, m.created_by, m.created_at
from public.crm_meetings m
where m.deleted_at is null
  and case when m.lead_id is not null then public.crm_puede_lead(m.lead_id, 'read')
           else public.crm_puede(m.assigned_to, 'read') end;

-- La actividad del lead. `long_description` trae la meta (`<!--act-->{json}`): la tool lee de
-- ahí el tipo y con quién, y nunca el teléfono.
create or replace view public.mcp_crm_comments
with (security_barrier = true)
as
select k.id, k.lead_id, k.comment_type, k.description, k.long_description, k.created_by, k.created_at
from public.crm_comments k
where k.deleted_at is null
  and public.crm_puede_lead(k.lead_id, 'read');

create or replace view public.mcp_crm_stage_history
with (security_barrier = true)
as
select h.id, h.lead_id, h.from_stage_id, h.to_stage_id, h.changed_by, h.changed_at
from public.crm_stage_history h
where public.crm_puede_lead(h.lead_id, 'read');

-- ─── clientes (onboarding) y caja: sólo SUPERADMIN, como en el front ───────
-- Sin `public_token` (es la llave del alta pública) ni el equipo que cargó el cliente.
create or replace view public.mcp_onboardings
with (security_barrier = true)
as
select o.id, o.lead_id, o.company_name, o.website, o.assigned_to, o.created_at,
       o.submitted_at, o.completed_at,
       coalesce((select array_agg(t.task_id order by t.task_id)
                 from public.client_onboarding_tasks t where t.onboarding_id = o.id), '{}') as tareas_hechas
from public.client_onboardings o
where (select public.crm_es_superadmin());

create or replace view public.mcp_expenses
with (security_barrier = true)
as
select e.id, e.expense_name, e.expense_type, e.amount, e.date, e.period, e.recurrence,
       e.status, e.notes, e.paid_by, e.created_at
from public.expenses e
where e.deleted_at is null
  and (select public.crm_es_superadmin());

-- ─── permisos de las vistas ────────────────────────────────────────────────
do $$
declare
  v text;
begin
  foreach v in array array[
    'mcp_team', 'mcp_roadmap_tareas', 'mcp_roadmap_grupos', 'mcp_crm_stages', 'mcp_crm_leads',
    'mcp_crm_tasks', 'mcp_crm_meetings', 'mcp_crm_comments', 'mcp_crm_stage_history',
    'mcp_onboardings', 'mcp_expenses'
  ] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ─── lista blanca (completa: reemplaza a la de 20261030115614) ─────────────
-- Misma lista que MCP_RELATIONS en supabase/functions/_shared/mcp/relations.ts.
create or replace function public.mcp_oauth_relations()
returns text[]
language sql
immutable
as $$
  select array[
    'mcp_team', 'mcp_roadmap_tareas', 'mcp_roadmap_grupos', 'mcp_crm_stages', 'mcp_crm_leads',
    'mcp_crm_tasks', 'mcp_crm_meetings', 'mcp_crm_comments', 'mcp_crm_stage_history',
    'mcp_onboardings', 'mcp_expenses'
  ]::text[];
$$;
