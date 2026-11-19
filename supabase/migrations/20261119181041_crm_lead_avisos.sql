-- Avisos en el lead para la SDR (19/11/2026, por pedido): «te olvidaste de cargar el decisor»,
-- «faltó registrar la llamada del martes». Se dejan desde el conector MCP (Claude / ChatGPT) y la
-- SDR los ve en el lead, en la campana y en un toast, hasta que los marca «Listo».
--
-- El conector deja de ser sólo de lectura, con el patrón de propelia-frontend
-- (20261101191634_mcp_lead_writes): las escrituras son RPC `security definer` en una lista
-- aparte, mcp_oauth_write_rpcs(), y son lo ÚNICO que el token del conector puede llamar por POST
-- (en GET PostgREST abre una transacción de sólo lectura). La RLS restrictiva de todas las tablas
-- no cambia: la RPC hace ella misma los chequeos que haría la RLS:
--   · quien escribe es usuario activo y puede ESCRIBIR la cartera del lead (crm_puede_lead write,
--     que también corta los leads de prueba de otro);
--   · el destinatario (por defecto el responsable del lead) está activo y ve esa cartera;
--   · cupo: 30 avisos por hora por persona desde el conector.
-- Listas duplicadas en supabase/functions/_shared/mcp/relations.ts (MCP_RELATIONS y
-- MCP_WRITE_RPCS).

-- ─── la tabla ──────────────────────────────────────────────────────────────
create table if not exists public.crm_lead_avisos (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.crm_leads(id) on delete cascade,
  texto        text not null check (length(trim(texto)) between 1 and 1000),
  -- A quién le suena. Siempre una persona: la RPC pone el responsable del lead si no se elige.
  para         uuid not null references public.users(id),
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now(),
  -- Por dónde entró: mcp = el conector. Null = la app (hoy no hay pantalla que los cree).
  source       text null check (source in ('mcp')),
  resuelto_at  timestamptz null,
  resuelto_por uuid null references public.users(id)
);

comment on table public.crm_lead_avisos is
  'Avisos en un lead para la SDR («te olvidaste de…»). Los crea el conector MCP (mcp_crm_avisar_lead); se marcan «Listo» desde el lead.';

create index if not exists crm_lead_avisos_lead_idx on public.crm_lead_avisos (lead_id);
create index if not exists crm_lead_avisos_pendientes_idx on public.crm_lead_avisos (para) where resuelto_at is null;

alter table public.crm_lead_avisos enable row level security;

-- Los ve quien ve el lead. Se marcan «Listo» (y se deshace) por quien escribe el lead o por su
-- destinatario. No hay insert ni delete desde la app: crea la RPC del conector.
drop policy if exists crm_lead_avisos_select on public.crm_lead_avisos;
create policy crm_lead_avisos_select on public.crm_lead_avisos for select to authenticated
  using (public.crm_puede_lead(lead_id, 'read'));

drop policy if exists crm_lead_avisos_update on public.crm_lead_avisos;
create policy crm_lead_avisos_update on public.crm_lead_avisos for update to authenticated
  using (public.crm_puede_lead(lead_id, 'write')
         or (para = (select auth.uid()) and public.crm_puede_lead(lead_id, 'read')))
  with check (public.crm_puede_lead(lead_id, 'write')
              or (para = (select auth.uid()) and public.crm_puede_lead(lead_id, 'read')));

revoke all on public.crm_lead_avisos from public, anon, authenticated;
grant select on public.crm_lead_avisos to authenticated;
-- Sólo el «Listo»: el texto, el destinatario y el autor no se tocan desde la app.
grant update (resuelto_at, resuelto_por) on public.crm_lead_avisos to authenticated;

-- Quién lo marcó lo pone la base, no el front.
create or replace function public.crm_lead_avisos_resuelto()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.resuelto_at is null then
    new.resuelto_por := null;
  elsif old.resuelto_at is null then
    new.resuelto_por := auth.uid();
  else
    new.resuelto_at := old.resuelto_at;
    new.resuelto_por := old.resuelto_por;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_lead_avisos_resuelto on public.crm_lead_avisos;
create trigger crm_lead_avisos_resuelto before update on public.crm_lead_avisos
  for each row execute function public.crm_lead_avisos_resuelto();

-- Realtime: el aviso le aparece a la SDR sin recargar.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_lead_avisos') then
    alter publication supabase_realtime add table public.crm_lead_avisos;
  end if;
end $$;

