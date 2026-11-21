-- «Pagaron ambos» (21/11/2026, por pedido): un gasto pagado entre los dos que ponen plata en la
-- caja. `paid_by` sigue cargado (lo exige `expenses_paid_by_check` en todo PAID) y esta marca dice
-- que el gasto se reparte en partes iguales entre los de `users.caja`. Solo un pagado puede tenerla.
alter table public.expenses
  add column if not exists paid_by_both boolean not null default false;

alter table public.expenses drop constraint if exists expenses_paid_by_both_check;
alter table public.expenses add constraint expenses_paid_by_both_check
  check (not paid_by_both or status = 'PAID');
