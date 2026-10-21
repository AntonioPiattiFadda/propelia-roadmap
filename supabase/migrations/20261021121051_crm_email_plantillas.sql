-- El último email enviado de cada plantilla es la plantilla (21/10/2026). `send-email` guarda acá
-- el texto de cada envío («Presentación con vídeo» y «Mail puntual») y el diálogo «Mensajes» del
-- CRM arranca desde ahí en vez del texto de fábrica de `_shared/plantillasEmail.ts`. Una fila por
-- plantilla, del equipo. Sin el nombre del lead ni el botón armado solo (`plantillaGuardable`).
-- Escribe solo la service role: no hay policies de escritura.
create table if not exists public.crm_email_plantillas (
  plantilla  text primary key check (plantilla in ('presentacion-video', 'puntual')),
  campos     jsonb not null default '{}',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.crm_email_plantillas enable row level security;

drop policy if exists crm_email_plantillas_leer on public.crm_email_plantillas;
create policy crm_email_plantillas_leer on public.crm_email_plantillas for select using (public.es_usuario());
