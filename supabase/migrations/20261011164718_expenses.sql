-- La Caja de la app nueva (11/10/2026): gastos fijos y variables, copiado y podado de
-- `business_expense_presets` / `business_expenses` de ms-frontend (Pediclick).
--
-- Reemplaza a `roadmap_caja`, la del tablero vanilla: se tira entera. Tenía 3 filas (Hetzner,
-- Supabase y un balance en 0) y ningún gasto fijo, y su modelo era otro — quién puso la plata
-- (`cuenta`) y a quién se le carga (`carga`) para repartir saldos entre socios. Acá eso no va:
-- la caja es un registro de gastos de la empresa y nada más. La caja de `legacy/` deja de andar.
--
-- Qué se dejó afuera de ms-frontend, a propósito: organization_id, location_id (y su tabla de
-- presets por local), provider_id, payment_method, load_order_id / auto_generated /
-- VARIABLE_MERCHANDISE, wallet_applied, los triggers de wallet y de costo indirecto, y el estado
-- IGNORED y las recurrencias BIMONTHLY / QUARTERLY / YEARLY (se pidió lo mínimo).

drop table if exists public.roadmap_caja;

-- ---------- Plantillas de gasto ----------
-- Un gasto fijo es una plantilla más una fila de `expenses` por período. Mientras el
-- período no tiene su fila, la plantilla cuenta igual como comprometido (con `default_amount`).
create table if not exists public.expense_presets (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  expense_type   text not null check (expense_type in ('FIXED', 'VARIABLE')),
  recurrence     text not null default 'ONE_TIME' check (recurrence in ('MONTHLY', 'ONE_TIME')),
  default_amount numeric check (default_amount is null or default_amount > 0),
  due_day        integer check (due_day between 1 and 31),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ---------- Gastos ----------
-- `preset_id` nulo es un gasto suelto. `period` ('YYYY-MM') es el mes al que se imputa, que no
-- tiene por qué ser el de `date` (el día en que se pagó, si se pagó).
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  preset_id    uuid references public.expense_presets(id) on delete restrict,
  expense_name text not null,
  expense_type text not null check (expense_type in ('FIXED', 'VARIABLE')),
  amount       numeric not null check (amount > 0),
  date         date,
  period       text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  recurrence   text not null default 'MONTHLY' check (recurrence in ('MONTHLY', 'ONE_TIME')),
  status       text not null default 'PAID' check (status in ('PENDING', 'PAID')),
  notes        text,
  created_by   uuid default auth.uid() references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists expenses_period_idx on public.expenses (period)
  where deleted_at is null;
create index if not exists expenses_preset_idx on public.expenses (preset_id)
  where deleted_at is null;
-- Esto no está en ms-frontend: una plantilla tiene a lo sumo un gasto vivo por mes. Sin el
-- índice, dos clics en «registrar el fijo de este mes» lo cobran dos veces.
create unique index if not exists expenses_preset_period_key
  on public.expenses (preset_id, period)
  where preset_id is not null and deleted_at is null;

drop trigger if exists expense_presets_set_updated_at on public.expense_presets;
create trigger expense_presets_set_updated_at before update on public.expense_presets
  for each row execute function public.set_updated_at();
drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------- RLS ----------
-- La misma regla que tenía roadmap_caja: cualquiera con fila activa en `users`.
alter table public.expense_presets enable row level security;
alter table public.expenses        enable row level security;

drop policy if exists expense_presets_m on public.expense_presets;
create policy expense_presets_m on public.expense_presets for all
  using (public.es_usuario()) with check (public.es_usuario());
drop policy if exists expenses_m on public.expenses;
create policy expenses_m on public.expenses for all
  using (public.es_usuario()) with check (public.es_usuario());