-- ─── dejar un aviso (la RPC del conector) ──────────────────────────────────
-- Devuelve { status, ... }:
--   ok                 { aviso_id, para }
--   invalid            { error } (texto vacío o de más de 1000 caracteres)
--   not_found          el lead no existe, está borrado o no se ve
--   forbidden          se ve pero no se puede escribir su cartera
--   forbidden_para     el destinatario no está activo o no ve la cartera del lead
--   rate_limited / no_access
create or replace function public.mcp_crm_avisar_lead(
  p_lead_id uuid,
  p_texto   text,
  p_para    uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_me    uuid := auth.uid();
  v_texto text := trim(coalesce(p_texto, ''));
  v_lead  public.crm_leads;
  v_para  uuid;
  v_id    uuid;
begin
  if v_me is null or not public.es_usuario() then
    return jsonb_build_object('status', 'no_access');
  end if;
  if length(v_texto) = 0 or length(v_texto) > 1000 then
    return jsonb_build_object('status', 'invalid', 'error', 'El aviso tiene que tener entre 1 y 1000 caracteres.');
  end if;

  select * into v_lead from public.crm_leads where id = p_lead_id and deleted_at is null;
  if v_lead.id is null or not public.crm_puede_lead(p_lead_id, 'read') then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.crm_puede_lead(p_lead_id, 'write') then
    return jsonb_build_object('status', 'forbidden');
  end if;

  v_para := coalesce(p_para, v_lead.assigned_to);
  if v_para is null or not exists (
    select 1 from public.users u
     where u.id = v_para and u.activo
       and (v_lead.solo_para is null or v_lead.solo_para = v_para)
       and (u.id = v_lead.assigned_to
            or u.rol = 'SUPERADMIN'
            or exists (select 1 from public.crm_data_access a
                        where a.viewer_id = u.id and a.subject_id = v_lead.assigned_to))
  ) then
    return jsonb_build_object('status', 'forbidden_para');
  end if;

  if (select count(*) from public.crm_lead_avisos a
       where a.created_by = v_me and a.source = 'mcp'
         and a.created_at > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.crm_lead_avisos (lead_id, texto, para, created_by, source)
  values (p_lead_id, v_texto, v_para, v_me, 'mcp')
  returning id into v_id;

  return jsonb_build_object('status', 'ok', 'aviso_id', v_id, 'para', v_para);
end;
$$;

revoke all on function public.mcp_crm_avisar_lead(uuid, text, uuid) from public, anon;
grant execute on function public.mcp_crm_avisar_lead(uuid, text, uuid) to authenticated;

-- ─── leerlos por el conector ───────────────────────────────────────────────
-- El mismo corte que las otras vistas del CRM (mcp_crm_emails, mcp_crm_demo_notas).
create or replace view public.mcp_crm_lead_avisos
with (security_barrier = true)
as
select a.id, a.lead_id, a.texto, a.para, a.created_by, a.created_at, a.source,
       a.resuelto_at, a.resuelto_por
from public.crm_lead_avisos a
join public.crm_leads l on l.id = a.lead_id
where (select public.es_usuario())
  and l.deleted_at is null
  and (l.solo_para is null or l.solo_para = (select auth.uid()))
  and ((select public.crm_es_superadmin()) or l.assigned_to in (select public.mcp_carteras_visibles()));

revoke all on public.mcp_crm_lead_avisos from public, anon, authenticated;
grant select on public.mcp_crm_lead_avisos to authenticated;

-- ─── listas blancas ────────────────────────────────────────────────────────
-- Misma lista que MCP_RELATIONS en supabase/functions/_shared/mcp/relations.ts.
create or replace function public.mcp_oauth_relations()
returns text[]
language sql
immutable
as $$
  select array[
    'mcp_team', 'mcp_roadmap_tareas', 'mcp_roadmap_grupos', 'mcp_crm_stages', 'mcp_crm_leads',
    'mcp_crm_tasks', 'mcp_crm_meetings', 'mcp_crm_comments', 'mcp_crm_stage_history',
    'mcp_onboardings', 'mcp_expenses', 'mcp_crm_assignment_history', 'mcp_crm_emails',
    'mcp_crm_demo_notas', 'mcp_crm_meta_sdr', 'mcp_crm_lead_avisos'
  ]::text[];
$$;

-- Misma lista que MCP_WRITE_RPCS en supabase/functions/_shared/mcp/relations.ts.
create or replace function public.mcp_oauth_write_rpcs()
returns text[]
language sql
immutable
as $$
  select array['mcp_crm_avisar_lead']::text[];
$$;

-- ─── el guard de PostgREST suma el POST a las RPC de escritura ─────────────
create or replace function public.oauth_client_request_guard()
returns void
language plpgsql
stable
as $$
declare
  v_claims jsonb;
  v_method text;
  v_path   text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return;
  end;

  if v_claims is null or v_claims ->> 'client_id' is null then
    return;
  end if;

  v_method := coalesce(current_setting('request.method', true), '');
  v_path   := ltrim(coalesce(current_setting('request.path', true), ''), '/');

  if v_method in ('GET', 'HEAD') and (
       v_path = any (public.mcp_oauth_relations())
       or (v_path like 'rpc/%' and substr(v_path, 5) = any (public.mcp_oauth_rpcs()))
     ) then
    return;
  end if;

  if v_method = 'POST' and v_path like 'rpc/%' and substr(v_path, 5) = any (public.mcp_oauth_write_rpcs()) then
    return;
  end if;

  raise exception 'Los conectores (OAuth) sólo acceden a los datos y acciones del conector'
    using errcode = '42501';
end;
$$;

-- La tabla nueva también le queda cerrada al token del conector (RLS restrictiva).
select public.oauth_guard_apply();

notify pgrst, 'reload schema';
