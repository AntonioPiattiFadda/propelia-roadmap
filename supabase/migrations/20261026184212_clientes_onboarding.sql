-- Clientes y su onboarding (26/10/2026, por pedido). Propuesta en docs/onboarding/clientes.html;
-- modelo en docs/onboarding/MODELO_DATOS.md. Es el mismo bloque que está en supabase/schema.sql.
--
-- Qué es cada lead lo dice `crm_leads.lead_type`: LEAD (todos los de hoy), ONBOARDING (firmó y se
-- está dando de alta) y CLIENT (alta terminada). Un lead pasa a ONBOARDING solo, cuando el
-- comercial lo mueve a una etapa con `starts_onboarding` («Contratado»): lo hace un trigger, que
-- además le crea su `client_onboardings`. La página /clientes (solo SUPERADMIN) lista los
-- ONBOARDING. El front no escribe `lead_type`: el trigger y `client_onboarding_completar`.

-- ---------- Qué es cada lead ----------
do $$ begin
  create type public.crm_lead_type as enum ('LEAD', 'ONBOARDING', 'CLIENT');
exception when duplicate_object then null;
end $$;

alter table public.crm_leads add column if not exists lead_type public.crm_lead_type not null default 'LEAD';
create index if not exists crm_leads_lead_type_idx on public.crm_leads (lead_type) where lead_type <> 'LEAD';

-- El vínculo con su organización en Propelia (el producto). Sin FK: es otro proyecto. El nombre
-- de la org no se guarda: se le pide al puente cuando hace falta.
alter table public.crm_leads add column if not exists propelia_organization_id uuid;
comment on column public.crm_leads.propelia_organization_id is
  'Organización del cliente en Propelia (proyecto gvkdyxhxsnpumxlhvhsm). Sin FK: es otra base. La deja el import de usuarios del onboarding, paso 1.';
-- Una organización va con un solo lead.
create unique index if not exists crm_leads_propelia_org_unique
  on public.crm_leads (propelia_organization_id)
  where propelia_organization_id is not null and deleted_at is null;

-- ---------- Qué etapa dispara el onboarding ----------
-- «Onboarding» (Sí/No) en la configuración del funnel, como «Dashboard» y «Tareas». No se busca
-- la etapa por nombre: las etapas se renombran. La RLS de crm_funnel_stages ya cubre la columna.
alter table public.crm_funnel_stages add column if not exists starts_onboarding boolean not null default false;
-- Arranca marcada «Contratado», que es la que hay hoy. Una sola vez: después se cambia desde el funnel.
update public.crm_funnel_stages set starts_onboarding = true
  where label = 'Contratado' and deleted_at is null
    and not exists (select 1 from public.crm_funnel_stages where starts_onboarding);

-- ---------- El onboarding ----------
create table if not exists public.client_onboardings (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null unique references public.crm_leads (id) on delete cascade,
  -- Quién de soporte lleva el alta. Nace vacío: el trigger no sabe quién la va a hacer.
  assigned_to  uuid references public.users (id) on delete set null,
  -- Quien movió el lead a la etapa (el comercial); null si fue por SQL.
  created_by   uuid references public.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  -- null = en curso. Lo escribe `client_onboarding_completar`.
  completed_at timestamptz
);

