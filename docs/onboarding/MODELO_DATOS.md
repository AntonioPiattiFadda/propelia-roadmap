# Onboarding — modelo de datos en el Roadmap

Base del Roadmap (`itqwxnmuxuiiydsueazb`). Es la adaptación de
`referencia/supabase/migrations/20261023125410_client_onboardings.sql` (la del producto):
mismas tablas, pero colgadas del lead y con los usuarios y el rol del Roadmap.

Va como migración con el CLI y el mismo cambio en `supabase/schema.sql` (ver `CLAUDE.md` ›
Migraciones). El SQL de abajo es el **borrador**: la migración se escribe a partir de él.

## Qué cambia respecto del producto

| Producto | Roadmap |
|---|---|
| `client_onboardings.agency_name` (texto suelto) | Sale de `crm_clients.company_name` vía `lead_id` |
| `client_onboardings.organization_id` → FK a `organizations` | `crm_leads.propelia_organization_id`, **sin FK** (es otro proyecto) |
| `created_by`/`done_by`/`updated_by` → `users` del producto | → `public.users` del Roadmap |
| `public.is_superadmin()` | `public.crm_es_superadmin()` |
| `client_onboarding_create(agency, nombre, apellido, teléfono)` | `client_onboarding_create(p_lead_id)`: el responsable sale del cliente del CRM |
| `select public.oauth_guard_apply();` | No existe acá: se saca |
| 3 plantillas | 5 plantillas (ver abajo) |

## El vínculo lead ↔ organización

```sql
alter table public.crm_leads
  add column if not exists propelia_organization_id uuid;

comment on column public.crm_leads.propelia_organization_id is
  'Organización del cliente en Propelia (proyecto gvkdyxhxsnpumxlhvhsm). Sin FK: es otra base. La elige soporte en el onboarding, paso 1.';

-- Una organización va con un solo lead.
create unique index if not exists crm_leads_propelia_org_unique
  on public.crm_leads (propelia_organization_id)
  where propelia_organization_id is not null and deleted_at is null;
```

Se escribe desde la pantalla de onboarding con un `update` común sobre `crm_leads` (las policies
del CRM ya dejan al SUPERADMIN). El nombre de la org **no se guarda**: se pide al puente
(`list_organizations`) cuando hace falta mostrarlo.

## Tablas

```sql
create table if not exists public.client_onboardings (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null unique references public.crm_leads (id) on delete cascade,
  created_by   uuid references public.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  -- null = en curso. Lo marca soporte al terminar el paso 7.
  completed_at timestamptz
);

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

-- task_id sin FK: el catálogo de pasos está en el código. Sin fila = pendiente.
create table if not exists public.client_onboarding_tasks (
  onboarding_id uuid not null references public.client_onboardings (id) on delete cascade,
  task_id       text not null,
  done_by       uuid references public.users (id) on delete set null default auth.uid(),
  done_at       timestamptz not null default now(),
  primary key (onboarding_id, task_id)
);

create table if not exists public.onboarding_message_templates (
  id         text primary key,
  body       text not null check (btrim(body) <> ''),
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
```

## RLS

Sólo SUPERADMIN, en las cuatro tablas (mismo patrón que el producto):

```sql
alter table public.client_onboardings           enable row level security;
alter table public.client_onboarding_members    enable row level security;
alter table public.client_onboarding_tasks      enable row level security;
alter table public.onboarding_message_templates enable row level security;

create policy "client_onboardings_superadmin" on public.client_onboardings
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());
create policy "client_onboarding_members_superadmin" on public.client_onboarding_members
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());
create policy "client_onboarding_tasks_superadmin" on public.client_onboarding_tasks
  for all to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- Las plantillas se editan, no se crean ni se borran desde la app.
create policy "onboarding_message_templates_select" on public.onboarding_message_templates
  for select to authenticated using (public.crm_es_superadmin());
create policy "onboarding_message_templates_update" on public.onboarding_message_templates
  for update to authenticated using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

revoke all on public.client_onboardings, public.client_onboarding_members,
              public.client_onboarding_tasks, public.onboarding_message_templates from anon;
grant select, insert, update, delete on public.client_onboardings, public.client_onboarding_members,
                                        public.client_onboarding_tasks to authenticated;
grant select, update on public.onboarding_message_templates to authenticated;
```

## RPCs

**`client_onboarding_create(p_lead_id uuid) returns uuid`**: crea el onboarding del lead y su
responsable (`is_owner` y `is_contact`, rol `admin`) con `first_name`, `last_name`, `email` y
`phone` del `crm_clients` del lead. Falla si el lead no existe, está borrado o ya tiene onboarding.
Exige `crm_es_superadmin()`. Si el cliente no tiene `first_name`, usa `company_name`.

**`client_onboarding_set_contact(p_member_id uuid)`**: igual que en el producto
(`referencia/supabase/migrations/20261023125410_client_onboardings.sql`), cambiando
`is_superadmin()` por `crm_es_superadmin()`.

Las dos, `security invoker`, `set search_path = public`, `revoke ... from public, anon` y
`grant execute ... to authenticated`.

## Plantillas iniciales

`insert ... on conflict (id) do nothing`. Variables: `{nombre}`, `{soporte}`, `{inmobiliaria}`.
Los textos van en español de España (vosotros), como los actuales. `configurar_organizacion` e
`integrar_portales` se copian tal cual de la migración del producto; `contacto_inicial` cambia
(ahora pide el nombre de la organización) y hay dos nuevas. Son borradores: soporte los edita
desde la pantalla.

- **`contacto_inicial`**:
  ```
  ¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋

  Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.

  Para crear vuestra cuenta necesito:

  1. El nombre de la inmobiliaria tal como queréis que aparezca en Propelia.

  2. Las personas del equipo que van a usar Propelia. Por cada una:
  - Nombre y apellido:
  - Email:
  - Teléfono (con +34):
  - Rol (Administrador / Agente):

  Con eso os creo los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.
  ```
- **`link_de_pago`**:
  ```
  {nombre}, os dejo el enlace para activar la suscripción de {inmobiliaria}:

  {link}

  Se paga con tarjeta, sin necesidad de iniciar sesión. El enlace vale 7 días. Cuando esté hecho, avisadme por aquí.
  ```
  Usa una variable más, `{link}`, que se completa con la URL que devuelve `create_payment_link`.
- **`asignar_y_mails`**:
  ```
  {nombre}, ya tenéis la cartera de {inmobiliaria} cargada en Propelia. Dos cosas para empezar a recibir los leads:

  1. En Propiedades, asignad cada inmueble al agente que lo lleva.
  2. En Idealista, configurad que los mensajes de cada agente se reenvíen a su dirección de Propelia. Os paso las direcciones por aquí.

  Cuando lo tengáis, hacemos una prueba juntos.
  ```
