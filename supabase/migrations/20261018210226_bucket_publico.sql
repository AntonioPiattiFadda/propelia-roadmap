-- Bucket público: lo que va acá lo puede bajar cualquiera con el enlace, sin sesión y sin vencer.
-- Es para lo que se manda afuera (el vídeo de presentación de los mails del CRM), nunca para
-- datos del CRM ni adjuntos: eso es `roadmap-adjuntos`, que es privado.
-- Sin policies sobre storage.objects a propósito: la lectura pública no las necesita y la
-- escritura queda solo para la service role (se sube con `supabase storage cp --linked`).
insert into storage.buckets (id, name, public, file_size_limit)
values ('publico', 'publico', true, 52428800)
on conflict (id) do update set public = true;
