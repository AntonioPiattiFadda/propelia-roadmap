-- «Minutos sin llamar» de cada SDR (19/11/2026, por pedido). Un cron diario (19:05, lunes a
-- viernes) los calcula desde Aircall y los guarda por el conector MCP con save_call_gaps; los
-- Objetivos del conector (get_crm_goals) los suman y get_call_gaps da el detalle de un día.
--
-- El cálculo vive en el cron, no acá: horario 10–14 y 15–19 de Madrid, bache = 15 min o más sin
-- llamar entre llamadas (o del arranque del tramo a la primera, o de la última al cierre), cada
-- bache redondeado a minutos y después sumados. Acá sólo se guarda el resultado del día.
--
-- Se escribe SOLO por la RPC `mcp_crm_save_call_gaps` (security definer, sólo SUPERADMIN), que se
-- suma a la lista de escrituras del conector de 20261119181041_crm_lead_avisos (va DESPUÉS de esa:
-- redefine mcp_oauth_write_rpcs() y mcp_oauth_relations() con lo de las dos).
--
-- El mapeo de Aircall a las cuentas del equipo vive en `users.aircall_ids` y no en el código del
-- cron: un usuario de Aircall puede figurar por id o por nombre (el «Lorenzo Fadda» de Aircall es
-- Adriana). Sale por list_team.

-- ─── el mapeo de Aircall ───────────────────────────────────────────────────
alter table public.users add column if not exists aircall_ids text[] not null default '{}';

comment on column public.users.aircall_ids is
  'Cómo figura esta persona en Aircall: ids de usuario y/o nombres. Lo lee el cron de minutos sin llamar (list_team del conector).';

update public.users set aircall_ids = array['2100218']
 where id = '5bdd5f4b-b818-427e-a282-eaf65d2ab0fc';                       -- Lusmary
update public.users set aircall_ids = array['2062197', 'Lorenzo Fadda']
 where id = '52431b0b-da73-4fcf-bdd2-2678feb4d3ff';                       -- Adriana

-- ─── la tabla ──────────────────────────────────────────────────────────────
create table if not exists public.crm_call_gaps (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null,                                  -- día en hora de España
  persona_id     uuid not null references public.users(id),
  min_sin_llamar integer not null check (min_sin_llamar >= 0),
  baches         integer not null check (baches >= 0),
  -- [{inicio, fin, min}] de cada bache, como lo manda el cron. Opcional.
  detalle        jsonb null check (detalle is null or jsonb_typeof(detalle) = 'array'),
  updated_by     uuid null references public.users(id),
  updated_at     timestamptz not null default now(),
  unique (fecha, persona_id)
);

comment on table public.crm_call_gaps is
  'Minutos sin llamar y baches de cada SDR por día (hora de España). Los guarda el cron de Aircall por el conector MCP (mcp_crm_save_call_gaps).';

create index if not exists crm_call_gaps_persona_fecha_idx on public.crm_call_gaps (persona_id, fecha);

alter table public.crm_call_gaps enable row level security;

-- Como los Objetivos: los números de alguien los ve quien ve su cartera (y él mismo). No hay
-- escritura desde la app: guarda la RPC del conector.
drop policy if exists crm_call_gaps_select on public.crm_call_gaps;
create policy crm_call_gaps_select on public.crm_call_gaps for select to authenticated
  using (public.crm_puede(persona_id, 'read'));

revoke all on public.crm_call_gaps from public, anon, authenticated;
grant select on public.crm_call_gaps to authenticated;

