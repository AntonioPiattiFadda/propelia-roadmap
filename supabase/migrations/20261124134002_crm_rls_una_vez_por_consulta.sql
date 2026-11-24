-- La RLS de lectura del CRM se calcula una vez por consulta y no fila por fila (24/11/2026).
--
-- Por qué: la lista de leads tardaba 3,2 s de media en producción (hasta el corte de 8 s) y las
-- tareas pendientes 1,4 s, con apenas ~1.700 leads y ~4.000 comentarios. Cada fila pasaba por
-- `crm_puede()` / `crm_puede_lead()` / `crm_puede_cliente()`, que son `security definer`: Postgres
-- no las puede inlinear ni cachear, así que por CADA lead, comentario, tarea y cliente corría
-- `es_usuario()`, `crm_es_superadmin()` y una búsqueda en `crm_data_access` (y en `crm_leads`).
--
-- Ahora las políticas de SELECT llaman, envueltas en `(select …)`, a funciones que devuelven de una
-- vez qué carteras, qué leads y qué clientes ve quien consulta: Postgres las corre una sola vez
-- (initplan / subplan con hash) y cada fila es una comparación. Mismo patrón que
-- `mcp_carteras_visibles()` en las vistas del conector.
--
-- Las reglas NO cambian: se verificó contra la base (24/11/2026) que las expresiones nuevas dejan
-- ver exactamente las mismas filas de crm_leads, crm_comments, crm_tasks y crm_clients que las
-- viejas, para cada usuario. Las de ESCRIBIR siguen con las funciones de siempre, pero dejan de ser
-- `for all` y pasan a insert/update/delete: un `for all` también se evalúa en cada SELECT, y en las
-- filas que no se ven (las de otra cartera) corría la función cara de nuevo para nada. Escribir
-- implica leer, así que sacarlas del SELECT no cambia qué se ve.
--
-- Si cambia `crm_puede()`, cambian también estas tres funciones (y `mcp_carteras_visibles()`).

-- ---------- Lo que ve quien consulta, de una vez ----------

-- Las carteras (dueños) que puede leer: la propia y las de `crm_data_access`. El SUPERADMIN no
-- pasa por acá (ve todo, también los leads sin responsable): cada política lo pregunta aparte.
create or replace function public.crm_carteras_que_leo()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select case when not public.es_usuario() then '{}'::uuid[]
    else array(
      select auth.uid()
      union
      select a.subject_id from public.crm_data_access a
      where a.viewer_id = auth.uid() and a.access in ('read', 'write'))
  end;
$$;

-- Los leads que puede leer: lo mismo que `crm_puede_lead(id, 'read')` para cada uno (sin mirar
-- `deleted_at`, como aquella). Lo usan las tablas que cuelgan de un lead.
create or replace function public.crm_leads_que_leo()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select l.id from public.crm_leads l
  where (l.solo_para is null or l.solo_para = (select auth.uid()))
    and ((select public.crm_es_superadmin()) or l.assigned_to = any((select public.crm_carteras_que_leo())::uuid[]));
$$;

-- Los clientes que puede leer por sus leads activos: lo mismo que `crm_puede_cliente(id, 'read')`.
create or replace function public.crm_clientes_que_leo()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct l.client_id from public.crm_leads l
  where l.deleted_at is null
    and (l.solo_para is null or l.solo_para = (select auth.uid()))
    and ((select public.crm_es_superadmin()) or l.assigned_to = any((select public.crm_carteras_que_leo())::uuid[]));
$$;

revoke execute on function public.crm_carteras_que_leo() from public, anon;
revoke execute on function public.crm_leads_que_leo() from public, anon;
revoke execute on function public.crm_clientes_que_leo() from public, anon;
grant execute on function public.crm_carteras_que_leo() to authenticated;
grant execute on function public.crm_leads_que_leo() to authenticated;
grant execute on function public.crm_clientes_que_leo() to authenticated;

-- ---------- crm_leads ----------
drop policy if exists crm_leads_leer on public.crm_leads;
drop policy if exists crm_leads_escribir on public.crm_leads;
drop policy if exists crm_leads_insertar on public.crm_leads;
drop policy if exists crm_leads_editar on public.crm_leads;
drop policy if exists crm_leads_borrar on public.crm_leads;
create policy crm_leads_leer on public.crm_leads for select
  using ((select public.crm_es_superadmin()) or assigned_to = any((select public.crm_carteras_que_leo())::uuid[]));
-- El `with check` también pide write: reasignar exige write sobre la cartera vieja (using, fila de
-- antes) y sobre la nueva (with check, fila de después).
create policy crm_leads_insertar on public.crm_leads for insert
  with check (public.crm_puede(assigned_to, 'write'));
create policy crm_leads_editar on public.crm_leads for update
  using (public.crm_puede(assigned_to, 'write')) with check (public.crm_puede(assigned_to, 'write'));
create policy crm_leads_borrar on public.crm_leads for delete
  using (public.crm_puede(assigned_to, 'write'));
-- `crm_leads_solo_para` (restrictiva) no se toca.

-- ---------- crm_comments ----------
drop policy if exists crm_comments_leer on public.crm_comments;
drop policy if exists crm_comments_escribir on public.crm_comments;
drop policy if exists crm_comments_insertar on public.crm_comments;
drop policy if exists crm_comments_editar on public.crm_comments;
drop policy if exists crm_comments_borrar on public.crm_comments;
create policy crm_comments_leer on public.crm_comments for select
  using (lead_id in (select public.crm_leads_que_leo()));
create policy crm_comments_insertar on public.crm_comments for insert
  with check (public.crm_puede_lead(lead_id, 'write'));
create policy crm_comments_editar on public.crm_comments for update
  using (public.crm_puede_lead(lead_id, 'write')) with check (public.crm_puede_lead(lead_id, 'write'));
create policy crm_comments_borrar on public.crm_comments for delete
  using (public.crm_puede_lead(lead_id, 'write'));

-- ---------- crm_tasks ----------
-- Con lead, por el lead; sin lead, por su responsable.
drop policy if exists crm_tasks_leer on public.crm_tasks;
drop policy if exists crm_tasks_escribir on public.crm_tasks;
drop policy if exists crm_tasks_insertar on public.crm_tasks;
drop policy if exists crm_tasks_editar on public.crm_tasks;
drop policy if exists crm_tasks_borrar on public.crm_tasks;
create policy crm_tasks_leer on public.crm_tasks for select using (
  case when lead_id is not null then lead_id in (select public.crm_leads_que_leo())
       else (select public.crm_es_superadmin()) or assigned_to = any((select public.crm_carteras_que_leo())::uuid[]) end);
create policy crm_tasks_insertar on public.crm_tasks for insert with check (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);
create policy crm_tasks_editar on public.crm_tasks for update using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end)
  with check (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);
create policy crm_tasks_borrar on public.crm_tasks for delete using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);

-- ---------- crm_clients ----------
-- Solo la de leer: las de escribir ya estaban partidas (ver schema.sql).
drop policy if exists crm_clients_leer on public.crm_clients;
create policy crm_clients_leer on public.crm_clients for select using (
  (select public.crm_es_superadmin())
  or id in (select public.crm_clientes_que_leo())
  or ((select public.es_usuario()) and created_by = (select auth.uid())));
