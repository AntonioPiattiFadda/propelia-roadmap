drop policy if exists crm_clients_escribir on public.crm_clients;
drop policy if exists crm_clients_insertar on public.crm_clients;
drop policy if exists crm_clients_editar on public.crm_clients;
drop policy if exists crm_clients_borrar on public.crm_clients;
create policy crm_clients_insertar on public.crm_clients for insert
  with check (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()));
create policy crm_clients_editar on public.crm_clients for update
  using (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()))
  with check (public.crm_puede_cliente(id, 'write') or public.crm_es_superadmin()
  or (public.es_usuario() and created_by = auth.uid()));
create policy crm_clients_borrar on public.crm_clients for delete
  using (public.crm_es_superadmin());;
