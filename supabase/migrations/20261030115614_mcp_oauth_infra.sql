-- Infra del servidor MCP (conector de Claude / ChatGPT): blindaje del token OAuth, `mcp_whoami`
-- y la auditoría. Copiado de propelia-frontend (migraciones 20261016202957_mcp_oauth_token_guard
-- y 20261016210342_mcp_audit_log), sin organizaciones: acá el acceso es `es_usuario()`.
-- Detalle en docs/mcp/README.md.
--
-- El access token que Supabase Auth le da al conector es un JWT de sesión normal (role
-- authenticated) con un claim extra, `client_id`. Sin esto sirve contra TODA la API con los
-- permisos del usuario: leer la caja, los leads, escribir, llamar cualquier RPC.
--
-- Con esta migración un token con `client_id` sólo puede:
--   · GET/HEAD sobre las vistas de `mcp_oauth_relations()` (hoy ninguna: las tools vienen
--     después), y
--   · GET a las RPC de `mcp_oauth_rpcs()` (hoy `mcp_whoami`).
--
-- Tres capas:
--   1. PostgREST (db_pre_request): cualquier otro método, tabla o RPC → 403 antes de tocar datos.
--   2. RLS RESTRICTIVA en todas las tablas de public: el token del conector no ve ni escribe
--      ninguna fila. Cubre lo que el path no ve: embeds desde una vista y realtime.
--   3. Storage: nada.
-- Las sesiones normales (sin `client_id`) no cambian: todas las condiciones nuevas son
-- "`client_id` IS NULL → pasa".
--
-- La lista blanca está duplicada a propósito en supabase/functions/_shared/mcp/relations.ts.
--
-- TABLA NUEVA en public: no queda cubierta por la capa 2 hasta correr de nuevo
-- `select public.oauth_guard_apply();` en su migración (la capa 1 sí la cubre desde el vamos).
-- `select public.oauth_guard_missing_tables();` tiene que dar vacío.
--
-- VISTA NUEVA para el MCP: crearla con `security_barrier`, cortar a quien no es usuario activo
-- (`es_usuario()`), revocarla de anon, y sumarla en `mcp_oauth_relations()` (redefinida
-- completa) y en MCP_RELATIONS.

-- ─── quién soy (el MCP lo usa en vez de leer `users`, que queda cerrada) ───
create or replace function public.mcp_whoami()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'activo', u.activo,
    'nombre', u.nombre,
    'rol', u.rol
  )
  from public.users u
  where u.id = auth.uid();
$$;

revoke all on function public.mcp_whoami() from public, anon;
grant execute on function public.mcp_whoami() to authenticated;

-- ─── lista blanca ──────────────────────────────────────────────────────────
create or replace function public.mcp_oauth_relations()
returns text[]
language sql
immutable
as $$
  select '{}'::text[];
$$;

create or replace function public.mcp_oauth_rpcs()
returns text[]
language sql
immutable
as $$
  select array['mcp_whoami']::text[];
$$;

-- ─── 1. PostgREST: guard antes de cada request ─────────────────────────────
-- Corre en TODOS los requests de la API: tiene que ser barato y no fallar nunca para uno
-- normal. Si los claims no se pueden leer, deja pasar (la capa 2 sigue cerrando al conector).
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

  raise exception 'Los conectores (OAuth) son de sólo lectura y sólo acceden a los datos del conector'
    using errcode = '42501';
end;
$$;

alter role authenticator set pgrst.db_pre_request to 'public.oauth_client_request_guard';
notify pgrst, 'reload config';

-- ─── 2. RLS restrictiva en todas las tablas de public ──────────────────────
-- En las políticas va `(select auth.jwt() ->> 'client_id') is null` y no una función: así
-- Postgres lo evalúa una vez por consulta (initplan), no una vez por fila.
create or replace function public.oauth_guard_apply()
returns void
language plpgsql
as $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists oauth_clients_no_access on public.%I', t.relname);
    execute format(
      'create policy oauth_clients_no_access on public.%I as restrictive for all to authenticated
         using ((select auth.jwt() ->> ''client_id'') is null)
         with check ((select auth.jwt() ->> ''client_id'') is null)', t.relname);
  end loop;
end;
$$;

revoke all on function public.oauth_guard_apply() from public, anon, authenticated;

-- Tablas de public que el conector podría leer: sin RLS, o sin la política restrictiva (una
-- tabla creada después de la última corrida de oauth_guard_apply()). Tiene que dar vacío.
create or replace function public.oauth_guard_missing_tables()
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and (not c.relrowsecurity
         or not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = c.relname
                          and p.policyname = 'oauth_clients_no_access'
                          and p.permissive = 'RESTRICTIVE'));
$$;

revoke all on function public.oauth_guard_missing_tables() from public, anon, authenticated;
grant execute on function public.oauth_guard_missing_tables() to service_role;

-- ─── 3. Storage ────────────────────────────────────────────────────────────
drop policy if exists oauth_clients_no_storage on storage.objects;
create policy oauth_clients_no_storage on storage.objects
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

-- ─── auditoría ─────────────────────────────────────────────────────────────
-- Una fila por cada llamada a una tool: quién, desde qué cliente OAuth, qué tool, con qué
-- argumentos (cortos), cuántas filas devolvió, si falló y si el sanitizador tuvo que sacar
-- alguna clave sensible (eso es un bug de la tool: revisar). La escribe SÓLO la función `mcp`
-- con la service role (no hay policy de insert). La lee un SUPERADMIN.
create table if not exists public.mcp_audit_log (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),
  user_id          uuid,
  oauth_client_id  text,
  tool             text not null,
  args             jsonb,
  result_count     integer,
  ok               boolean not null,
  error            text,
  removed_keys     text[],
  cost_usd         numeric,
  cost_detail      jsonb
);

create index if not exists mcp_audit_log_created_idx on public.mcp_audit_log (created_at desc);

alter table public.mcp_audit_log enable row level security;

drop policy if exists mcp_audit_log_select on public.mcp_audit_log;
create policy mcp_audit_log_select on public.mcp_audit_log
  for select to authenticated
  using (public.crm_es_superadmin());

revoke all on public.mcp_audit_log from anon;
revoke insert, update, delete, truncate on public.mcp_audit_log from authenticated;
grant select on public.mcp_audit_log to authenticated;

-- Al final, con la tabla de auditoría ya creada: que el bloqueo cubra todas.
select public.oauth_guard_apply();
