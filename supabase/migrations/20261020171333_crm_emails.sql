-- Los emails que salen por Resend y qué les pasó (20/10/2026). Hasta acá el envío no dejaba
-- rastro: Resend contestaba «aceptado» y el rebote llegaba minutos después sin que nadie se
-- enterara. `send-email` escribe la fila al mandar (con el id que devuelve Resend) y la edge
-- function `resend-webhook` le cambia el estado cuando Resend avisa. El front lee los que no
-- llegaron: la campana de la cabecera del CRM (los tuyos sin ver) y el cartel del lead.
-- Escribe solo la service role: no hay policies de escritura.
create table if not exists public.crm_emails (
  id            uuid primary key default gen_random_uuid(),
  resend_id     text not null unique,
  -- Null: el email de prueba de la cabecera, que no es de ningún lead.
  lead_id       uuid references public.crm_leads(id) on delete cascade,
  sent_by       uuid not null references public.users(id) on delete restrict,
  to_email      text not null,
  subject       text not null default '',
  plantilla     text,
  status        text not null default 'sent'
                check (status in ('sent', 'delivery_delayed', 'delivered', 'bounced', 'failed', 'suppressed', 'complained')),
  -- El motivo que da Resend (bounce.message, failed.reason, suppressed.message), tal cual.
  status_detail text,
  status_at     timestamptz,
  sent_at       timestamptz not null default now(),
  -- Cuándo quien lo mandó vio el aviso de la campana. Solo significa algo en los que no llegaron.
  seen_at       timestamptz
);

create index if not exists crm_emails_lead_idx on public.crm_emails (lead_id);
create index if not exists crm_emails_sent_by_idx on public.crm_emails (sent_by, sent_at desc);

alter table public.crm_emails enable row level security;

-- Lo ve quien lo mandó y quien puede leer el lead.
drop policy if exists crm_emails_leer on public.crm_emails;
create policy crm_emails_leer on public.crm_emails for select using (
  public.es_usuario() and (
    sent_by = auth.uid()
    or (lead_id is not null and public.crm_puede_lead(lead_id, 'read'))
  )
);

-- El evento del webhook. Los eventos de Resend pueden llegar desordenados (un `delivered` atrasado
-- después del `bounced`), así que el estado solo avanza: enviado < demorado < entregado < no llegó.
-- `complained` va al final porque llega después de `delivered`. Devuelve si cambió algo.
create or replace function public.crm_email_evento(
  p_resend_id text,
  p_status    text,
  p_detalle   text,
  p_at        timestamptz
) returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  v_rango constant jsonb := '{"sent":0,"delivery_delayed":1,"delivered":2,"bounced":3,"failed":3,"suppressed":3,"complained":3}';
begin
  if not (v_rango ? p_status) then
    raise exception 'crm_email_estado_invalido';
  end if;
  update public.crm_emails
     set status = p_status,
         status_detail = coalesce(nullif(btrim(coalesce(p_detalle, '')), ''), status_detail),
         status_at = coalesce(p_at, now())
   where resend_id = p_resend_id
     and (v_rango ->> p_status)::int >= (v_rango ->> status)::int
     and status <> p_status;
  return found;
end;
$$;

revoke execute on function public.crm_email_evento(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_email_evento(text, text, text, timestamptz) to service_role;

-- Apagar el aviso de la campana: solo quien lo mandó, solo el suyo.
create or replace function public.crm_email_visto(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.es_usuario() then
    raise exception 'crm_no_autorizado';
  end if;
  update public.crm_emails set seen_at = now()
   where id = p_id and sent_by = auth.uid() and seen_at is null;
end;
$$;

revoke execute on function public.crm_email_visto(uuid) from public, anon;
grant execute on function public.crm_email_visto(uuid) to authenticated;

-- Realtime: el rebote se ve en la campana sin recargar. Aplica la RLS de arriba.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_emails') then
    alter publication supabase_realtime add table public.crm_emails;
  end if;
end $$;
