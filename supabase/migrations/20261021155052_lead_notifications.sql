-- Avisos a leads (21/10/2026), copiados de `propelia-frontend` (sus migraciones
-- 20261009154024_lead_notifications, 20261014202726_lead_notification_visit_property_events y
-- 20261015204322_lead_notification_preferences_by_org). Lo que allá son visitas acá son las demos:
-- toda reunión del CRM con lead (`crm_meetings`). Al agendarla, moverla o cancelarla se le avisa a la
-- inmobiliaria por las vías que un SUPERADMIN prendió en Ajustes → «Avisos a leads» (hoy solo email;
-- SMS y WhatsApp están cableados y apagados, como allá).
--
-- Outbox: los triggers de crm_meetings SÓLO encolan; el envío lo hace la edge function
-- `lead-notifications-dispatch`, que corre cada minuto por cron.
--
-- Diferencias con el producto: sin organizaciones (las preferencias son del equipo; escribe un
-- SUPERADMIN), sin el grupo «Propiedad» (vendida / alquilada: acá no hay inmuebles), y el cron va con
-- la anon key como los del calendario, no con un secreto de Vault.

-- ── Preferencias, del equipo ─────────────────────────────────────────────────────────────
-- Sin fila = apagado. Que una vía o un evento tenga fila no significa que se envíe: el
-- orquestador sólo despacha las vías disponibles (AVAILABLE_CHANNELS) y los eventos con handler.
create table if not exists public.lead_notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'demo_scheduled', 'demo_rescheduled', 'demo_cancelled',
    'demo_reminder_day_before', 'demo_reminder_same_day', 'demo_review_request'
  )),
  channel    text not null check (channel in ('email', 'sms', 'whatsapp')),
  enabled    boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint lead_notification_preferences_event_channel_key unique (event_type, channel)
);

alter table public.lead_notification_preferences enable row level security;

-- Leer: cualquiera del equipo. Escribir: solo un SUPERADMIN (el «admin de la org» del producto).
drop policy if exists lead_notification_preferences_leer on public.lead_notification_preferences;
create policy lead_notification_preferences_leer on public.lead_notification_preferences
  for select using (public.es_usuario());
drop policy if exists lead_notification_preferences_escribir on public.lead_notification_preferences;
create policy lead_notification_preferences_escribir on public.lead_notification_preferences
  for all using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- ── Bandeja de salida ────────────────────────────────────────────────────────────────────
-- subject_id sin FK a propósito: el registro sobrevive al borrado de la reunión.
-- Una demo se puede reprogramar varias veces: cada horario nuevo es un evento distinto
-- (dedupe_key = el horario). dedupe_key '' = un solo evento por (type, subject_id).
create table if not exists public.lead_notification_events (
  id              uuid primary key default gen_random_uuid(),
  type            text not null,
  subject_id      uuid not null,
  actor_user_id   uuid not null references public.users(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text not null default '',
  created_at      timestamptz not null default now(),
  processed_at    timestamptz,
  constraint lead_notification_events_type_subject_dedupe_key unique (type, subject_id, dedupe_key)
);

create index if not exists lead_notification_events_due_idx on public.lead_notification_events (next_attempt_at)
  where status in ('pending', 'processing');

alter table public.lead_notification_events enable row level security;

-- Sólo lectura para quien tiene la demo; las escrituras son del service role y de los triggers.
drop policy if exists lead_notification_events_leer on public.lead_notification_events;
create policy lead_notification_events_leer on public.lead_notification_events
  for select using (actor_user_id = (select auth.uid()));

-- ── Lo que salió de verdad ───────────────────────────────────────────────────────────────
create table if not exists public.lead_notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.lead_notification_events(id) on delete cascade,
  channel             text not null check (channel in ('email', 'sms', 'whatsapp')),
  status              text not null check (status in ('sent', 'failed', 'skipped')),
  recipient           text,
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint lead_notification_deliveries_event_channel_key unique (event_id, channel)
);

alter table public.lead_notification_deliveries enable row level security;

drop policy if exists lead_notification_deliveries_leer on public.lead_notification_deliveries;
create policy lead_notification_deliveries_leer on public.lead_notification_deliveries
  for select using (
    exists (
      select 1 from public.lead_notification_events e
      where e.id = event_id and e.actor_user_id = (select auth.uid())
    )
  );

-- ── Trigger: demo con lead → evento demo_scheduled ───────────────────────────────────────
create or replace function public.enqueue_demo_scheduled_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.lead_notification_events (type, subject_id, actor_user_id)
  values ('demo_scheduled', new.id, new.assigned_to)
  on conflict (type, subject_id, dedupe_key) do nothing;
  return new;
