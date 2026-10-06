-- La pestaña «Inmobiliaria» del dialog del lead (rama lorenzo-mejoras-pro, d02cb11).
-- Solo agrega columnas que aceptan null: no toca ninguna fila existente y la RLS de
-- crm_clients ya las cubre. Es el mismo bloque que está en supabase/schema.sql; hasta que
-- se aplique, el front lee lo que haya y al guardar avisa `FALTA_MIGRACION`.

-- Lo que se sabe de la inmobiliaria.
alter table public.crm_clients add column if not exists website        text;
alter table public.crm_clients add column if not exists idealista_url  text;
alter table public.crm_clients add column if not exists city           text;
alter table public.crm_clients add column if not exists neighborhood   text;
alter table public.crm_clients add column if not exists office_address text;
alter table public.crm_clients add column if not exists agents_count   integer
  check (agents_count is null or agents_count >= 0);
alter table public.crm_clients add column if not exists current_crm    text;
-- Cuánto hace que publica en Idealista y cuántos inmuebles tiene ahí: dicen el tamaño real
-- de la inmobiliaria mejor que el número de agentes.
alter table public.crm_clients add column if not exists idealista_years    integer
  check (idealista_years is null or idealista_years >= 0);
alter table public.crm_clients add column if not exists idealista_listings integer
  check (idealista_listings is null or idealista_listings >= 0);
-- El consejo para el SDR sobre cómo encarar esta inmobiliaria (por ahora a mano).
alter table public.crm_clients add column if not exists sdr_advice text;

-- El rol (texto libre) y las notas de cada contacto: el principal y los dos alternativos.
alter table public.crm_clients add column if not exists contact_role              text;
alter table public.crm_clients add column if not exists contact_notes             text;
alter table public.crm_clients add column if not exists alternative_phone_1_role  text;
alter table public.crm_clients add column if not exists alternative_phone_1_notes text;
alter table public.crm_clients add column if not exists alternative_phone_2_role  text;
alter table public.crm_clients add column if not exists alternative_phone_2_notes text;

-- Lo que trae la importación desde Excel. Sin `unique` a propósito: el Excel puede repetir
-- datos y deduplicar es cosa de quien prepara la importación.
alter table public.crm_clients add column if not exists import_batch       text;
alter table public.crm_clients add column if not exists batch_activated_on date;
-- Con qué ángulo abre la llamada el SDR. Mismos valores que `MOTIVOS_DE_SELECCION`
-- (src/pages/crm/lib/inmobiliaria.ts): si se agrega uno, va en los dos lados.
alter table public.crm_clients add column if not exists selection_reason text
  check (selection_reason is null or selection_reason in ('inmovilla', 'new', 'small'));
-- De dónde salió cada teléfono. Mismos valores que `ORIGENES_DE_TELEFONO`.
alter table public.crm_clients add column if not exists phone_source text
  check (phone_source is null or phone_source in ('agency_web', 'legal_notice', 'google_maps', 'company_registry'));
alter table public.crm_clients add column if not exists alternative_phone_1_source text
  check (alternative_phone_1_source is null or alternative_phone_1_source in ('agency_web', 'legal_notice', 'google_maps', 'company_registry'));
alter table public.crm_clients add column if not exists alternative_phone_2_source text
  check (alternative_phone_2_source is null or alternative_phone_2_source in ('agency_web', 'legal_notice', 'google_maps', 'company_registry'));
-- El teléfono tal como figura en la ficha de Google Maps, aparte de los otros tres.
alter table public.crm_clients add column if not exists google_maps_phone text;
-- El de Idealista es ÚLTIMO RECURSO: es un redirector y a la agencia le entra como un cliente
-- interesado en un piso, no como una llamada comercial. Nunca es el número por defecto.
alter table public.crm_clients add column if not exists idealista_phone text;