-- El equipo del cliente: lo carga el Excel de usuarios (paso 1). El responsable nace con el
-- onboarding, con los datos del cliente del CRM, para la plantilla del Excel y el WhatsApp.
create table if not exists public.client_onboarding_members (
  id            uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  first_name    text not null check (btrim(first_name) <> ''),
  last_name     text not null default '',
  email         text,
  phone         text,
  role          text not null default 'agent' check (role in ('agent', 'admin')),
  is_owner      boolean not null default false,
  is_contact    boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index if not exists client_onboarding_members_one_owner
  on public.client_onboarding_members (onboarding_id) where is_owner;
create unique index if not exists client_onboarding_members_one_contact
  on public.client_onboarding_members (onboarding_id) where is_contact;
create index if not exists client_onboarding_members_onboarding_id
  on public.client_onboarding_members (onboarding_id);

-- Las tareas hechas. task_id sin FK: el catálogo de pasos está en el código
-- (src/pages/clientes/lib/pasos.ts). Sin fila = pendiente.
create table if not exists public.client_onboarding_tasks (
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  task_id       text not null,
  done_by       uuid references public.users (id) on delete set null default auth.uid(),
  done_at       timestamptz not null default now(),
  primary key (onboarding_id, task_id)
);

-- Los WhatsApp del onboarding. Variables: {nombre} (el responsable), {soporte} (quien envía),
-- {inmobiliaria} y, en link_de_pago, {link}.
create table if not exists public.onboarding_message_templates (
  id         text primary key,
  body       text not null check (btrim(body) <> ''),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.onboarding_message_templates (id, body) values
(
  'contacto_inicial',
  E'¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋\n\n'
  'Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.\n\n'
  'Para crear vuestra cuenta necesito dos cosas:\n\n'
  '1. El nombre de la inmobiliaria tal como queréis que aparezca en Propelia.\n\n'
  '2. Que rellenéis el Excel que os adjunto con las personas del equipo que van a usar Propelia: una fila por persona, con nombre, apellido, email, teléfono (con +34) y rol (Administrador o Agente). Marcad con «Sí» en la columna Responsable a quien va a llevar la cuenta.\n\n'
  'Cuando me lo devolváis, os creo todos los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.'
), (
  'configurar_organizacion',
  E'{nombre}, el siguiente paso es dejar lista la organización de {inmobiliaria}. En Propelia, entrad a Ajustes:\n\n'
  '- Organización: el nombre de la inmobiliaria y vuestra web.\n'
  '- Marca: el logo y los colores de la inmobiliaria.\n\n'
  'Si os viene bien, lo hacemos juntos en una llamada de 20 minutos: decidme día y hora.'
), (
  'link_de_pago',
  E'{nombre}, os dejo el enlace para activar la suscripción de {inmobiliaria}:\n\n'
  '{link}\n\n'
  'Se paga con tarjeta, sin necesidad de iniciar sesión. El enlace vale 7 días. Cuando esté hecho, avisadme por aquí.'
), (
  'asignar_y_mails',
  E'{nombre}, ya tenéis la cartera de {inmobiliaria} cargada en Propelia. Dos cosas para empezar a recibir los leads:\n\n'
  '1. En Propiedades, asignad cada inmueble al agente que lo lleva.\n'
  '2. En Idealista, configurad que los mensajes de cada agente se reenvíen a su dirección de Propelia. Os paso las direcciones por aquí.\n\n'
  'Cuando lo tengáis, hacemos una prueba juntos.'
), (
  'integrar_portales',
  E'{nombre}, ahora toca conectar los portales de {inmobiliaria}. En Propelia, entrad a Ajustes → Integraciones y conectad Idealista y Fotocasa.\n\n'
  'Si en algún paso os pide algo que no tenéis a mano, escribidme por aquí y lo vemos juntos.'
)
on conflict (id) do nothing;

-- ---------- RLS: solo SUPERADMIN ----------
alter table public.client_onboardings           enable row level security;
alter table public.client_onboarding_members    enable row level security;
alter table public.client_onboarding_tasks      enable row level security;
alter table public.onboarding_message_templates enable row level security;

drop policy if exists "client_onboardings_superadmin" on public.client_onboardings;
create policy "client_onboardings_superadmin" on public.client_onboardings
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());
drop policy if exists "client_onboarding_members_superadmin" on public.client_onboarding_members;
create policy "client_onboarding_members_superadmin" on public.client_onboarding_members
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());
drop policy if exists "client_onboarding_tasks_superadmin" on public.client_onboarding_tasks;
create policy "client_onboarding_tasks_superadmin" on public.client_onboarding_tasks
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- Las plantillas se editan, no se crean ni se borran desde la app.
drop policy if exists "onboarding_message_templates_select" on public.onboarding_message_templates;
create policy "onboarding_message_templates_select" on public.onboarding_message_templates
  for select to authenticated using (public.crm_es_superadmin());