end;
$$;

revoke execute on function public.enqueue_demo_scheduled_lead_notification() from public, anon, authenticated;

drop trigger if exists crm_meetings_enqueue_lead_notification on public.crm_meetings;
create trigger crm_meetings_enqueue_lead_notification
  after insert on public.crm_meetings
  for each row
  when (new.lead_id is not null and new.deleted_at is null)
  execute function public.enqueue_demo_scheduled_lead_notification();

-- ── Trigger: demo reprogramada o cancelada ───────────────────────────────────────────────
-- Sólo si a la inmobiliaria ya le llegó la confirmación (delivery 'sent' del demo_scheduled de esa
-- demo): no se le avisa un cambio de una demo de la que nunca supo. Si la confirmación sigue
-- pendiente, sale con el horario nuevo y no hace falta otro mail.
create or replace function public.enqueue_demo_change_lead_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_informed boolean;
begin
  if new.lead_id is null or new.deleted_at is not null then
    return new;
  end if;
  -- Una demo que ya pasó no se reprograma ni se cancela "para el lead": es limpieza.
  if new.starts_at <= now() and old.starts_at <= now() then
    return new;
  end if;
  select exists (
    select 1
      from public.lead_notification_events e
      join public.lead_notification_deliveries d on d.event_id = e.id
     where e.type = 'demo_scheduled' and e.subject_id = new.id and d.status = 'sent'
  ) into v_informed;
  if not v_informed then
    return new;
  end if;

  if old.status <> 'cancelled' and new.status = 'cancelled' then
    insert into public.lead_notification_events (type, subject_id, actor_user_id, payload)
    values ('demo_cancelled', new.id, new.assigned_to, jsonb_build_object('starts_at', new.starts_at))
    on conflict (type, subject_id, dedupe_key) do nothing;
  elsif new.status = 'scheduled' and old.starts_at is distinct from new.starts_at and new.starts_at > now() then
    insert into public.lead_notification_events (type, subject_id, actor_user_id, payload, dedupe_key)
    values ('demo_rescheduled', new.id, new.assigned_to,
            jsonb_build_object('previous_starts_at', old.starts_at, 'starts_at', new.starts_at),
            new.starts_at::text)
    on conflict (type, subject_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.enqueue_demo_change_lead_notification() from public, anon, authenticated;

drop trigger if exists crm_meetings_enqueue_lead_notification_change on public.crm_meetings;
create trigger crm_meetings_enqueue_lead_notification_change
  after update of starts_at, status on public.crm_meetings
  for each row
  when (old.starts_at is distinct from new.starts_at or old.status is distinct from new.status)
  execute function public.enqueue_demo_change_lead_notification();

-- ── Reclamo de eventos (lo llama sólo el orquestador) ────────────────────────────────────
-- skip locked: dos corridas superpuestas nunca agarran el mismo evento.
-- processing con locked_at > 10 min = worker caído: se vuelve a reclamar, pero sólo si le quedan
-- intentos (attempts < 3 = MAX_ATTEMPTS del dispatcher).
create or replace function public.claim_lead_notification_events(p_limit int)
returns setof public.lead_notification_events
language sql
security definer
set search_path = public
as $$
  update public.lead_notification_events e
     set status = 'processing',
         locked_at = now(),
         attempts = e.attempts + 1
   where e.id in (
     select c.id
       from public.lead_notification_events c
      where (c.status = 'pending' and c.next_attempt_at <= now())
         or (c.status = 'processing' and c.locked_at < now() - interval '10 minutes' and c.attempts < 3)
      order by c.created_at
      limit p_limit
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function public.claim_lead_notification_events(int) from public, anon, authenticated;
grant execute on function public.claim_lead_notification_events(int) to service_role;

-- ── El cron, cada minuto ─────────────────────────────────────────────────────────────────
-- Anon key escrita, como `calendar-sync-sweep` (ver 20261021151726_crm_google_calendar).
-- pg_net da `succeeded` aunque la function conteste 401. Para ver que ANDA:
--   select id, status_code, created from net._http_response order by created desc limit 5;
--   select status, count(*) from lead_notification_events group by 1;
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lead-notifications-dispatch') then
    perform cron.unschedule('lead-notifications-dispatch');
  end if;
end
$$;

select cron.schedule(
  'lead-notifications-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/lead-notifications-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cXd4bm11eHVpaXlkc3VlYXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzA0NDgsImV4cCI6MjEwNjI0NjQ0OH0.DrjXR-_SrMnRTYX8TDa3L6K6sN93HWsI_jD1_0ENw9o'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
