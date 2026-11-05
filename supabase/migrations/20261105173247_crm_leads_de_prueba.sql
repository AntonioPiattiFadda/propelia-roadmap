-- Leads de prueba que ve una sola persona (5/11/2026, por pedido).
--
-- `crm_leads.solo_para`: si tiene a alguien, el lead (y todo lo que cuelga de él: tareas,
-- reuniones, comentarios, el alta de /clientes por su join `!inner`) lo ve y lo toca solo esa
-- persona, aunque los demás sean SUPERADMIN. Null = como siempre. Sirve para los leads de
-- desarrollo, que si no le aparecen al equipo en /clientes, el CRM, la Agenda y las Demos.
--
-- Se corta en tres lugares, y en los tres por la misma regla:
--   * una policy restrictiva sobre crm_leads (se suma con AND a crm_leads_leer/escribir);
--   * crm_puede_lead(), que usan las policies de tareas, reuniones, comentarios, emails…;
--   * crm_puede_cliente(), para que la inmobiliaria del lead tampoco se vea suelta.
-- Las vistas `mcp_*` y lo que corre con la service role (edge functions, triggers definer) no
-- miran esto: el conector MCP de un SUPERADMIN sigue trayéndolos.

alter table public.crm_leads
  add column if not exists solo_para uuid references public.users(id) on delete set null;
comment on column public.crm_leads.solo_para is
  'Lead de prueba: si no es null, lo ve y lo edita solo esa persona (RLS). Null = visibilidad normal.';

drop policy if exists crm_leads_solo_para on public.crm_leads;
create policy crm_leads_solo_para on public.crm_leads
  as restrictive for all to authenticated
  using (solo_para is null or solo_para = auth.uid())
  with check (solo_para is null or solo_para = auth.uid());

create or replace function public.crm_puede_lead(p_lead_id uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select public.crm_puede(l.assigned_to, p_nivel)
            and (l.solo_para is null or l.solo_para = auth.uid())
       from public.crm_leads l where l.id = p_lead_id),
    false);
$$;

create or replace function public.crm_puede_cliente(p_client_id uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.crm_leads l
    where l.client_id = p_client_id and l.deleted_at is null
      and (l.solo_para is null or l.solo_para = auth.uid())
      and public.crm_puede(l.assigned_to, p_nivel));
$$;

-- Los dos leads de prueba del onboarding, para Antonio. Si no aparecen los dos, no se aplica
-- nada: mejor fallar que dejar uno a la vista de todos.
do $$
declare
  v_antonio uuid;
  v_n int;
  v_hay text;
begin
  -- Sin RLS: el rol del CLI no es un usuario de la app y la policy de escritura le filtraría todo.
  -- Si el rol no puede saltear la RLS, esto falla con un error claro en vez de contar 0.
  perform set_config('row_security', 'off', true);
  select id into v_antonio from public.users where email = 'antonio.piattifadda@gmail.com';
  if v_antonio is null then
    raise exception 'crm_leads_de_prueba: no existe el usuario antonio.piattifadda@gmail.com';
  end if;
  -- El nombre que muestra /clientes es el que escribió el cliente en el alta pública
  -- (client_onboardings.company_name) y, si no, el del CRM: se busca en los dos.
  -- Borrados incluidos: el 5/11/2026 los dos ya estaban eliminados desde el CRM y la migración
  -- fallaba contando 0. Marcados igual, si alguien los restaura siguen siendo solo para Antonio.
  update public.crm_leads l set solo_para = v_antonio
   where (exists (select 1 from public.crm_clients c
                   where c.id = l.client_id
                     and lower(trim(c.company_name)) in ('test lead pre onboardding', 'inmobiliaria test onboarding'))
          or exists (select 1 from public.client_onboardings o
                      where o.lead_id = l.id
                        and lower(trim(o.company_name)) in ('test lead pre onboardding', 'inmobiliaria test onboarding')));
  get diagnostics v_n = row_count;
  -- Al menos 2: además de los dos del onboarding hay copias viejas con el mismo nombre (de
  -- octubre, también borradas), y marcarlas también está bien: son de prueba.
  if v_n < 2 then
    select string_agg(format('%s | crm=%L | alta=%L | %s %s', l.id, c.company_name, o.company_name,
                             c.first_name, c.last_name), E'\n')
      into v_hay
      from public.crm_leads l
      join public.crm_clients c on c.id = l.client_id
      left join public.client_onboardings o on o.lead_id = l.id
     where l.deleted_at is null
       and (c.company_name ilike '%test%' or o.company_name ilike '%test%');
    raise exception E'crm_leads_de_prueba: se esperaban al menos 2 leads de prueba y hay %. Con «test» en el nombre:\n%',
      v_n, coalesce(v_hay, '(ninguno)');
  end if;

  -- Los dos del onboarding (los que tienen alta) se restauran, como el «Deshacer» de eliminar:
  -- el lead y las tareas pendientes que se borraron con él (mismo minuto). Así a Antonio le
  -- vuelven a aparecer en /clientes y el CRM, y al resto no. Las copias viejas siguen borradas.
  update public.crm_tasks t set deleted_at = null
    from public.crm_leads l
   where t.lead_id = l.id and l.solo_para = v_antonio and l.deleted_at is not null
     and exists (select 1 from public.client_onboardings o where o.lead_id = l.id)
     and not t.completed and t.deleted_at is not null
     and t.deleted_at between l.deleted_at - interval '1 minute' and l.deleted_at + interval '1 minute';
  update public.crm_leads l set deleted_at = null
   where l.solo_para = v_antonio and l.deleted_at is not null
     and exists (select 1 from public.client_onboardings o where o.lead_id = l.id);
end $$;
