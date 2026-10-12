-- Dos reglas de la Caja que hasta acá vivían solo en el front (ver docs/mocks/caja-gastos.html).

-- Una etiqueta no se repite, sin importar mayúsculas. ms-frontend lo valida solo en pantalla;
-- acá también en la base, que dos pestañas abiertas no se pisen. Las borradas no cuentan: borrar
-- «Vercel» y crear otra «Vercel» es válido.
create unique index if not exists expense_presets_name_key
  on public.expense_presets (lower(name))
  where deleted_at is null;

-- Un gasto fijo cargado está pagado. El pendiente de un fijo es el mes que todavía no tiene su
-- fila (lo dibuja la etiqueta), no una fila en PENDING: con las dos formas, «¿está pago?» tendría
-- dos respuestas. PENDING queda para los variables.
alter table public.expenses drop constraint if exists expenses_fixed_paid_check;
alter table public.expenses add constraint expenses_fixed_paid_check
  check (expense_type <> 'FIXED' or status = 'PAID');

-- Corrige `expenses_preset_period_key` (migración expenses): era único por (preset_id, period)
-- para todo gasto con etiqueta, y los variables también llevan etiqueta — dos «Anuncios
-- LinkedIn» en el mismo mes chocaban. La regla «uno por mes» es solo de los fijos.
drop index if exists public.expenses_preset_period_key;
create unique index expenses_preset_period_key
  on public.expenses (preset_id, period)
  where expense_type = 'FIXED' and deleted_at is null;
