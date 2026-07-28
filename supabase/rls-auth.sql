-- supabase/rls-auth.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUÉS de supabase/schema.sql (Task 1). Reemplaza las policies abiertas por
-- policies que exigen sesión autenticada (Supabase Auth real).
-- Idempotente: se puede correr más de una vez sin error.

drop policy if exists roadmap_secciones_all on public.roadmap_secciones;
create policy roadmap_secciones_auth on public.roadmap_secciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists roadmap_tareas_all on public.roadmap_tareas;
create policy roadmap_tareas_auth on public.roadmap_tareas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists roadmap_adjuntos_read on storage.objects;
create policy roadmap_adjuntos_read on storage.objects
  for select using (bucket_id = 'roadmap-adjuntos' and auth.role() = 'authenticated');

drop policy if exists roadmap_adjuntos_write on storage.objects;
create policy roadmap_adjuntos_write on storage.objects
  for insert with check (bucket_id = 'roadmap-adjuntos' and auth.role() = 'authenticated');

drop policy if exists roadmap_adjuntos_delete on storage.objects;
create policy roadmap_adjuntos_delete on storage.objects
  for delete using (bucket_id = 'roadmap-adjuntos' and auth.role() = 'authenticated');