drop policy if exists "onboarding_message_templates_update" on public.onboarding_message_templates;
create policy "onboarding_message_templates_update" on public.onboarding_message_templates
  for update to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

revoke all on public.client_onboardings, public.client_onboarding_members,
              public.client_onboarding_tasks, public.onboarding_message_templates from anon;
grant select, insert, update, delete on public.client_onboardings, public.client_onboarding_members,
                                        public.client_onboarding_tasks to authenticated;
grant select, update on public.onboarding_message_templates to authenticated;

-- ---------- El paso a ONBOARDING ----------
-- Crea el onboarding de un lead con su responsable (los datos del cliente del CRM). Idempotente:
-- si ya tiene, no hace nada. Solo la llaman el trigger y la service role: es security definer
-- porque lo dispara el comercial, que no ve estas tablas.
create or replace function public.client_onboarding_crear(p_lead_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
begin
  insert into public.client_onboardings (lead_id) values (p_lead_id)
  on conflict (lead_id) do nothing
  returning id into v_id;
  if v_id is null then
    return (select id from public.client_onboardings where lead_id = p_lead_id);
  end if;
  insert into public.client_onboarding_members
    (onboarding_id, first_name, last_name, email, phone, role, is_owner, is_contact)
  select v_id,
         coalesce(nullif(btrim(c.first_name), ''), nullif(btrim(c.company_name), ''), 'Responsable'),
         coalesce(btrim(c.last_name), ''),
         nullif(btrim(c.email), ''),
         nullif(btrim(c.phone), ''),
         'admin', true, true
  from public.crm_leads l
  join public.crm_clients c on c.id = l.client_id
  where l.id = p_lead_id;
  return v_id;
end;
$$;
revoke execute on function public.client_onboarding_crear(uuid) from public, anon, authenticated;

-- `lead_type` lo escribe solo la base. Antes de guardar el lead: rechaza cualquier cambio a mano
-- de la columna y, si el lead (LEAD) entra a una etapa con `starts_onboarding`, lo pasa a
-- ONBOARDING. Solo desde LEAD: un CLIENT que vuelve a pasar por Contratado no reabre nada. Sin
-- sesión (service role, migraciones) no se corta. `client_onboarding_completar` se habilita con
-- `crm.lead_type_rpc`, que vale solo dentro de su transacción.
create or replace function public.crm_leads_lead_type()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(current_setting('crm.lead_type_rpc', true), '') <> 'on' then
    if (tg_op = 'INSERT' and new.lead_type <> 'LEAD')
       or (tg_op = 'UPDATE' and new.lead_type is distinct from old.lead_type) then
      raise exception 'crm_lead_type_solo_rpc' using errcode = '42501';
    end if;
  end if;
  if new.lead_type = 'LEAD' and new.deleted_at is null and new.funnel_stage_id is not null
     and (tg_op = 'INSERT' or new.funnel_stage_id is distinct from old.funnel_stage_id)
     and exists (select 1 from public.crm_funnel_stages s
                 where s.id = new.funnel_stage_id and s.starts_onboarding and s.deleted_at is null) then
    new.lead_type := 'ONBOARDING';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_lead_type on public.crm_leads;
create trigger crm_leads_lead_type before insert or update of lead_type, funnel_stage_id on public.crm_leads
  for each row execute function public.crm_leads_lead_type();

-- Ya guardado el lead, le crea el onboarding. Va después porque el onboarding apunta al lead.
-- Escucha también `funnel_stage_id`: el `update of` mira las columnas del SET, y el paso a
-- ONBOARDING lo hace el trigger de arriba, no el SET.
create or replace function public.crm_leads_crear_onboarding()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.lead_type = 'ONBOARDING' and (tg_op = 'INSERT' or old.lead_type is distinct from new.lead_type) then
    perform public.client_onboarding_crear(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists crm_leads_crear_onboarding on public.crm_leads;
create trigger crm_leads_crear_onboarding after insert or update of lead_type, funnel_stage_id on public.crm_leads
  for each row execute function public.crm_leads_crear_onboarding();

-- ---------- RPCs de la página ----------
-- El import del Excel de usuarios (paso 1): reemplaza el equipo por el del Excel, deja la org de
-- Propelia que creó el puente en el lead y tilda «Recibir el Excel» e «Importar el Excel». Todo o
-- nada. `p_miembros`: [{first_name, last_name, email, phone, role, is_owner}], uno con is_owner.
create or replace function public.client_onboarding_importar_equipo(
  p_onboarding_id uuid, p_organization_id uuid, p_miembros jsonb
) returns void language plpgsql security invoker set search_path to 'public' as $$
declare
  v_lead uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_solo_superadmin' using errcode = '42501';
  end if;
  select lead_id into v_lead from public.client_onboardings where id = p_onboarding_id;
  if v_lead is null then
    raise exception 'crm_onboarding_no_existe' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_miembros) <> 'array' or jsonb_array_length(p_miembros) = 0 then
    raise exception 'crm_onboarding_sin_miembros' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_miembros) m where coalesce((m->>'is_owner')::boolean, false)) <> 1 then
    raise exception 'crm_onboarding_un_responsable' using errcode = '22023';
  end if;

  delete from public.client_onboarding_members where onboarding_id = p_onboarding_id;
  insert into public.client_onboarding_members
    (onboarding_id, first_name, last_name, email, phone, role, is_owner, is_contact)
  select p_onboarding_id, btrim(m->>'first_name'), coalesce(btrim(m->>'last_name'), ''),
         nullif(btrim(m->>'email'), ''), nullif(btrim(m->>'phone'), ''),
         coalesce(m->>'role', 'agent'),
         coalesce((m->>'is_owner')::boolean, false), coalesce((m->>'is_owner')::boolean, false)
  from jsonb_array_elements(p_miembros) m;

  update public.crm_leads set propelia_organization_id = p_organization_id where id = v_lead;

  insert into public.client_onboarding_tasks (onboarding_id, task_id)
  values (p_onboarding_id, 'contacto.excel-recibido'), (p_onboarding_id, 'contacto.importar-usuarios')
  on conflict do nothing;
