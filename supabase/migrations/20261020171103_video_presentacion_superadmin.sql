-- El vídeo de presentación de los mails se reemplaza desde Ajustes › «Vídeo presentación por mail»
-- (/ajustes), solo SUPERADMIN: la pantalla pisa `videos/propelia-presentacion-v8.mp4`, el archivo
-- que reproduce la página pública de propelia-frontend. Hasta hoy el bucket `publico` no tenía
-- policies y se subía con `supabase storage cp --linked` (service role). La lectura pública sigue
-- sin necesitar policy: la de select es para que la pantalla lo liste y para el upsert, que pide
-- select + insert + update. Solo bajo `videos/`: el resto del bucket sigue siendo de la service role.
drop policy if exists publico_videos_read on storage.objects;
create policy publico_videos_read on storage.objects for select to authenticated
  using (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin());
drop policy if exists publico_videos_insert on storage.objects;
create policy publico_videos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin());
drop policy if exists publico_videos_update on storage.objects;
create policy publico_videos_update on storage.objects for update to authenticated
  using (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin())
  with check (bucket_id = 'publico' and name like 'videos/%' and public.crm_es_superadmin());
