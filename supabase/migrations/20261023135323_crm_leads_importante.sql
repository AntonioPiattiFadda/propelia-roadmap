-- Leads importantes (23/10/2026, por pedido): la estrella de la lista del CRM, solo para
-- SUPERADMIN. Es del equipo y no de cada uno: si un SUPERADMIN lo marca, aparece en el resumen
-- de /crm de todos los SUPERADMIN. El front anda sin esta migración (lee `*` y sin la columna no
-- hay ninguno marcado); marcar uno contesta FALTA_MIGRACION.
alter table public.crm_leads add column if not exists importante boolean not null default false;

-- La RLS de crm_leads deja escribir a quien tenga write sobre la cartera, SDR incluido: el corte
-- por rol va en un trigger. Solo un SUPERADMIN activo cambia `importante`. Sin sesión
-- (auth.uid() null: service role, postgres, migraciones) no se corta: la RLS ya no deja entrar a
-- anon, y lo que corre del lado del servidor no es un usuario. Espejo en pantalla:
-- `puedeMarcarImportante()` de src/pages/crm/lib/permisos.ts.
create or replace function public.crm_leads_importante_solo_superadmin()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or public.crm_es_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.importante then
      raise exception 'crm_importante_solo_superadmin' using errcode = '42501';
    end if;
  elsif new.importante is distinct from old.importante then
    raise exception 'crm_importante_solo_superadmin' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_importante_solo_superadmin on public.crm_leads;
create trigger crm_leads_importante_solo_superadmin before insert or update of importante on public.crm_leads
  for each row execute function public.crm_leads_importante_solo_superadmin();