-- ─── guardar un día (la RPC del conector) ──────────────────────────────────
-- p_filas: [{persona_id, min_sin_llamar, baches, detalle?}], de 1 a 10. Upsert por (fecha, persona):
-- guardar dos veces el mismo día deja una fila con lo último. Todo o nada.
-- Devuelve { status, ... }:
--   ok         { filas: [{persona_id, fecha, min_sin_llamar, baches, detalle, updated_at}] }
--   invalid    { error }
--   forbidden  quien llama no es SUPERADMIN
--   no_access  sin fila activa en users
create or replace function public.mcp_crm_save_call_gaps(
  p_fecha date,
  p_filas jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := auth.uid();
  v_fila jsonb;
  v_pid  uuid;
  v_ids  uuid[] := '{}';
begin
  if v_me is null or not public.es_usuario() then
    return jsonb_build_object('status', 'no_access');
  end if;
  if not public.crm_es_superadmin() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if p_fecha is null or p_fecha > (now() at time zone 'Europe/Madrid')::date then
    return jsonb_build_object('status', 'invalid', 'error', 'La fecha falta o es futura.');
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array'
     or jsonb_array_length(p_filas) = 0 or jsonb_array_length(p_filas) > 10 then
    return jsonb_build_object('status', 'invalid', 'error', 'Mandá entre 1 y 10 filas.');
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    begin
      v_pid := (v_fila ->> 'persona_id')::uuid;
    exception when others then
      return jsonb_build_object('status', 'invalid', 'error', 'persona_id no es un id.');
    end;
    if v_pid is null or not exists (select 1 from public.users u where u.id = v_pid) then
      return jsonb_build_object('status', 'invalid', 'error', format('No hay nadie del equipo con el id %s.', v_fila ->> 'persona_id'));
    end if;
    if v_pid = any (v_ids) then
      return jsonb_build_object('status', 'invalid', 'error', 'Una persona está dos veces.');
    end if;
    v_ids := v_ids || v_pid;
    -- En dos pasos: el `or` de Postgres no corta, y castear un texto a numeric tiraría error.
    if jsonb_typeof(v_fila -> 'min_sin_llamar') is distinct from 'number'
       or jsonb_typeof(v_fila -> 'baches') is distinct from 'number' then
      return jsonb_build_object('status', 'invalid', 'error', 'min_sin_llamar y baches son enteros de 0 a 1440.');
    end if;
    if (v_fila ->> 'min_sin_llamar')::numeric < 0 or (v_fila ->> 'baches')::numeric < 0
       or (v_fila ->> 'min_sin_llamar')::numeric <> trunc((v_fila ->> 'min_sin_llamar')::numeric)
       or (v_fila ->> 'baches')::numeric <> trunc((v_fila ->> 'baches')::numeric)
       or (v_fila ->> 'min_sin_llamar')::numeric > 1440 or (v_fila ->> 'baches')::numeric > 1440 then
      return jsonb_build_object('status', 'invalid', 'error', 'min_sin_llamar y baches son enteros de 0 a 1440.');
    end if;
    if v_fila ? 'detalle' and jsonb_typeof(v_fila -> 'detalle') not in ('array', 'null') then
      return jsonb_build_object('status', 'invalid', 'error', 'detalle tiene que ser una lista.');
    end if;
    if jsonb_typeof(v_fila -> 'detalle') = 'array' and jsonb_array_length(v_fila -> 'detalle') > 100 then
      return jsonb_build_object('status', 'invalid', 'error', 'detalle tiene como mucho 100 baches.');
    end if;
  end loop;

  insert into public.crm_call_gaps as g (fecha, persona_id, min_sin_llamar, baches, detalle, updated_by, updated_at)
  select p_fecha,
         (f ->> 'persona_id')::uuid,
         (f ->> 'min_sin_llamar')::int,
         (f ->> 'baches')::int,
         case when jsonb_typeof(f -> 'detalle') = 'array' then f -> 'detalle' end,
         v_me,
         now()
    from jsonb_array_elements(p_filas) f
  on conflict (fecha, persona_id) do update
     set min_sin_llamar = excluded.min_sin_llamar,
         baches         = excluded.baches,
         detalle        = excluded.detalle,
         updated_by     = excluded.updated_by,
         updated_at     = now();

  return jsonb_build_object('status', 'ok', 'filas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona_id', g.persona_id, 'fecha', g.fecha, 'min_sin_llamar', g.min_sin_llamar,
             'baches', g.baches, 'detalle', g.detalle, 'updated_at', g.updated_at) order by g.persona_id), '[]'::jsonb)
      from public.crm_call_gaps g
     where g.fecha = p_fecha and g.persona_id = any (v_ids)));
end;
$$;

revoke all on function public.mcp_crm_save_call_gaps(date, jsonb) from public, anon;
grant execute on function public.mcp_crm_save_call_gaps(date, jsonb) to authenticated;

-- ─── leerlos por el conector ───────────────────────────────────────────────
-- El mismo corte que las demás vistas del CRM: lo propio y las carteras que se ven.
create or replace view public.mcp_crm_call_gaps
with (security_barrier = true)
as
select g.fecha, g.persona_id, g.min_sin_llamar, g.baches, g.detalle, g.updated_at
from public.crm_call_gaps g
where (select public.es_usuario())
  and ((select public.crm_es_superadmin()) or g.persona_id in (select public.mcp_carteras_visibles()));

revoke all on public.mcp_crm_call_gaps from public, anon, authenticated;
grant select on public.mcp_crm_call_gaps to authenticated;

-- mcp_team suma el mapeo de Aircall (al final: `create or replace view` sólo deja agregar columnas
-- al final).
create or replace view public.mcp_team
with (security_barrier = true)
as
select u.id, u.nombre, u.last_name, (u.rol)::text as rol, u.activo, u.aircall_ids
from public.users u
where (select public.es_usuario());

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
    'mcp_crm_demo_notas', 'mcp_crm_meta_sdr', 'mcp_crm_lead_avisos', 'mcp_crm_call_gaps'
  ]::text[];
$$;

-- Misma lista que MCP_WRITE_RPCS en supabase/functions/_shared/mcp/relations.ts.
create or replace function public.mcp_oauth_write_rpcs()
returns text[]
language sql
immutable
as $$
  select array['mcp_crm_avisar_lead', 'mcp_crm_save_call_gaps']::text[];
$$;

-- La tabla nueva también le queda cerrada al token del conector (RLS restrictiva). Es la policy de
-- oauth_guard_apply(), pero SOLO en esta tabla: llamar a oauth_guard_apply() rehace la de todas, y
-- con `users` ya bloqueada por el `alter table` de arriba chocaba (deadlock, dos veces el
-- 19/11/2026) con el tráfico en vivo sobre crm_emails, cuya RLS lee `users`.
-- `select public.oauth_guard_missing_tables();` tiene que seguir dando vacío.
drop policy if exists oauth_clients_no_access on public.crm_call_gaps;
create policy oauth_clients_no_access on public.crm_call_gaps as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

notify pgrst, 'reload schema';
