-- ============================================================
-- REFERENCIA, NO SE CORRE. Esquema del CRM del producto (propelia-frontend), extraído del
-- catálogo del proyecto propelia (gvkdyxhxsnpumxlhvhsm) el 29/9/2026.
--
-- Es la fuente para escribir las tablas crm_* de supabase/schema.sql: qué columnas, qué
-- triggers y qué lógica de «gestión» tiene el producto. Las crm_* NO son copia textual —
-- sin organization_id, sin propiedades/briefing/matching— y las diferencias están en la
-- spec docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md.
--
-- Las policies van como comentario: todas son por organization_id y no aplican.
-- ============================================================

-- ===== ENUMS =====

create type public.creation_source_enum as enum ('manual', 'email', 'valuation', 'web');
create type public.lead_management_action as enum ('MANUAL', 'POSTPONED');
create type public.lead_type_enum as enum ('BUYER', 'SELLER', 'RENTER');

-- ===== buyer_lead_client_stage_history =====
create table public.buyer_lead_client_stage_history (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by uuid,
  organization_id uuid not null,
  changed_at timestamp with time zone not null default now(),
  constraint lead_client_stage_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id),
  constraint lead_client_stage_history_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES client_funnel_stages(id),
  constraint lead_client_stage_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  constraint lead_client_stage_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint lead_client_stage_history_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES client_funnel_stages(id),
  constraint lead_client_stage_history_pkey PRIMARY KEY (id)
);


-- policy lead_client_stage_history_select (SELECT, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()
-- policy lead_client_stage_history_insert (INSERT, {public}) using () with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))

-- ===== client_funnel_stages =====
create table public.client_funnel_stages (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  "position" integer not null default 0,
  priority_id uuid,
  is_out_of_funnel boolean not null default false,
  requires_matching boolean not null default false,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  label text not null default ''::text,
  value text not null default ''::text,
  allow_delete boolean not null default false,
  allow_reorder boolean not null default false,
  allow_rename boolean not null default true,
  management_tolerance_hours integer,
  constraint client_funnel_stages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint client_funnel_stages_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES priorities(id),
  constraint client_funnel_stages_pkey PRIMARY KEY (id)
);


