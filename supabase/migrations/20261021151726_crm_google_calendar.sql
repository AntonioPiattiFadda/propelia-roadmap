-- Google Calendar (21/10/2026), copiado de `propelia-frontend`: cada miembro conecta su cuenta
-- desde Ajustes, la página Agenda muestra su semana de Google junto con sus reuniones del CRM, y
-- cada reunión (las demos incluidas) se crea, se mueve y se cancela sola en el Google de su
-- responsable. Lo que se mueve en Google vuelve por el webhook. El código vive en las edge
-- functions `calendar-oauth-start`, `calendar-oauth-callback`, `calendar-sync` y `calendar-webhook`.
--
-- Secrets que tienen que estar antes de usarlo: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
-- TOKEN_ENCRYPTION_KEY (32 bytes en base64), GOOGLE_CALENDAR_ALLOWED_REDIRECT_ORIGINS (CSV) y
-- APP_BASE_URL (el dominio de esta app, para el link al lead del evento).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- La conexión de cada uno ----------
-- Una fila por persona y proveedor (hoy solo Google). Los tokens van cifrados (AES-GCM con
-- TOKEN_ENCRYPTION_KEY) y no los lee nadie más que la service role: el front ve solo las columnas
-- de abajo y solo su fila. Sin `organization_id` (el producto lo tiene): acá no hay organizaciones.
create table if not exists public.calendar_connections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id),
  provider          text not null check (provider = 'google'),
  refresh_token     text not null,
  access_token      text,
  token_expires_at  timestamptz,
  connected_email   text,
  calendar_id       text not null default 'primary',
  watch_channel_id  text,
  watch_resource_id text,
  watch_expires_at  timestamptz,
  watch_token       text,
  sync_token        text,
  status            text not null default 'active' check (status in ('active', 'revoked', 'error')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint calendar_connections_user_provider_unique unique (user_id, provider)
);

alter table public.calendar_connections enable row level security;

drop policy if exists calendar_connections_leer on public.calendar_connections;
create policy calendar_connections_leer on public.calendar_connections for select
  using (user_id = (select auth.uid()));
-- Desconectar es borrar la fila propia. Escribirla (alta, tokens, watch) es solo de la service role.
drop policy if exists calendar_connections_borrar on public.calendar_connections;
create policy calendar_connections_borrar on public.calendar_connections for delete
  using (user_id = (select auth.uid()));

-- Grants por columna, como en el producto: aunque la RLS deje leer la fila, los tokens no salen.
revoke all on table public.calendar_connections from anon, authenticated;
grant select (id, user_id, provider, connected_email, calendar_id, status, created_at, updated_at)
  on table public.calendar_connections to authenticated;
grant delete on table public.calendar_connections to authenticated;
grant all on table public.calendar_connections to service_role;

-- ---------- El `state` de OAuth, de un solo uso ----------
-- El callback inserta el nonce del `state`: si ya estaba, es un replay. `calendar-sync` purga los
-- de más de una hora en cada barrido. Solo la service role.
create table if not exists public.oauth_state_nonces (
  nonce   text primary key,
  used_at timestamptz not null default now()
);

alter table public.oauth_state_nonces enable row level security;
revoke all on table public.oauth_state_nonces from anon, authenticated;
grant all on table public.oauth_state_nonces to service_role;

-- ---------- Las reuniones que van a Google ----------
-- Las columnas de sync de `visits` del producto, con el mismo significado:
--   sync_status: pending (hay algo para empujar), synced, error (reintenta hasta 5 veces),
--                disabled (su responsable no tiene Google conectado).
--   ics_sequence: el guard optimista contra el webhook (el nombre viene del .ics del producto).
--   color_id / reminder_minutes: el color y el aviso del evento en Google.
--   guest_user_ids / guest_emails: los invitados (compañeros por id, el resto por email); Google
--                les manda la invitación.
-- `sync_status` nace en 'disabled' para las que ya existen (nadie tenía Google conectado: se
-- ofrecen desde Ajustes con «Sincronizar N reuniones existentes») y el default pasa a 'pending'
-- después, para las nuevas. Así no hay un `update` de toda la tabla.
alter table public.crm_meetings
  add column if not exists sync_status       text not null default 'disabled',
  add column if not exists sync_error        text,
  add column if not exists sync_attempts     integer not null default 0,
  add column if not exists external_event_id text,
  add column if not exists external_provider text,
  add column if not exists ics_sequence      integer not null default 0,
  add column if not exists color_id          text,
  add column if not exists reminder_minutes  integer,
  add column if not exists guest_user_ids    uuid[] not null default '{}',
  add column if not exists guest_emails      text[] not null default '{}';
alter table public.crm_meetings alter column sync_status set default 'pending';

alter table public.crm_meetings drop constraint if exists crm_meetings_sync_status_check;
alter table public.crm_meetings add constraint crm_meetings_sync_status_check
  check (sync_status in ('pending', 'synced', 'error', 'disabled'));
alter table public.crm_meetings drop constraint if exists crm_meetings_external_provider_check;
alter table public.crm_meetings add constraint crm_meetings_external_provider_check
  check (external_provider = 'google');

-- El barrido busca las pendientes cada 5 minutos.
create index if not exists crm_meetings_sync_pending_idx on public.crm_meetings (updated_at)
  where deleted_at is null and sync_status in ('pending', 'error');

-- ---------- El último color elegido ----------
-- El producto recuerda el color con el que cada uno agendó su última visita y lo preselecciona.
-- Acá el front no escribe `users` (no hay policies de escritura), así que va por una RPC que solo
-- toca la columna de quien llama.
alter table public.users
  add column if not exists last_meeting_color_id text;

create or replace function public.crm_set_last_meeting_color(
  p_color_id text
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.es_usuario() then
    raise exception 'crm_no_access';
  end if;
  update public.users set last_meeting_color_id = nullif(btrim(coalesce(p_color_id, '')), '')
   where id = auth.uid();
end;
$$;

revoke execute on function public.crm_set_last_meeting_color(text) from public, anon;
grant execute on function public.crm_set_last_meeting_color(text) to authenticated;

-- ---------- Los dos crons ----------
-- La anon key va escrita y no como placeholder (lección del producto: un placeholder sin
-- reemplazar dejó un cron dando 401 durante un mes sin que nadie se enterara). No es un secreto:
-- es la VITE_SUPABASE_ANON_KEY que viaja en el bundle. Si se rota, hay que re-schedulear los dos.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'calendar-sync-sweep') then
    perform cron.unschedule('calendar-sync-sweep');
  end if;
  if exists (select 1 from cron.job where jobname = 'calendar-watch-renewal') then
    perform cron.unschedule('calendar-watch-renewal');
  end if;
end
$$;

-- Lo pendiente que el fire-and-forget del front no llegó a empujar, y los reintentos.
select cron.schedule(
  'calendar-sync-sweep',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cXd4bm11eHVpaXlkc3VlYXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzA0NDgsImV4cCI6MjEwNjI0NjQ0OH0.DrjXR-_SrMnRTYX8TDa3L6K6sN93HWsI_jD1_0ENw9o'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Los watch de Google vencen a los ~7 días: se renuevan los que vencen en menos de uno.
select cron.schedule(
  'calendar-watch-renewal',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cXd4bm11eHVpaXlkc3VlYXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzA0NDgsImV4cCI6MjEwNjI0NjQ0OH0.DrjXR-_SrMnRTYX8TDa3L6K6sN93HWsI_jD1_0ENw9o'
    ),
    body := '{"action":"renew-watches"}'::jsonb
  );
  $$
);
