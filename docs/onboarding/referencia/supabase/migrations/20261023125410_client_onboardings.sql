-- ============================================================
-- Onboarding de clientes nuevos: el seguimiento de soporte
-- ============================================================
-- Doc: docs/soporteYOnboarding/ONBOARDING_CLIENTES.md · pantalla /onboarding-admin
--
-- QUÉ SE GUARDA Y QUÉ NO
-- Los pasos y sus tareas viven en el código (src/pages/onboarding-admin/onboardingCatalog.ts),
-- igual que los tours. Acá va lo que hace soporte con cada cliente:
--   client_onboardings          → un alta en curso: la inmobiliaria y su responsable.
--   client_onboarding_members   → el equipo que pasó el cliente (el responsable incluido).
--   client_onboarding_tasks     → las tareas hechas. Sin fila = pendiente.
--   onboarding_message_templates→ los mensajes que se le mandan al cliente, editables.
--
-- El onboarding arranca ANTES de que exista la organización: el contacto inicial es por
-- WhatsApp y la organización la crea recién el alta del responsable. Por eso
-- `organization_id` es nullable y se vincula después.
--
-- `task_id` sin FK, como user_tour_activations.tour_id: el catálogo está en el código.
--
-- QUIÉN LEE Y ESCRIBE
-- Sólo superadmin, todo por RLS. El cliente nunca ve estas tablas.