-- policy client_funnel_stages_update (UPDATE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy client_funnel_stages_delete (DELETE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()
-- policy client_funnel_stages_insert (INSERT, {public}) using () with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy client_funnel_stages_select (SELECT, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()

-- ===== clients =====
create table public.clients (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  organization_id uuid,
  deleted_at timestamp with time zone,
  alternative_phone_1 text,
  alternative_phone_1_note text,
  alternative_phone_2 text,
  alternative_phone_2_note text,
  notes text,
  constraint clients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  constraint clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  constraint clients_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX clients_org_email_active_uidx ON public.clients USING btree (organization_id, lower(email)) WHERE ((deleted_at IS NULL) AND (email IS NOT NULL) AND (email <> ''::text));
CREATE UNIQUE INDEX clients_org_phone_active_uidx ON public.clients USING btree (organization_id, phone) WHERE ((deleted_at IS NULL) AND (phone IS NOT NULL) AND (phone <> ''::text));
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- policy clients_select (SELECT, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()
-- policy clients_update (UPDATE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy clients_delete (DELETE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()
-- policy clients_insert (INSERT, {public}) using () with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))

-- ===== lead_assignment_history =====
create table public.lead_assignment_history (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  organization_id uuid not null,
  from_user_id uuid,
  to_user_id uuid not null,
  changed_by uuid not null,
  changed_at timestamp with time zone not null default now(),
  constraint lead_assignment_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id),
  constraint lead_assignment_history_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id),
  constraint lead_assignment_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  constraint lead_assignment_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint lead_assignment_history_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES users(id),
  constraint lead_assignment_history_pkey PRIMARY KEY (id)
);


-- policy lead_assignment_history_select (SELECT, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()

-- ===== lead_channels =====
create table public.lead_channels (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  label text not null,
  "position" integer not null default 0,
  allow_delete boolean not null default true,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint lead_channels_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint lead_channels_pkey PRIMARY KEY (id),
  constraint lead_channels_id_org_key UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX lead_channels_id_org_key ON public.lead_channels USING btree (id, organization_id);

-- policy lead_channels_update (UPDATE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy lead_channels_delete (DELETE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()
-- policy lead_channels_insert (INSERT, {public}) using () with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy lead_channels_select (SELECT, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()

-- ===== lead_comments =====
create table public.lead_comments (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  organization_id uuid not null,
  description text not null,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  deleted_at timestamp with time zone,
  long_description text,
  comment_type text not null default 'MANUAL'::text,
  constraint lead_comments_comment_type_check CHECK ((comment_type = ANY (ARRAY['SYSTEM'::text, 'MANUAL'::text]))),
  constraint lead_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id),
  constraint lead_comments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  constraint lead_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint lead_comments_pkey PRIMARY KEY (id)
);


-- policy org members can manage lead_comments (ALL, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))

-- ===== lead_management_events =====
create table public.lead_management_events (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  organization_id uuid not null,
  action lead_management_action not null,
  effective_at timestamp with time zone not null default now(),
  note text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  constraint lead_management_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id),
  constraint lead_management_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  constraint lead_management_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  constraint lead_management_events_pkey PRIMARY KEY (id)
);
CREATE INDEX lead_management_events_lead_effective_idx ON public.lead_management_events USING btree (lead_id, effective_at DESC);
CREATE INDEX lead_management_events_org_idx ON public.lead_management_events USING btree (organization_id);
CREATE TRIGGER lead_gestion_reference_sync AFTER INSERT OR DELETE OR UPDATE ON public.lead_management_events FOR EACH ROW EXECUTE FUNCTION lead_gestion_reference_from_event();
-- policy org members can manage lead_management_events (ALL, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))

-- ===== leads =====
create table public.leads (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  property_funnel_stage_id uuid,
  briefing_id uuid,
  assigned_to uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  client_funnel_stage_id uuid,
  deleted_at timestamp with time zone,
  matching_computed_at timestamp with time zone,
  discard_reason text,
  channel_id uuid,
  created_via creation_source_enum not null default 'manual'::creation_source_enum,
  last_important_event_at timestamp with time zone not null default now(),
  lead_type lead_type_enum not null,
  sell_client_funnel_stage_id uuid,
  gestion_reference_at timestamp with time zone,
  gestion_postponed boolean not null default false,
  gestion_has_events boolean not null default false,
  gestion_reopened_by_system boolean not null default false,
  last_opened_at timestamp with time zone,
  rent_client_funnel_stage_id uuid,
  matching_started_at timestamp with time zone,
  constraint leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id),
  constraint leads_briefing_id_fkey FOREIGN KEY (briefing_id) REFERENCES briefings(id) ON DELETE SET NULL,
  constraint leads_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES lead_channels(id) ON DELETE SET NULL,
  constraint leads_client_funnel_stage_id_fkey FOREIGN KEY (client_funnel_stage_id) REFERENCES client_funnel_stages(id) ON DELETE SET NULL,
  constraint leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  constraint leads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint leads_property_funnel_stage_id_fkey FOREIGN KEY (property_funnel_stage_id) REFERENCES property_funnel_stages(id),
  constraint leads_rent_client_funnel_stage_id_fkey FOREIGN KEY (rent_client_funnel_stage_id) REFERENCES rent_client_funnel_stages(id) ON DELETE SET NULL,
  constraint leads_sell_client_funnel_stage_id_fkey FOREIGN KEY (sell_client_funnel_stage_id) REFERENCES sell_client_funnel_stages(id) ON DELETE SET NULL,
  constraint leads_pkey PRIMARY KEY (id),
  constraint leads_id_org_key UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX leads_client_type_assignee_active_uidx ON public.leads USING btree (client_id, lead_type, assigned_to) WHERE (deleted_at IS NULL);
CREATE INDEX leads_gestion_reference_at_idx ON public.leads USING btree (gestion_reference_at DESC NULLS LAST) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX leads_id_org_key ON public.leads USING btree (id, organization_id);
CREATE TRIGGER lead_gestion_reference_sync AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION lead_gestion_reference_from_lead();
CREATE TRIGGER on_lead_sell_client_stage_change AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION log_lead_sell_client_stage_change();
CREATE TRIGGER trg_log_lead_assignment AFTER UPDATE OF assigned_to ON public.leads FOR EACH ROW WHEN ((old.assigned_to IS DISTINCT FROM new.assigned_to)) EXECUTE FUNCTION log_lead_assignment_change();
CREATE TRIGGER trg_log_lead_client_stage_change AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION log_lead_client_stage_change();
-- policy org members can manage leads (ALL, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))

-- ===== priorities =====
create table public.priorities (
  id uuid not null default gen_random_uuid(),
  name text not null,
  color text not null,
  "position" integer not null default 0,
  organization_id uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  management_tolerance_hours integer default 24,
  show_in_filters boolean not null default true,
  constraint priorities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint priorities_pkey PRIMARY KEY (id)
);


-- policy priorities_delete (DELETE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()
-- policy priorities_insert (INSERT, {public}) using () with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy priorities_update (UPDATE, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))
-- policy priorities_select (SELECT, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ()

-- ===== tasks =====
create table public.tasks (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  entity_type text,
  entity_id uuid,
  title text not null,
  due_date date,
  assigned_to uuid not null default auth.uid(),
  completed boolean not null default false,
  completed_at timestamp with time zone,
  created_by uuid not null default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  is_ai_generated boolean not null default false,
  planned_for date,
  recurrence text,
  action_type text,
  action_id text,
  constraint tasks_action_pair_check CHECK (((action_type IS NULL) = (action_id IS NULL))),
  constraint tasks_action_type_check CHECK (((action_type IS NULL) OR (action_type = 'sync_idealista_property'::text))),
  constraint tasks_entity_pair_check CHECK (((entity_type IS NULL) = (entity_id IS NULL))),
  constraint tasks_entity_type_check CHECK (((entity_type IS NULL) OR (entity_type = ANY (ARRAY['property'::text, 'lead_comprador'::text])))),
  constraint tasks_recurrence_check CHECK (((recurrence IS NULL) OR (recurrence = ANY (ARRAY['daily'::text, 'weekdays'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text])))),
  constraint tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id),
  constraint tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id),
  constraint tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint tasks_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_tasks_assigned_pending ON public.tasks USING btree (assigned_to, completed, due_date);
CREATE INDEX idx_tasks_entity ON public.tasks USING btree (entity_type, entity_id);
CREATE INDEX tasks_action_idx ON public.tasks USING btree (organization_id, action_type, action_id) WHERE ((completed = false) AND (deleted_at IS NULL));
CREATE INDEX tasks_planned_for_idx ON public.tasks USING btree (assigned_to, planned_for) WHERE ((completed = false) AND (deleted_at IS NULL));

-- policy users_manage_own_tasks (ALL, {public}) using (((organization_id = ( SELECT current_organization_id() AS current_organization_id)) AND ((assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'superadmin'::text])))))))) with check (((organization_id = ( SELECT current_organization_id() AS current_organization_id)) AND ((assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))))