end;
$$;

-- Termina el alta: `completed_at` y el lead pasa a CLIENT (sale de la lista de /clientes).
create or replace function public.client_onboarding_completar(p_onboarding_id uuid)
returns void language plpgsql security invoker set search_path to 'public' as $$
declare
  v_lead uuid;
begin
  if not public.crm_es_superadmin() then
    raise exception 'crm_solo_superadmin' using errcode = '42501';
  end if;
  update public.client_onboardings set completed_at = now()
    where id = p_onboarding_id and completed_at is null
    returning lead_id into v_lead;
  if v_lead is null then
    raise exception 'crm_onboarding_no_existe' using errcode = 'P0002';
  end if;
  perform set_config('crm.lead_type_rpc', 'on', true);
  update public.crm_leads set lead_type = 'CLIENT' where id = v_lead;
  perform set_config('crm.lead_type_rpc', '', true);
end;
$$;

revoke execute on function public.client_onboarding_importar_equipo(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.client_onboarding_completar(uuid) from public, anon;
grant execute on function public.client_onboarding_importar_equipo(uuid, uuid, jsonb) to authenticated;
grant execute on function public.client_onboarding_completar(uuid) to authenticated;

-- ---------- Realtime ----------
-- Que dos SUPERADMIN vean lo mismo sin recargar: la página invalida al recibir cualquier cambio.
do $$
declare t text;
begin
  foreach t in array array['client_onboardings', 'client_onboarding_members', 'client_onboarding_tasks'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Los que ya estaban en la etapa antes de esta migración (hoy, ninguno): mismo camino que el
-- trigger. Sin sesión, el corte de `crm_leads_lead_type` no aplica.
update public.crm_leads l set lead_type = 'ONBOARDING'
from public.crm_funnel_stages s
where s.id = l.funnel_stage_id and s.starts_onboarding and s.deleted_at is null
  and l.lead_type = 'LEAD' and l.deleted_at is null;
