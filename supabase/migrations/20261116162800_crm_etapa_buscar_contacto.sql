-- Etapa «Buscar contacto» (16/11/2026, por pedido): va justo después de «Por contactar». El SDR deja
-- ahí el lead del que no consigue contacto y el equipo le busca uno. Es una etapa común: se ve en la
-- lista, para todos (SDR incluido). Sin gestión (`management_type` null): no entra en el atajo «Por
-- contactar» (`etapasDePrimerContacto`, solo «Primer contacto») ni en «Pendiente agendar tarea».
-- Fija como las demás (sin renombrar, reordenar ni borrar). value = 'FIND_CONTACT'.
-- (Fue «Sin teléfono», escondida, unas horas el mismo día, sin llegar a aplicarse.)
do $$
declare
  v_pos integer;
  v_n integer;
begin
  if exists (select 1 from public.crm_funnel_stages where upper(value) = 'FIND_CONTACT' and deleted_at is null) then
    return;
  end if;

  select count(*), max(position) into v_n, v_pos
    from public.crm_funnel_stages
   where lower(label) = 'por contactar' and deleted_at is null;
  if v_n <> 1 then
    raise exception 'crm_etapa_buscar_contacto: se esperaba una sola etapa «Por contactar» viva y hay %', v_n;
  end if;

  update public.crm_funnel_stages
     set position = position + 1, updated_at = now()
   where position > v_pos;

  insert into public.crm_funnel_stages
    (label, value, position, is_out_of_funnel, allow_delete, allow_reorder, allow_rename,
     management_type, allows_tasks, show_in_dashboard)
  values
    ('Buscar contacto', 'FIND_CONTACT', v_pos + 1, false, false, false, false,
     null, true, false);
end $$;