-- ===== visits =====
create table public.visits (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid,
  property_id uuid,
  assigned_to uuid not null,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  status text not null default 'scheduled'::text,
  description text,
  sync_status text not null default 'pending'::text,
  external_event_id text,
  external_provider text,
  sync_error text,
  email_status text not null default 'pending'::text,
  email_error text,
  ics_sequence integer not null default 0,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  sync_attempts integer not null default 0,
  title text,
  color_id text,
  reminder_minutes integer,
  cancel_reason text,
  guest_user_ids uuid[] not null default '{}'::uuid[],
  guest_emails text[] not null default '{}'::text[],
  constraint visits_email_status_check CHECK ((email_status = ANY (ARRAY['pending'::text, 'sent'::text, 'error'::text, 'skipped'::text]))),
  constraint visits_external_provider_check CHECK ((external_provider = 'google'::text)),
  constraint visits_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text]))),
  constraint visits_sync_status_check CHECK ((sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'error'::text, 'disabled'::text]))),
  constraint visits_time_valid CHECK ((ends_at > starts_at)),
  constraint visits_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id),
  constraint visits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id),
  constraint visits_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id),
  constraint visits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id),
  constraint visits_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id),
  constraint visits_pkey PRIMARY KEY (id)
);
CREATE INDEX visits_email_pending_idx ON public.visits USING btree (email_status) WHERE ((email_status = 'pending'::text) AND (deleted_at IS NULL));
CREATE INDEX visits_lead_idx ON public.visits USING btree (lead_id) WHERE (deleted_at IS NULL);
CREATE INDEX visits_org_starts_idx ON public.visits USING btree (organization_id, starts_at);
CREATE INDEX visits_property_idx ON public.visits USING btree (property_id) WHERE (deleted_at IS NULL);
CREATE INDEX visits_sync_pending_idx ON public.visits USING btree (sync_status) WHERE ((sync_status = ANY (ARRAY['pending'::text, 'error'::text])) AND (deleted_at IS NULL));