create table if not exists public.client_onboardings (
  id              uuid primary key default gen_random_uuid(),
  agency_name     text not null check (btrim(agency_name) <> ''),
  organization_id uuid references public.organizations (id) on delete set null,
  created_by      uuid references public.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

comment on table public.client_onboardings is
  'Altas de clientes que sigue soporte. organization_id se vincula cuando el responsable crea la cuenta.';

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

-- Un solo responsable por alta.
create unique index if not exists client_onboarding_members_one_owner
  on public.client_onboarding_members (onboarding_id) where is_owner;

-- Una sola persona de contacto por alta: la que habla con soporte y con su equipo, configura
-- la organización y conecta los portales. Arranca siendo el responsable.
create unique index if not exists client_onboarding_members_one_contact
  on public.client_onboarding_members (onboarding_id) where is_contact;

create index if not exists client_onboarding_members_onboarding_id
  on public.client_onboarding_members (onboarding_id);

comment on table public.client_onboarding_members is
  'Equipo que pasó el cliente para crearle las cuentas. is_owner = el responsable; is_contact = la persona de contacto, a quien le salen los mensajes.';

create table if not exists public.client_onboarding_tasks (
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  task_id       text not null,
  done_by       uuid references public.users (id) on delete set null default auth.uid(),
  done_at       timestamptz not null default now(),
  primary key (onboarding_id, task_id)
);

comment on table public.client_onboarding_tasks is
  'Tareas del onboarding ya hechas. Las tareas se definen en el código; sin fila = pendiente.';

create table if not exists public.onboarding_message_templates (
  id         text primary key,
  body       text not null check (btrim(body) <> ''),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_message_templates is
  'Mensajes de onboarding para el cliente. Variables: {nombre} (persona de contacto), {soporte} (quien envía), {inmobiliaria}.';

insert into public.onboarding_message_templates (id, body)
values (
  'contacto_inicial',
  E'¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋\n\n'
  'Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.\n\n'
  'Para empezar necesito dos cosas:\n\n'
  '1. Una persona de contacto de vuestro lado, que hable con nosotros y con el resto del equipo, para que todo vaya por un solo canal. Se encargará también de configurar la organización y de conectar los portales. Si eres tú, perfecto; si no, pásame su nombre y su teléfono.\n\n'
  '2. Las personas del equipo que van a usar Propelia. Por cada una:\n'
  '- Nombre y apellido:\n'
  '- Email:\n'
  '- Teléfono (con +34):\n'
  '- Rol (Administrador / Agente):\n\n'
  'Con eso os creo los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.'
), (
  'integrar_portales',
  E'{nombre}, ahora toca conectar los portales de {inmobiliaria}. En Propelia, entrad a Ajustes → Integraciones y conectad Idealista y Fotocasa.\n\n'
  'Si en algún paso os pide algo que no tenéis a mano, escribidme por aquí y lo vemos juntos.'
), (
  'configurar_organizacion',
  E'{nombre}, el siguiente paso es dejar lista la organización de {inmobiliaria}. En Propelia, entrad a Ajustes:\n\n'
  '- Organización: el nombre de la inmobiliaria y vuestra web.\n'
  '- Marca: el logo y los colores de la inmobiliaria.\n\n'
  'Cuando lo tengáis, avisadme por aquí y lo reviso.'
)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- RLS: superadmin y nadie más
-- ------------------------------------------------------------
alter table public.client_onboardings           enable row level security;
alter table public.client_onboarding_members    enable row level security;
alter table public.client_onboarding_tasks      enable row level security;
alter table public.onboarding_message_templates enable row level security;

drop policy if exists "client_onboardings_superadmin" on public.client_onboardings;
create policy "client_onboardings_superadmin"
  on public.client_onboardings for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "client_onboarding_members_superadmin" on public.client_onboarding_members;
create policy "client_onboarding_members_superadmin"
  on public.client_onboarding_members for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "client_onboarding_tasks_superadmin" on public.client_onboarding_tasks;
create policy "client_onboarding_tasks_superadmin"
  on public.client_onboarding_tasks for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Los mensajes se editan, no se crean ni se borran desde la app: el código busca cada uno por id.
drop policy if exists "onboarding_message_templates_select" on public.onboarding_message_templates;
create policy "onboarding_message_templates_select"
  on public.onboarding_message_templates for select to authenticated
  using (public.is_superadmin());

drop policy if exists "onboarding_message_templates_update" on public.onboarding_message_templates;
create policy "onboarding_message_templates_update"
  on public.onboarding_message_templates for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

revoke all on public.client_onboardings, public.client_onboarding_members,
              public.client_onboarding_tasks, public.onboarding_message_templates from anon;
grant select, insert, update, delete on public.client_onboardings, public.client_onboarding_members,
                                        public.client_onboarding_tasks to authenticated;
revoke insert, delete, truncate on public.onboarding_message_templates from authenticated;
grant select, update on public.onboarding_message_templates to authenticated;

-- Tablas nuevas: que también les aplique el bloqueo del conector.
select public.oauth_guard_apply();

-- ------------------------------------------------------------
-- Alta nueva: la inmobiliaria y su responsable en una sola operación, para que nunca quede
-- un onboarding sin responsable (el WhatsApp inicial sale a su teléfono).
-- ------------------------------------------------------------
create or replace function public.client_onboarding_create(
  p_agency_name      text,
  p_owner_first_name text,
  p_owner_last_name  text,
  p_owner_phone      text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Sólo superadmin puede crear un onboarding'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.client_onboardings (agency_name)
  values (btrim(p_agency_name))
  returning id into v_id;

  -- El responsable arranca siendo también la persona de contacto: es a quien se le escribe primero.
  insert into public.client_onboarding_members (onboarding_id, first_name, last_name, phone, role, is_owner, is_contact)
  values (v_id, btrim(p_owner_first_name), btrim(coalesce(p_owner_last_name, '')), nullif(btrim(p_owner_phone), ''), 'admin', true, true);

  return v_id;
end;
$$;

revoke all on function public.client_onboarding_create(text, text, text, text) from public, anon;
grant execute on function public.client_onboarding_create(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- Cambiar la persona de contacto. En una sola operación: con dos UPDATE desde el cliente, el
-- índice de "un solo contacto" choca o queda un instante sin contacto.
-- ------------------------------------------------------------
create or replace function public.client_onboarding_set_contact(p_member_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_onboarding_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'Sólo superadmin puede cambiar la persona de contacto'
      using errcode = 'insufficient_privilege';
  end if;

  select onboarding_id into v_onboarding_id
    from public.client_onboarding_members
   where id = p_member_id;

  if v_onboarding_id is null then
    raise exception 'No existe esa persona en el onboarding'
      using errcode = 'no_data_found';
  end if;

  update public.client_onboarding_members
     set is_contact = false
   where onboarding_id = v_onboarding_id and is_contact and id <> p_member_id;

  update public.client_onboarding_members
     set is_contact = true
   where id = p_member_id;
end;
$$;

revoke all on function public.client_onboarding_set_contact(uuid) from public, anon;
grant execute on function public.client_onboarding_set_contact(uuid) to authenticated;
