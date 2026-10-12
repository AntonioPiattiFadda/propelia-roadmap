-- Quién pagó cada gasto (12/10/2026), separado de quién lo cargó (`created_by`). Es una persona
-- sola: la caja es un registro de gastos de la empresa, no el reparto entre socios de la vieja
-- `roadmap_caja` (`cuenta` + `carga`).
alter table public.expenses
  add column if not exists paid_by uuid references public.users(id) on delete restrict;

-- Los gastos que ya estaban (todos PAID) los pagó quien los cargó: es lo único que se sabe.
update public.expenses set paid_by = created_by where paid_by is null and status = 'PAID';

-- Pagado ⇒ alguien lo pagó. Un variable PENDING todavía no tiene quién: se elige al confirmar el pago.
alter table public.expenses drop constraint if exists expenses_paid_by_check;
alter table public.expenses add constraint expenses_paid_by_check
  check (status <> 'PAID' or paid_by is not null);