-- policy org members can manage visits (ALL, {public}) using ((organization_id = ( SELECT current_organization_id() AS current_organization_id))) with check ((organization_id = ( SELECT current_organization_id() AS current_organization_id)))

-- ===== FUNCIONES (triggers, gestión, siembra, RPCs) =====

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id
  from public.users
  where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.seed_org_funnel_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_verde_id         uuid;
  v_amarillo_id      uuid;
  v_rojo_id          uuid;
  v_opor_id          uuid;
BEGIN
  INSERT INTO priorities (organization_id, name, color, position, management_tolerance_hours)
  VALUES
    (NEW.id, 'Verde',       '#639922', 1,  24),
    (NEW.id, 'Amarillo',    '#EF9F27', 2, 168),
    (NEW.id, 'Rojo',        '#E24B4A', 3, 336),
    (NEW.id, 'Oportunidad', '#B84300', 4,  24);

  SELECT id INTO v_verde_id    FROM priorities WHERE organization_id = NEW.id AND name = 'Verde';
  SELECT id INTO v_amarillo_id FROM priorities WHERE organization_id = NEW.id AND name = 'Amarillo';
  SELECT id INTO v_rojo_id     FROM priorities WHERE organization_id = NEW.id AND name = 'Rojo';
  SELECT id INTO v_opor_id     FROM priorities WHERE organization_id = NEW.id AND name = 'Oportunidad';

  INSERT INTO lead_channels (organization_id, label, position, allow_delete)
  VALUES
    (NEW.id, 'Idealista',  1, true),
    (NEW.id, 'Fotocasa',   2, true),
    (NEW.id, 'Meta',       3, true),
    (NEW.id, 'Valoración', 4, true),
    (NEW.id, 'Otros',      5, false);

  -- Sin "Compartido": el estado compartido vive en lead_properties.shared_at.
  INSERT INTO property_funnel_stages
    (organization_id, label, value, priority_id, management_tolerance_hours, requires_matching, is_out_of_funnel, allow_delete, allow_reorder, allow_rename, position)
  VALUES
    (NEW.id, 'Lead nuevo',              'NEW_LEAD',  v_verde_id,     24, true,  false, false, true,  false, 1),
    (NEW.id, 'Por agendar',             '',          v_verde_id,     24, true,  false, true,  true,  true,  2),
    (NEW.id, 'Agendado',                'SCHEDULED', v_verde_id,     24, true,  false, false, true,  false, 3),
    (NEW.id, 'Visitado',                'VISITED',   v_verde_id,     24, true,  false, false, true,  false, 4),
    (NEW.id, '2da visita',              '',          v_verde_id,     24, true,  false, true,  true,  true,  5),
    (NEW.id, 'Interesado',              '',          v_amarillo_id, 168, true,  false, true,  true,  true,  6),
    (NEW.id, 'Oferta',                  '',          v_rojo_id,     336, true,  false, true,  true,  true,  7),
    (NEW.id, 'Arras',                   '',          v_rojo_id,     336, true,  false, true,  true,  true,  8),
    (NEW.id, 'Escriturado- Post venta', '',          v_rojo_id,     336, true,  false, true,  true,  true,  9),
    (NEW.id, 'Descarta piso',           '',          v_rojo_id,     336, false, true,  false, false, false, 10);

  -- Sin "Nuevo": todo lead sin pisos en gestión vive en PENDING_MATCHING.
  INSERT INTO client_funnel_stages
    (organization_id, value, label, position, is_out_of_funnel, allow_delete, allow_reorder, allow_rename, priority_id, management_tolerance_hours)
  VALUES
    (NEW.id, 'PENDING_MATCHING', 'Pendiente de matching', 1, false, false, false, false, v_verde_id, 24),
    (NEW.id, 'MATCHING',         'En matching',           2, false, false, false, false, NULL,      NULL),
    (NEW.id, 'DISCARDED',        'Descartado',            3, true,  false, false, false, NULL,      NULL);

  INSERT INTO sell_client_funnel_stages
    (organization_id, value, label, position, is_out_of_funnel, allow_delete, allow_reorder, allow_rename, priority_id, management_tolerance_hours)
  VALUES
    (NEW.id, 'NEW',       'Lead nuevo',  1, false, false, false, false, v_verde_id, 24),
    (NEW.id, 'FOLLOW_UP', 'Seguimiento', 2, false, false, false, false, v_verde_id, 24),
    (NEW.id, 'VALUED',    'Valorado',    3, false, false, false, false, NULL,     NULL),
    (NEW.id, 'CAPTURED',  'Captado',     4, false, false, false, false, NULL,     NULL),
    (NEW.id, 'DISCARDED', 'Descartado',  5, true,  false, false, false, NULL,     NULL);

  INSERT INTO properties (organization_id, title, description, price)
  VALUES (
    NEW.id,
    'Piso de ejemplo',
    'Propiedad de muestra para explorar Propelia IA. Podés editarla o eliminarla.',
    250000
  );

  INSERT INTO clients (organization_id, first_name, last_name, email, phone)
  VALUES (NEW.id, 'Cliente', 'de Ejemplo', 'ejemplo@propelia.io', '+34 600 000 000');

  INSERT INTO message_templates (organization_id, type, content) VALUES
    (NEW.id, 'presentation', $tpl$🏠 {{direccion}} · {{barrio}}
💶 {{precio}} · {{habitaciones}} · {{metros}} · {{planta}}
{{descripcion}}$tpl$),
    (NEW.id, 'welcome', $tpl$Hola {{nombre_cliente}},

Gracias por contactar con nosotros.

Soy {{agente}}, de {{inmobiliaria}}. Nos consta que te interesaste por una vivienda que tenemos {{operacion}} en {{direccion}}, {{ciudad}}, con un precio de {{precio}}.

¿Te gustaría concertar una visita para verla en persona?

Te comparto el enlace del anuncio con toda la información y fotografías de la propiedad:
{{link_portal}}

Quedo a tu disposición para resolver cualquier duda o coordinar una visita.$tpl$);

  -- El INSERT en organization_levels sale acá: la tabla deja de existir en esta
  -- misma migración. La visibilidad ahora se configura en `user_data_access`,
  -- que arranca vacía a propósito — un usuario nuevo no ve datos de nadie más.

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_lead_client_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    if NEW.client_funnel_stage_id is not null then
      insert into public.buyer_lead_client_stage_history (lead_id, from_stage_id, to_stage_id, changed_by, organization_id)
      values (NEW.id, null, NEW.client_funnel_stage_id, auth.uid(), NEW.organization_id);
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if OLD.client_funnel_stage_id is distinct from NEW.client_funnel_stage_id and NEW.client_funnel_stage_id is not null then
      insert into public.buyer_lead_client_stage_history (lead_id, from_stage_id, to_stage_id, changed_by, organization_id)
      values (NEW.id, OLD.client_funnel_stage_id, NEW.client_funnel_stage_id, auth.uid(), NEW.organization_id);
    end if;
    return NEW;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_lead_assignment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO lead_assignment_history (lead_id, organization_id, from_user_id, to_user_id, changed_by)
  VALUES (NEW.id, NEW.organization_id, OLD.assigned_to, NEW.assigned_to, auth.uid());
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_leads(p_lead_ids uuid[], p_new_assigned_to uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_new_org_id uuid;
  v_current_user_id uuid := auth.uid();
  v_current_name text;
  v_new_name text;
  v_count integer;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT organization_id INTO v_org_id FROM users WHERE id = v_current_user_id;
  SELECT organization_id INTO v_new_org_id FROM users WHERE id = p_new_assigned_to;

  IF v_new_org_id IS NULL OR v_new_org_id <> v_org_id THEN
    RAISE EXCEPTION 'El usuario destino no pertenece a la organización';
  END IF;

  SELECT trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_current_name FROM users WHERE id = v_current_user_id;
  SELECT trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_new_name FROM users WHERE id = p_new_assigned_to;

  WITH updated AS (
    UPDATE leads
    SET assigned_to = p_new_assigned_to,
        last_important_event_at = now()
    WHERE id = ANY(p_lead_ids)
      AND assigned_to = v_current_user_id
      AND organization_id = v_org_id
    RETURNING id
  )
  INSERT INTO lead_comments (id, lead_id, organization_id, description, created_by)
  SELECT gen_random_uuid(), updated.id, v_org_id,
         '(Sistema) Lead reasignado de ' || v_current_name || ' a ' || v_new_name, NULL
  FROM updated;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_lead_sell_client_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    if NEW.sell_client_funnel_stage_id is not null then
      insert into public.seller_lead_client_stage_history (lead_id, from_stage_id, to_stage_id, changed_by, organization_id)
      values (NEW.id, null, NEW.sell_client_funnel_stage_id, auth.uid(), NEW.organization_id);
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if OLD.sell_client_funnel_stage_id is distinct from NEW.sell_client_funnel_stage_id and NEW.sell_client_funnel_stage_id is not null then
      insert into public.seller_lead_client_stage_history (lead_id, from_stage_id, to_stage_id, changed_by, organization_id)
      values (NEW.id, OLD.sell_client_funnel_stage_id, NEW.sell_client_funnel_stage_id, auth.uid(), NEW.organization_id);
    end if;
    return NEW;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lead_gestion_reference(p_lead_id uuid)
 RETURNS TABLE(reference_at timestamp with time zone, postponed boolean, has_events boolean, reopened_by_system boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ev as (
    -- Mismo recorte que hace la lista: los eventos borrados no cuentan.
    select e.effective_at, e.created_at, e.action
    from public.lead_management_events e
    where e.lead_id = p_lead_id
      and e.deleted_at is null
  ),
  winner as (
    -- El evento que gana es el de mayor effective_at, igual que el sort de TS.
    -- El desempate por created_at/effective_at NO existe en TS (Array.sort es estable
    -- y deja ganar al primero que devolvió PostgREST, que no tiene orden garantizado):
    -- acá se agrega para que la columna sea determinística. Con dos eventos de idéntico
    -- effective_at las dos implementaciones pueden discrepar, y es aceptado — el test
    -- de equivalencia no siembra empates exactos porque en TS tampoco están definidos.
    select e.effective_at, e.action
    from ev e
    order by e.effective_at desc, e.created_at desc
    limit 1
  ),
  last_system_change as (
    -- El máximo cambio de etapa hecho por EL SISTEMA sobre cualquiera de las
    -- propiedades vivas del lead. `lp.deleted_at is null` espeja el filtro de la lista.
    select max(h.changed_at) as changed_at
    from public.lead_property_stage_history h
    join public.lead_properties lp on lp.id = h.lead_property_id
    where lp.lead_id = p_lead_id
      and lp.deleted_at is null
      and h.change_type = 'SYSTEM'
  ),
  last_action as (
    -- El MÁXIMO created_at de TODOS los eventos, no el del que ganó por effective_at.
    -- Es la trampa que el comentario de gestionStatus.ts marca: con una postergación
    -- a futuro activa, esa siempre gana la ordenación aunque el agente gestione después,
    -- así que mirar sólo `winner.created_at` dejaría el lead trabado en Pendiente.
    select max(e.created_at) as created_at from ev e
  )
  select
    case
      when w.effective_at is null then l.created_at
      when s.changed_at is not null and s.changed_at > a.created_at then s.changed_at
      else w.effective_at
    end as reference_at,
    case
      when w.effective_at is null then false
      when s.changed_at is not null and s.changed_at > a.created_at then false
      else w.action = 'POSTPONED'::public.lead_management_action
    end as postponed,
    w.effective_at is not null as has_events,
    w.effective_at is not null
      and s.changed_at is not null
      and s.changed_at > a.created_at as reopened_by_system
  from public.leads l
  left join winner w on true
  left join last_system_change s on true
  left join last_action a on true
  where l.id = p_lead_id;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_lead_gestion_reference(p_lead_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.leads l
  set gestion_reference_at = r.reference_at,
      gestion_postponed = r.postponed,
      gestion_has_events = r.has_events,
      gestion_reopened_by_system = r.reopened_by_system
  from public.lead_gestion_reference(p_lead_id) r
  where l.id = p_lead_id
    and (l.gestion_reference_at is distinct from r.reference_at
      or l.gestion_postponed is distinct from r.postponed
      or l.gestion_has_events is distinct from r.has_events
      or l.gestion_reopened_by_system is distinct from r.reopened_by_system);
$function$
;

CREATE OR REPLACE FUNCTION public.lead_gestion_reference_from_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_lead_gestion_reference(new.lead_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.lead_id is distinct from
     (case when tg_op = 'DELETE' then null else new.lead_id end) then
    perform public.refresh_lead_gestion_reference(old.lead_id);
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lead_gestion_reference_from_stage_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead_id uuid;
begin
  select lp.lead_id into v_lead_id
  from public.lead_properties lp
  where lp.id = coalesce(new.lead_property_id, old.lead_property_id);

  if v_lead_id is not null then
    perform public.refresh_lead_gestion_reference(v_lead_id);
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lead_gestion_reference_from_lead_property()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refresh_lead_gestion_reference(coalesce(new.lead_id, old.lead_id));
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lead_gestion_reference_from_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refresh_lead_gestion_reference(new.id);
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_lead_with_client(p_first_name text, p_lead_type lead_type_enum, p_last_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_property_funnel_stage_id uuid DEFAULT NULL::uuid, p_client_funnel_stage_id uuid DEFAULT NULL::uuid, p_sell_client_funnel_stage_id uuid DEFAULT NULL::uuid, p_channel_id uuid DEFAULT NULL::uuid, p_budget_max numeric DEFAULT NULL::numeric, p_bedrooms_min integer DEFAULT NULL::integer, p_bathrooms_min integer DEFAULT NULL::integer, p_sqm_min numeric DEFAULT NULL::numeric, p_payment_methods text[] DEFAULT NULL::text[], p_mortgage_deposit numeric DEFAULT NULL::numeric, p_operation_type text DEFAULT NULL::text, p_elevator_preference text DEFAULT NULL::text, p_balcony_preference text DEFAULT NULL::text, p_zone_criteria jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_briefing_id uuid DEFAULT NULL::uuid, p_linked_property_id uuid DEFAULT NULL::uuid, p_linked_property_stage_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_created_via text DEFAULT 'manual'::text, p_assigned_to uuid DEFAULT NULL::uuid, p_initial_task_due_date date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id      uuid;
  v_client_id   uuid;
  v_lead_id     uuid;
  v_briefing_id uuid;
BEGIN
  IF auth.role() = 'service_role' AND p_organization_id IS NOT NULL THEN
    v_org_id := p_organization_id;
  ELSE
    SELECT organization_id INTO v_org_id
    FROM public.users
    WHERE id = auth.uid();
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuario sin organización asociada';
  END IF;

  -- Los ids de configuración que vienen informados tienen que ser de esta organización:
  -- las FKs sólo exigen que la fila exista (ver cabecera). Antes de los fallbacks, que
  -- ya buscan dentro de v_org_id.
  IF p_channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lead_channels
    WHERE id = p_channel_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'El canal no pertenece a la organización';
  END IF;

  IF p_client_funnel_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_funnel_stages
    WHERE id = p_client_funnel_stage_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'La etapa de cliente no pertenece a la organización';
  END IF;

  IF p_property_funnel_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.property_funnel_stages
    WHERE id = p_property_funnel_stage_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'La etapa de propiedad no pertenece a la organización';
  END IF;

  IF p_sell_client_funnel_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sell_client_funnel_stages
    WHERE id = p_sell_client_funnel_stage_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'La etapa de vendedor no pertenece a la organización';
  END IF;

  IF p_linked_property_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.property_funnel_stages
    WHERE id = p_linked_property_stage_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'La etapa de la propiedad vinculada no pertenece a la organización';
  END IF;

  -- Fallback por value fijo (NEW_LEAD); position solo desempata en orgs sin values.
  IF p_property_funnel_stage_id IS NULL THEN
    SELECT id INTO p_property_funnel_stage_id
    FROM public.property_funnel_stages
    WHERE organization_id = v_org_id AND deleted_at IS NULL
    ORDER BY (value = 'NEW_LEAD') DESC, position ASC
    LIMIT 1;
  END IF;

  IF p_client_funnel_stage_id IS NULL AND p_lead_type = 'BUYER' THEN
    SELECT id INTO p_client_funnel_stage_id
    FROM public.client_funnel_stages
    WHERE organization_id = v_org_id AND deleted_at IS NULL
    ORDER BY (value = 'PENDING_MATCHING') DESC, position ASC
    LIMIT 1;
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = p_assigned_to AND organization_id = v_org_id
    ) THEN
      RAISE EXCEPTION 'El usuario asignado no pertenece a la organización';
    END IF;
  END IF;

  v_lead_id := COALESCE(p_lead_id, gen_random_uuid());
  v_client_id := NULL;

  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE organization_id = v_org_id AND phone = p_phone AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL AND p_email IS NOT NULL AND p_email <> '' THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE organization_id = v_org_id AND lower(email) = lower(p_email) AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    v_client_id := COALESCE(p_client_id, gen_random_uuid());
    BEGIN
      INSERT INTO public.clients (id, first_name, last_name, phone, email, organization_id)
      VALUES (v_client_id, p_first_name, p_last_name, p_phone, p_email, v_org_id);
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_client_id
      FROM public.clients
      WHERE organization_id = v_org_id
        AND (
          (p_phone IS NOT NULL AND p_phone <> '' AND phone = p_phone)
          OR (p_email IS NOT NULL AND p_email <> '' AND lower(email) = lower(p_email))
        )
        AND deleted_at IS NULL
      LIMIT 1;
    END;
  END IF;

  -- El duplicado es por (cliente, tipo, AGENTE): otro comercial de la misma org sí
  -- puede abrir su propio lead sobre esta persona (leads_client_type_assignee_active_uidx).
  IF EXISTS (
    SELECT 1 FROM public.leads
    WHERE client_id = v_client_id
      AND lead_type = p_lead_type
      AND assigned_to IS NOT DISTINCT FROM p_assigned_to
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya tenés un lead % activo para este cliente', p_lead_type;
  END IF;

  INSERT INTO public.leads (id, client_id, organization_id, lead_type, property_funnel_stage_id, client_funnel_stage_id, sell_client_funnel_stage_id, channel_id, created_via, assigned_to)
  VALUES (v_lead_id, v_client_id, v_org_id, p_lead_type, p_property_funnel_stage_id, p_client_funnel_stage_id, p_sell_client_funnel_stage_id, p_channel_id, p_created_via::public.creation_source_enum, p_assigned_to);

  -- Tarea inicial del alta manual. `entity_type = 'lead_comprador'` es el único tipo de
  -- lead que admite `tasks_entity_type_check`: hoy sólo el wizard de comprador la pide.
  -- `created_by` cae a `p_assigned_to` cuando no hay sesión (service_role), porque la
  -- columna es NOT NULL y su default `auth.uid()` ahí vale NULL.
  IF p_initial_task_due_date IS NOT NULL THEN
    INSERT INTO public.tasks (organization_id, entity_type, entity_id, title, due_date, assigned_to, created_by)
    VALUES (v_org_id, 'lead_comprador', v_lead_id, 'Asesorar cliente', p_initial_task_due_date, p_assigned_to, COALESCE(auth.uid(), p_assigned_to));
  END IF;

  v_briefing_id := COALESCE(p_briefing_id, gen_random_uuid());

  INSERT INTO public.briefings (
    id, organization_id, budget_max, bedrooms_min, bathrooms_min,
    sqm_min, notes, mortgage_deposit, operation_type,
    elevator_preference, balcony_preference
  )
  VALUES (
    v_briefing_id, v_org_id, p_budget_max, p_bedrooms_min, p_bathrooms_min,
    p_sqm_min, p_notes, p_mortgage_deposit, p_operation_type,
    COALESCE(p_elevator_preference, 'indifferent'),
    COALESCE(p_balcony_preference, 'indifferent')
  );

  IF p_payment_methods IS NOT NULL AND array_length(p_payment_methods, 1) > 0 THEN
    INSERT INTO public.briefing_payment_methods (briefing_id, payment_method_value)
    SELECT v_briefing_id, unnest(p_payment_methods);
  END IF;

  IF p_zone_criteria IS NOT NULL AND jsonb_array_length(p_zone_criteria) > 0 THEN
    INSERT INTO public.briefing_zones (briefing_id, kind, zone_id, lat, lng, label, sign)
    SELECT
      v_briefing_id,
      x->>'kind',
      (x->>'zone_id')::uuid,
      (x->>'lat')::numeric,
      (x->>'lng')::numeric,
      x->>'label',
      COALESCE(x->>'sign', 'positive')
    FROM jsonb_array_elements(p_zone_criteria) AS x;
  END IF;

  UPDATE public.leads SET briefing_id = v_briefing_id WHERE id = v_lead_id;

  IF p_linked_property_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.properties
      WHERE id = p_linked_property_id AND organization_id = v_org_id
    ) THEN
      RAISE EXCEPTION 'La propiedad no pertenece a la organización del usuario';
    END IF;

    -- Mismo fallback por value que arriba.
    IF p_linked_property_stage_id IS NULL THEN
      SELECT id INTO p_linked_property_stage_id
      FROM public.property_funnel_stages
      WHERE organization_id = v_org_id AND deleted_at IS NULL
      ORDER BY (value = 'NEW_LEAD') DESC, position ASC
      LIMIT 1;
    END IF;

    INSERT INTO public.lead_properties (lead_id, property_id, organization_id, property_funnel_stage_id)
    VALUES (v_lead_id, p_linked_property_id, v_org_id, p_linked_property_stage_id);
  END IF;

  RETURN json_build_object('lead_id', v_lead_id, 'client_id', v_client_id);
END;
$function$
;
