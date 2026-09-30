# El CRM y Equipo en React — plan de implementación (sub-proyecto 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La página `/crm` (lista de leads con filtros y contadores, dialog del lead con Cliente |
Tareas | Reuniones, actividad, alta por RPC, reasignación, descarte, funnel y canales) y la página
`/equipo` (números por cartera y matriz de visibilidad), con permisos por cartera aplicados en la
base por RLS.

**Architecture:** Primero la base: `crm_data_access` + `crm_puede()` / `crm_puede_lead()` y todas
las policies de las `crm_*` pasan a llamar a esas funciones; el alta es una RPC `security definer`
que chequea el permiso a mano. Después el front: la lógica pura del producto (`gestionStatus`,
`calendarDeadline`, filtros, parámetros de URL, contadores, colisiones) se copia podada a
`src/pages/crm/lib/` con test; `permisos.ts` es el espejo en pantalla de `crm_puede()`. La lista se
trae entera (la RLS ya recortó) y se filtra en JS con `useMemo`; el detalle del lead se pide al
abrir el dialog. Mutaciones optimistas con TanStack Query y un canal de realtime que invalida.

**Tech Stack:** React 19, TypeScript ~6.0, TanStack Query 5, react-router-dom 7, supabase-js 2,
shadcn/Radix (ya copiados en `src/components/ui`), sonner, lucide-react, Vitest 4. SQL: Postgres
15 de Supabase, validado local con `pglast`.

**Spec:** `docs/superpowers/specs/2026-09-30-crm-pantalla-design.md` (commiteada en la rama
`crm-pantalla`). Contexto de datos: `supabase/schema.sql` (sección CRM) y el `CLAUDE.md` (sección
«El frontend nuevo (React)»).

## Global Constraints

- **Se trabaja en el checkout principal, en la rama `crm-pantalla`** (sin worktree). El
  `node_modules` ya lo instaló Windows y sirve: no hay paso de `npm install`.
- Repo del producto, solo lectura: `PRODUCTO=/mnt/c/Users/anton/Documents/programacion/propelia/propelia-frontend`.
- Base: proyecto Supabase `itqwxnmuxuiiydsueazb` (producción). El SQL es **idempotente**
  (`create … if not exists`, `create or replace`, `drop policy if exists` + `create policy`).
- **Alcance de la base**: solo objetos del CRM — tablas/policies `crm_*`, `crm_data_access`,
  funciones `crm_*`, la RPC, la publicación de realtime de `crm_data_access`/`crm_clients`. **Si
  algún cambio crea, altera o borra algo de `users`, `roadmap_*`, `storage`, o redefine
  `es_usuario()`: PARAR y preguntarle al usuario.** Llamar a `es_usuario()` o leer `users` desde
  una función `crm_*` está permitido.
- **Alcance del front**: `src/pages/crm/`, `src/pages/equipo/`, la entrada de `NAV` + su test, la
  ruta en `App.tsx`, y copias mínimas compartidas en `src/components/` y `src/lib/` que esas
  páginas usen (`calendarDate.ts`, `AvatarUsuario.tsx`, `tasks/TaskDueDatePicker.tsx`). Nada más.
- **Dependencias npm nuevas: ninguna.** Todo lo que se copia usa paquetes que ya están
  (`@radix-ui/react-focus-scope` viene transitivo de `react-dialog`, igual que en el producto). Si
  una pieza pidiera un paquete nuevo: PARAR y preguntarle al usuario.
- **Nunca `npm install`, `vitest`, `npm run dev` ni build desde WSL.** El typecheck sí:
  `node node_modules/typescript/bin/tsc -b`. **Nunca un build.**
- **El plan corre de punta a punta sin pausas.** Cada tarea con TDD escribe el test primero,
  implementa, valida con `tsc -b` (que también chequea los tests: `tsconfig.app.json` incluye
  `src`) y sigue. `npx vitest run` y el checklist manual los corre el usuario al final (Task 15).
- Herramientas de shell: `rg`, `fd`, `bat`, `eza`, `sd`. Nada de grep/find/cat/ls/sed.
- Commits convencionales en castellano, **sin** `Co-Authored-By` ni ninguna atribución a IA.
- Código y comentarios en castellano rioplatense; los comentarios explican el **porqué**.
- `tsconfig`: `verbatimModuleSyntax` (los tipos se importan con `import type`),
  `erasableSyntaxOnly` (sin `enum`), `noUnusedLocals`/`noUnusedParameters`.
- **La lógica pura no importa `@/lib/supabase`**: ese módulo exige `.env` al cargarse y vitest
  corre sin él. Los tipos del CRM viven en `src/pages/crm/types.ts`, que solo hace `import type`.
- Fuera de alcance (spec §8): objetivos, agenda/calendario, lista global de tareas, importar
  leads, email/WhatsApp, marca de leído, IA, virtualización/paginado, alta de miembros, tareas
  recurrentes, borrar leads.

## Review Focus

1. **Un lead cuyo cliente no tiene teléfono ni email (o que llega sin cliente embebido)** → el
   renglón se dibuja con la empresa o el nombre, el buscador lo encuentra por empresa/nombre, y
   una búsqueda de dígitos no lo iguala por tener teléfono vacío. Tests en la Task 4
   (`nombreDelLead`) y en la Task 5 (`filterLeads`, buscador).
2. **Etapa borrada (soft delete) o `funnel_stage_id` en null** → «Sin etapa» en el renglón y en
   Equipo, prioridad `PRIORITY_NONE` (cae en «Sin prioridad»), gestión sin plazo = «Gestionado»,
   y nada revienta; una etapa borrada todavía se lee con su nombre pero no se ofrece en los
   menús. Tests en la Task 4 (`etapaDelLead`) y la Task 13 (`estadisticasPorCartera`).
3. **Un SDR sin ninguna cartera concedida** → ve solo la suya, sin selector de carteras, con la
   lista vacía como «Todavía no tenés leads» y no como error; el alta y la reasignación le
   ofrecen solo su propia cartera. Tests en la Task 6 (`carterasVisibles`,
   `carterasConEscritura`) y la Task 5 (`estadoDeLista`).
4. **«Hoy» cerca de la medianoche en la zona de quien mira** → una tarea que vence hoy no está
   vencida; «hoy» sale de la hora local y no del UTC; la fecha de la tarea inicial del alta la
   manda el front. Tests en la Task 4 (`localTodayIso` con reloj falso a las 23:30) y la Task 5
   (`idsConTareasVencidas`).
5. **Reasignar a una cartera donde ese cliente ya tiene lead** → se avisa quiénes chocan, se
   mueven solo los que no chocan, y si chocan todos no se llama a la base. Test en la Task 6
   (`particionarReasignacion`).

---

## Mapa de archivos

```
supabase/schema.sql                         Task 1-2 — región «permisos por cartera» (reemplaza el RLS viejo)
supabase/tests/crm-permisos.sql             Task 1-2 — casos de RLS y de la RPC, en rollback
src/types/database.types.ts                 Task 3 — regenerado
src/lib/calendarDate.ts (+ .test.ts)        Task 4 — copia podada del producto
src/pages/crm/types.ts                      Task 4
src/pages/crm/lib/calendarDeadline.ts (+test)          Task 4 — copia tal cual
src/pages/crm/lib/gestionStatus.ts (+test)             Task 4 — copia podada
src/pages/crm/lib/effectiveStage.ts (+test)            Task 4 — reescrito (etapaDelLead)
src/pages/crm/lib/discardStage.ts (+test)              Task 4 — copia podada
src/pages/crm/lib/systemComment.ts (+test)             Task 4 — NUEVO (ver nota)
src/pages/crm/lib/clientData.ts (+test)                Task 4 — copia + empresa
src/pages/crm/lib/leadFilters.ts (+test)               Task 5 — copia podada
src/pages/crm/lib/leadFilterParams.ts (+test)          Task 5 — copia + parser
src/pages/crm/lib/computeLeadListCounters.ts (+test)   Task 5 — copia podada
src/pages/crm/lib/tareas.ts (+test)                    Task 5
src/pages/crm/lib/estadoDeLista.ts (+test)             Task 5
src/pages/crm/lib/permisos.ts (+test)                  Task 6
src/pages/crm/lib/reassignCollisions.ts (+test)        Task 6 — copia podada
src/pages/crm/lib/errores.ts (+test)                   Task 6
src/pages/crm/service/crm.service.ts                   Task 7
src/pages/crm/hooks/keys.ts, useCrmLeads.ts, useCrmCatalogos.ts,
  useCarteras.ts, useVisibleAgents.ts, useCrmRealtime.ts,
  useLeadMutaciones.ts, useLeadDetalle.ts              Task 7
src/components/AvatarUsuario.tsx                       Task 8
src/pages/crm/Crm.tsx                                  Task 8 (reemplaza el placeholder) → 11, 12
src/pages/crm/lib/leadCellFormat.ts                    Task 8 — copia tal cual
src/pages/crm/components/CrmLeadList.tsx, leadCells.tsx, FiltrosCrm.tsx,
  AgentFilterButton.tsx                                Task 8 (CrmLeadList → 10, 11)
src/components/tasks/TaskDueDatePicker.tsx             Task 9 — copia tal cual
src/pages/crm/components/ClientFields.tsx, LeadTasksPanel.tsx, MeetingsPanel.tsx,
  DockedActivityChat.tsx, ActividadLead.tsx
src/pages/crm/lib/actividad.ts (+test), reuniones.ts (+test)   Task 9
src/pages/crm/components/LeadDialog.tsx, LeadRowActions.tsx     Task 10
src/pages/crm/components/NewLeadDialog.tsx, ReassignLeadsDialog.tsx,
  BulkActionBar.tsx                                    Task 11
src/pages/crm/components/FunnelConfigDialog.tsx, StagesTable.tsx,
  PriorityPicker.tsx, ManagementToleranceSelect.tsx,
  ManageChannelsDialog.tsx, ChannelsPanel.tsx
src/pages/crm/hooks/useCatalogoMutaciones.ts
src/pages/crm/lib/managementTolerance.ts               Task 12
src/components/nav.ts (+ nav.test.ts), src/App.tsx     Task 13
src/pages/equipo/Equipo.tsx, lib/estadisticasPorCartera.ts (+test),
  components/TablaEquipo.tsx, VisibilityMatrix.tsx     Task 13
CLAUDE.md                                              Task 14 — sección «El CRM»
```

---

### Task 1: SQL — permisos por cartera y sus pruebas

**Files:**
- Modify: `supabase/schema.sql` (sección CRM: se borran los bloques «RLS» y «Realtime» viejos y en
  su lugar entra la región «permisos por cartera»)
- Create: `supabase/tests/crm-permisos.sql`

**Interfaces:**
- Consumes: `public.es_usuario()`, `public.users`, las tablas `crm_*` que ya existen.
- Produces (en la base, después de la Task 3):
  - tabla `public.crm_data_access (id, viewer_id, subject_id, access 'read'|'write', created_at, updated_at)`;
  - `public.crm_es_superadmin() returns boolean`;
  - `public.crm_puede(p_owner uuid, p_nivel text) returns boolean`;
  - `public.crm_puede_lead(p_lead_id uuid, p_nivel text) returns boolean`;
  - `public.crm_puede_cliente(p_client_id uuid, p_nivel text) returns boolean`;
  - policies `<tabla>_leer` / `<tabla>_escribir` en todas las `crm_*`;
  - `crm_data_access` y `crm_clients` en `supabase_realtime`.

- [ ] **Step 0: Pararse en la rama**

```bash
git status --short
git switch crm-pantalla
git log --oneline -1
```
Expected: el único archivo sin trackear es este plan (`docs/superpowers/plans/2026-09-30-crm-pantalla.md`,
que viaja solo al cambiar de rama); el último commit es `docs: diseño del CRM y Equipo en React (sub-proyecto 2)`.
Si hay otros cambios sin commitear: PARAR y preguntarle al usuario.

- [ ] **Step 1: Escribir las pruebas primero — `supabase/tests/crm-permisos.sql`**

Los usuarios de prueba se crean ADENTRO de la transacción y se van con el `rollback`: la base
queda como estaba. La identidad se cambia con `set local role` + `set local request.jwt.claims`,
que es exactamente lo que hace PostgREST con cada request.

```sql
-- Pruebas de permisos del CRM (spec 2026-09-30-crm-pantalla §6).
--
-- Se corren contra la base de verdad (MCP execute_sql, como postgres) y NO dejan rastro: todo
-- pasa en una transacción que termina en ROLLBACK, incluidos los usuarios de prueba. Cada
-- afirmación es un DO que tira `FALLO (…)`: la transacción aborta y el MCP devuelve ese error.
-- Si llega al final, la última consulta devuelve `crm-permisos: OK`.
--
-- Uuids fijos y con la marca c0de: son imposibles en la base real (los genera gen_random_uuid)
-- y así el mensaje de un fallo dice de qué fila se habla.
--   SDR1 …c001, SDR2 …c002, SDR3 …c003, ADMIN …c0a0 (SUPERADMIN), INACTIVO …c0f0
--   clientes …d001-d004, leads …e001-e004 (L1 de SDR1, L2 de SDR2, L3 de SDR3, L4 del inactivo)
begin;

-- ---------- Fixtures (como postgres: saltea la RLS) ----------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000c001', 'crm-sdr1@prueba.test',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c002', 'crm-sdr2@prueba.test',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c003', 'crm-sdr3@prueba.test',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c0a0', 'crm-admin@prueba.test',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000c0f0', 'crm-inactivo@prueba.test', 'authenticated', 'authenticated');

insert into public.users (id, email, nombre, iniciales, color, rol, activo) values
  ('00000000-0000-4000-8000-00000000c001', 'crm-sdr1@prueba.test',     'SDR Uno',  'S1', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c002', 'crm-sdr2@prueba.test',     'SDR Dos',  'S2', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c003', 'crm-sdr3@prueba.test',     'SDR Tres', 'S3', '#888888', 'SDR',        true),
  ('00000000-0000-4000-8000-00000000c0a0', 'crm-admin@prueba.test',    'Admin',    'AD', '#888888', 'SUPERADMIN', true),
  ('00000000-0000-4000-8000-00000000c0f0', 'crm-inactivo@prueba.test', 'Inactivo', 'IN', '#888888', 'SDR',        false);

insert into public.crm_clients (id, first_name, company_name, phone, email) values
  ('00000000-0000-4000-8000-00000000d001', 'Uno',    'Inmo Uno',    '+99900000001', 'c1@prueba.test'),
  ('00000000-0000-4000-8000-00000000d002', 'Dos',    'Inmo Dos',    '+99900000002', 'c2@prueba.test'),
  ('00000000-0000-4000-8000-00000000d003', 'Tres',   'Inmo Tres',   '+99900000003', 'c3@prueba.test'),
  ('00000000-0000-4000-8000-00000000d004', 'Cuatro', 'Inmo Cuatro', '+99900000004', 'c4@prueba.test');

insert into public.crm_leads (id, client_id, assigned_to, funnel_stage_id) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c002',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)),
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000c003',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1)),
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-00000000c0f0',
   (select id from public.crm_funnel_stages where value = 'NEW' and deleted_at is null limit 1));

insert into public.crm_tasks (id, lead_id, title, assigned_to) values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000e002', 'Llamar',         '00000000-0000-4000-8000-00000000c002'),
  ('00000000-0000-4000-8000-00000000f002', null,                                   'Suelta de SDR2', '00000000-0000-4000-8000-00000000c002');
insert into public.crm_comments (lead_id, description) values
  ('00000000-0000-4000-8000-00000000e002', 'comentario de SDR2');
insert into public.crm_meetings (id, lead_id, assigned_to, starts_at, ends_at) values
  ('00000000-0000-4000-8000-00000000f101', null, '00000000-0000-4000-8000-00000000c002', now(), now() + interval '1 hour');

-- ---------- 1. Un SDR sin accesos ve solo su cartera y no escribe en otra ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.crm_leads where id::text like '00000000-0000-4000-8000-00000000e00%';
  if n <> 1 then raise exception 'FALLO (1a): SDR1 sin accesos ve % leads de prueba, esperaba 1 (el suyo)', n; end if;
  select count(*) into n from public.crm_clients where id::text like '00000000-0000-4000-8000-00000000d00%';
  if n <> 1 then raise exception 'FALLO (1b): SDR1 sin accesos ve % clientes de prueba, esperaba 1', n; end if;
  select count(*) into n from public.crm_tasks where id::text like '00000000-0000-4000-8000-00000000f00%';
  if n <> 0 then raise exception 'FALLO (1c): SDR1 ve % tareas de SDR2 (con y sin lead)', n; end if;
  select count(*) into n from public.crm_meetings where id = '00000000-0000-4000-8000-00000000f101';
  if n <> 0 then raise exception 'FALLO (1d): SDR1 ve la reunión sin lead de SDR2'; end if;
  select count(*) into n from public.crm_comments where lead_id = '00000000-0000-4000-8000-00000000e002';
  if n <> 0 then raise exception 'FALLO (1e): SDR1 ve comentarios de un lead ajeno'; end if;
  update public.crm_leads set discard_reason = 'x' where id = '00000000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (1f): SDR1 actualizó un lead ajeno'; end if;
end $$;
do $$
declare ok boolean := false;
begin
  begin
    insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e002', 'intruso');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (1g): SDR1 comentó en un lead ajeno'; end if;
end $$;
reset role;

-- ---------- 2. Con `read` ve pero no escribe ----------
insert into public.crm_data_access (viewer_id, subject_id, access) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'read');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.crm_leads where id::text like '00000000-0000-4000-8000-00000000e00%';
  if n <> 2 then raise exception 'FALLO (2a): con read sobre SDR2, SDR1 ve % leads, esperaba 2', n; end if;
  select count(*) into n from public.crm_clients where id::text like '00000000-0000-4000-8000-00000000d00%';
  if n <> 2 then raise exception 'FALLO (2b): con read, SDR1 ve % clientes, esperaba 2', n; end if;
  select count(*) into n from public.crm_tasks where id::text like '00000000-0000-4000-8000-00000000f00%';
  if n <> 2 then raise exception 'FALLO (2c): con read, SDR1 ve % tareas de SDR2, esperaba 2 (con y sin lead)', n; end if;
  select count(*) into n from public.crm_meetings where id = '00000000-0000-4000-8000-00000000f101';
  if n <> 1 then raise exception 'FALLO (2d): con read, SDR1 no ve la reunión sin lead de SDR2'; end if;
  select count(*) into n from public.crm_data_access;
  if n <> 1 then raise exception 'FALLO (2e): SDR1 ve % filas de crm_data_access, esperaba solo la suya', n; end if;
  update public.crm_leads set discard_reason = 'x' where id = '00000000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (2f): con read, SDR1 actualizó el lead de SDR2'; end if;
  begin
    insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e002', 'solo miro');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (2g): con read, SDR1 comentó en el lead de SDR2'; end if;
end $$;
reset role;

-- ---------- 3. Con `write` escribe ----------
update public.crm_data_access set access = 'write'
 where viewer_id = '00000000-0000-4000-8000-00000000c001' and subject_id = '00000000-0000-4000-8000-00000000c002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int;
begin
  update public.crm_leads set discard_reason = null where id = '00000000-0000-4000-8000-00000000e002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (3a): con write, SDR1 no pudo actualizar el lead de SDR2'; end if;
  insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e002', 'con permiso');
  insert into public.crm_tasks (lead_id, title, assigned_to) values (null, 'Suelta para SDR2', '00000000-0000-4000-8000-00000000c002');
  update public.crm_clients set notes = 'editado' where id = '00000000-0000-4000-8000-00000000d002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (3b): con write, SDR1 no pudo editar el cliente de SDR2'; end if;
end $$;
reset role;

-- ---------- 4. Reasignar exige write en la cartera vieja y en la nueva ----------
-- SDR1 tiene write sobre SDR2 y nada sobre SDR3.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  begin
    update public.crm_leads set assigned_to = '00000000-0000-4000-8000-00000000c003'
     where id = '00000000-0000-4000-8000-00000000e001';
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (4a): SDR1 le pasó su lead a SDR3 sin write sobre SDR3'; end if;

  update public.crm_leads set assigned_to = '00000000-0000-4000-8000-00000000c001'
   where id = '00000000-0000-4000-8000-00000000e003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (4b): SDR1 se quedó con el lead de SDR3 sin permiso sobre SDR3'; end if;

  update public.crm_leads set assigned_to = '00000000-0000-4000-8000-00000000c002'
   where id = '00000000-0000-4000-8000-00000000e001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO (4c): SDR1 no pudo pasarle su lead a SDR2 teniendo write sobre SDR2'; end if;
end $$;
reset role;

-- ---------- 5. Un SDR no toca el catálogo, los historiales ni crm_data_access ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.crm_funnel_stages;
  if n = 0 then raise exception 'FALLO (5a): un SDR no puede LEER el funnel'; end if;
  update public.crm_funnel_stages set label = label where value = 'NEW';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (5b): un SDR editó una etapa del funnel'; end if;

  ok := false;
  begin insert into public.crm_channels (label) values ('canal intruso');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5c): un SDR creó un canal'; end if;

  ok := false;
  begin insert into public.crm_priorities (name, color) values ('intrusa', '#000000');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5d): un SDR creó una prioridad'; end if;

  -- El caso que importa: darse permiso a sí mismo sobre otra cartera.
  ok := false;
  begin insert into public.crm_data_access (viewer_id, subject_id, access)
        values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c003', 'write');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5e): un SDR se concedió acceso a otra cartera'; end if;

  delete from public.crm_data_access where viewer_id = '00000000-0000-4000-8000-00000000c001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO (5f): un SDR borró filas de crm_data_access'; end if;

  ok := false;
  begin insert into public.crm_stage_history (lead_id, to_stage_id)
        values ('00000000-0000-4000-8000-00000000e002', (select id from public.crm_funnel_stages limit 1));
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'FALLO (5g): un SDR escribió el historial de etapas a mano'; end if;
end $$;
reset role;

-- ---------- 6. Un SUPERADMIN ve y edita todo, catálogo incluido ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0a0","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.crm_leads where id::text like '00000000-0000-4000-8000-00000000e00%';
  if n <> 4 then raise exception 'FALLO (6a): el SUPERADMIN ve % leads de prueba, esperaba 4', n; end if;
  insert into public.crm_channels (label) values ('canal del admin');
  update public.crm_funnel_stages set label = label where value = 'NEW';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'FALLO (6b): el SUPERADMIN no pudo editar una etapa'; end if;
  insert into public.crm_data_access (viewer_id, subject_id, access)
  values ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000c001', 'read');
end $$;
reset role;

-- ---------- 7. Un usuario inactivo no puede nada, ni sobre su propia cartera ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0f0","role":"authenticated"}';
do $$
declare n int; ok boolean := false;
begin
  select count(*) into n from public.crm_leads where id = '00000000-0000-4000-8000-00000000e004';
  if n <> 0 then raise exception 'FALLO (7a): un inactivo ve su propio lead'; end if;
  select count(*) into n from public.crm_funnel_stages;
  if n <> 0 then raise exception 'FALLO (7b): un inactivo lee el catálogo'; end if;
  begin
    insert into public.crm_comments (lead_id, description) values ('00000000-0000-4000-8000-00000000e004', 'fantasma');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (7c): un inactivo comentó'; end if;
end $$;
reset role;

-- ===== ALTA (Task 2) =====

select 'crm-permisos: OK' as resultado;
rollback;
```

- [ ] **Step 2: Validar la sintaxis de las pruebas** (el parser real de Postgres; todavía no hay
  base contra la que correrlas)

```bash
test -x /tmp/venv-sql/bin/python || (python3 -m venv /tmp/venv-sql && /tmp/venv-sql/bin/pip install -q pglast)
/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/tests/crm-permisos.sql
```
Expected: `✓ supabase/tests/crm-permisos.sql: N sentencias`.

- [ ] **Step 3: Sacar de `supabase/schema.sql` los dos bloques viejos**

Borrar enteros el bloque que empieza en `-- ---------- RLS ----------` (el `do $$` que crea las
policies `*_equipo` y `*_lectura`) y el bloque siguiente `-- ---------- Realtime ----------` de
la sección CRM (el que publica `crm_leads`, `crm_tasks`, …). NO tocar el `-- ---------- Realtime ----------`
de arriba (el de `roadmap_*`) ni el `-- ---------- Siembras …`. Verificar:

```bash
rg -n "_equipo|_lectura|---------- RLS ----------" supabase/schema.sql
```
Expected: ninguna línea.

- [ ] **Step 4: Escribir la región nueva en `supabase/schema.sql`**, en el lugar exacto de los dos
  bloques borrados (después del `create trigger crm_management_events_gestion …` y antes de
  `-- ---------- Siembras`). Las dos marcas `-- ===== INICIO/FIN …` NO son decorativas: la Task 3
  extrae la migración de lo que hay entre ellas.

```sql
-- ===== INICIO permisos por cartera =====
-- Permisos por cartera (30/9/2026, spec docs/superpowers/specs/2026-09-30-crm-pantalla-design.md §2).
-- Hasta acá cualquier usuario activo veía y editaba todo el CRM. Ahora cada lead es de una
-- cartera (`assigned_to`) y ver o editar la de otro es un permiso de `crm_data_access`. Se aplica
-- ACÁ, en la RLS, y no solo en pantalla: existe el rol SDR, y un permiso sin cerradura no es un
-- permiso. Todo lo que sigue es idempotente y va entre las marcas INICIO/FIN porque es lo que se
-- aplicó como migración sobre la base en producción.

-- ---------- crm_data_access: quién ve la cartera de quién ----------
-- Copia de `user_data_access` del producto. Plana y no transitiva: A ve a B y B ve a C no hace
-- que A vea a C. Sin soft delete: un permiso borrado a medias es la fila que un día revive porque
-- un lector se olvidó el filtro, y acá revivir es devolverle a alguien datos que le sacaste.
create table if not exists public.crm_data_access (
  id         uuid primary key default gen_random_uuid(),
  viewer_id  uuid not null references public.users(id) on delete cascade,
  subject_id uuid not null references public.users(id) on delete cascade,
  -- `write` implica `read`: es una escalera de dos escalones, no dos permisos sueltos.
  access     text not null check (access in ('read', 'write')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- La cartera propia no se concede: ya es tuya.
  constraint crm_data_access_no_self check (viewer_id <> subject_id),
  constraint crm_data_access_par_key unique (viewer_id, subject_id)
);

drop trigger if exists crm_data_access_set_updated_at on public.crm_data_access;
create trigger crm_data_access_set_updated_at before update on public.crm_data_access
  for each row execute function public.set_updated_at();

-- ---------- Las funciones de permiso ----------
-- Todas las policies llaman a estas: la regla vive en un lugar, como es_usuario(). Son
-- security definer porque leen `users` y `crm_data_access`; con invoker quedarían atadas a las
-- policies de esas mismas tablas. Todas exigen es_usuario(): un inactivo no puede nada.
create or replace function public.crm_es_superadmin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.users where id = auth.uid() and activo and rol = 'SUPERADMIN');
$$;

create or replace function public.crm_puede(p_owner uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.es_usuario() and coalesce(
    p_owner = auth.uid()
    or public.crm_es_superadmin()
    or exists (
      select 1 from public.crm_data_access a
      where a.viewer_id = auth.uid() and a.subject_id = p_owner
        and (a.access = 'write' or (p_nivel = 'read' and a.access = 'read'))
    ), false);
$$;

-- Lo mismo a través de la cartera del lead. Un lead que no existe no se puede nada.
create or replace function public.crm_puede_lead(p_lead_id uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select public.crm_puede(l.assigned_to, p_nivel) from public.crm_leads l where l.id = p_lead_id),
    false);
$$;

-- Un cliente no tiene cartera propia: se ve si alguno de sus leads activos se ve. Así un
-- cliente cuyo único lead se reasignó a otra cartera deja de verse, que es lo correcto. Función
-- aparte (y no un exists en la policy) para no apilar la RLS de crm_leads dentro de la de clientes.
create or replace function public.crm_puede_cliente(p_client_id uuid, p_nivel text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.crm_leads l
    where l.client_id = p_client_id and l.deleted_at is null
      and public.crm_puede(l.assigned_to, p_nivel));
$$;

-- security definer + EXECUTE de fábrica para PUBLIC = también anon. Devolverían false, pero no
-- hay por qué dejar la puerta: las llama la RLS de `authenticated`.
revoke execute on function public.crm_es_superadmin() from public, anon;
revoke execute on function public.crm_puede(uuid, text) from public, anon;
revoke execute on function public.crm_puede_lead(uuid, text) from public, anon;
revoke execute on function public.crm_puede_cliente(uuid, text) from public, anon;
grant execute on function public.crm_es_superadmin() to authenticated;
grant execute on function public.crm_puede(uuid, text) to authenticated;
grant execute on function public.crm_puede_lead(uuid, text) to authenticated;
grant execute on function public.crm_puede_cliente(uuid, text) to authenticated;

-- ---------- RLS ----------
-- Primero se borra todo lo que pudo haber: las `*_equipo`/`*_lectura` de la versión anterior
-- (todos veían todo) y las `*_leer`/`*_escribir` de una corrida previa de este mismo archivo.
do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels','crm_clients',
                           'crm_leads','crm_meetings','crm_tasks','crm_comments',
                           'crm_management_events','crm_stage_history','crm_assignment_history',
                           'crm_data_access'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_equipo', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('drop policy if exists %I on public.%I', t || '_escribir', t);
  end loop;
end $$;

-- Catálogo: lo lee cualquiera, lo edita solo un SUPERADMIN. Un SDR que renombra o borra una
-- etapa desarma el funnel de todos (cambia lo decidido el 29/9; aprobado el 30/9).
do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels'] loop
    execute format('create policy %I on public.%I for select using (public.es_usuario())', t || '_leer', t);
    execute format('create policy %I on public.%I for all
                    using (public.crm_es_superadmin()) with check (public.crm_es_superadmin())', t || '_escribir', t);
  end loop;
end $$;

-- Leads. El `with check` también pide write: reasignar exige write sobre la cartera vieja
-- (using, fila de antes) y sobre la nueva (with check, fila de después).
create policy crm_leads_leer on public.crm_leads for select
  using (public.crm_puede(assigned_to, 'read'));
create policy crm_leads_escribir on public.crm_leads for all
  using (public.crm_puede(assigned_to, 'write')) with check (public.crm_puede(assigned_to, 'write'));

-- Tareas y reuniones: con lead, por el lead; sin lead (las dos columnas son nullable), por su responsable.
create policy crm_tasks_leer on public.crm_tasks for select using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'read')
       else public.crm_puede(assigned_to, 'read') end);
create policy crm_tasks_escribir on public.crm_tasks for all using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end)
  with check (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);
create policy crm_meetings_leer on public.crm_meetings for select using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'read')
       else public.crm_puede(assigned_to, 'read') end);
create policy crm_meetings_escribir on public.crm_meetings for all using (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end)
  with check (
  case when lead_id is not null then public.crm_puede_lead(lead_id, 'write')
       else public.crm_puede(assigned_to, 'write') end);

-- Lo que cuelga de un lead.
do $$
declare t text;
begin
  foreach t in array array['crm_comments','crm_management_events'] loop
    execute format('create policy %I on public.%I for select using (public.crm_puede_lead(lead_id, ''read''))', t || '_leer', t);
    execute format('create policy %I on public.%I for all
                    using (public.crm_puede_lead(lead_id, ''write'')) with check (public.crm_puede_lead(lead_id, ''write''))', t || '_escribir', t);
  end loop;
  -- Los historiales solo se leen: los insertan triggers security definer. Sin policy de escritura.
  foreach t in array array['crm_stage_history','crm_assignment_history'] loop
    execute format('create policy %I on public.%I for select using (public.crm_puede_lead(lead_id, ''read''))', t || '_leer', t);
  end loop;
end $$;

-- Clientes. `created_by` porque el alta crea primero el cliente y después el lead: sin esa rama
-- el cliente recién creado no se podría ni leer de vuelta.
create policy crm_clients_leer on public.crm_clients for select using (
  public.crm_puede_cliente(id, 'read') or (public.es_usuario() and created_by = auth.uid()));
create policy crm_clients_escribir on public.crm_clients for all
  using (public.crm_puede_cliente(id, 'write') or (public.es_usuario() and created_by = auth.uid()))
  with check (public.crm_puede_cliente(id, 'write') or (public.es_usuario() and created_by = auth.uid()));

-- crm_data_access: cada uno ve lo que le dieron; solo un SUPERADMIN lo cambia.
create policy crm_data_access_leer on public.crm_data_access for select using (
  (public.es_usuario() and viewer_id = auth.uid()) or public.crm_es_superadmin());
create policy crm_data_access_escribir on public.crm_data_access for all
  using (public.crm_es_superadmin()) with check (public.crm_es_superadmin());

-- ---------- Realtime ----------
-- crm_data_access: si te dan o te sacan acceso, la pantalla se entera. crm_clients: editar la
-- empresa o el teléfono en una sesión tiene que verse en la otra (la spec dice que las demás
-- ya estaban publicadas; clientes no lo estaba). Realtime aplica la RLS a postgres_changes, así
-- que a cada uno le llega solo lo que ve.
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_tasks','crm_comments','crm_management_events','crm_meetings',
                           'crm_clients','crm_data_access'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ===== ALTA (Task 2) =====
-- ===== FIN permisos por cartera =====
```

- [ ] **Step 5: Validar la sintaxis del esquema entero**

```bash
/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql supabase/tests/crm-permisos.sql
```
Expected: dos `✓`.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql supabase/tests/crm-permisos.sql
git commit -m "feat(crm): permisos por cartera en la base (crm_data_access y crm_puede)"
```

---

### Task 2: SQL — la RPC de alta `crm_create_lead_with_client`

**Files:**
- Modify: `supabase/schema.sql` (reemplazar la línea `-- ===== ALTA (Task 2) =====` de la región)
- Modify: `supabase/tests/crm-permisos.sql` (reemplazar la línea `-- ===== ALTA (Task 2) =====`)

**Interfaces:**
- Consumes: `crm_puede()`, `es_usuario()` (Task 1).
- Produces: `public.crm_create_lead_with_client(p_assigned_to uuid, p_initial_task_due_date date,
  p_first_name text = null, p_last_name text = null, p_company_name text = null, p_email text = null,
  p_phone text = null, p_channel_id uuid = null, p_funnel_stage_id uuid = null) returns json`
  → `{ lead_id: uuid, client_id: uuid, client_reused: boolean }`. Errores con mensaje fijo (los
  traduce `mensajeDeError()` en la Task 6): `crm_sin_acceso`, `crm_sin_permiso_cartera`,
  `crm_falta_contacto`, `crm_responsable_inactivo`, `crm_canal_invalido`, `crm_etapa_invalida`,
  `crm_lead_duplicado`.

- [ ] **Step 1: Escribir las pruebas primero** — en `supabase/tests/crm-permisos.sql`, reemplazar
  `-- ===== ALTA (Task 2) =====` por:

```sql
-- ---------- 8. La RPC de alta ----------
-- A esta altura SDR1 tiene write sobre SDR2 (caso 3) y nada sobre SDR3. El cliente d003 es de
-- un lead de SDR3: SDR1 no lo ve, y aun así la RPC tiene que encontrarlo y reutilizarlo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c001","role":"authenticated"}';
do $$
declare r json; ok boolean; n int;
begin
  -- 8a: reutiliza un cliente ajeno por teléfono
  r := public.crm_create_lead_with_client(
    p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
    p_first_name := 'Otro nombre', p_phone := '+99900000003');
  if (r->>'client_reused')::boolean is distinct from true
     or (r->>'client_id')::uuid <> '00000000-0000-4000-8000-00000000d003' then
    raise exception 'FALLO (8a): no reutilizó el cliente ajeno por teléfono: %', r;
  end if;

  -- 8b: la tarea «Asesorar cliente», del responsable, con la fecha que mandó el front
  select count(*) into n from public.crm_tasks
   where lead_id = (r->>'lead_id')::uuid and title = 'Asesorar cliente'
     and due_date = date '2026-10-01' and assigned_to = '00000000-0000-4000-8000-00000000c001';
  if n <> 1 then raise exception 'FALLO (8b): la tarea inicial no quedó bien (encontradas: %)', n; end if;

  -- 8c: el mismo cliente con el mismo responsable es un duplicado
  ok := false;
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
      p_email := 'C3@prueba.test');
  exception when others then ok := sqlerrm = 'crm_lead_duplicado';
  end;
  if not ok then raise exception 'FALLO (8c): no rechazó el duplicado cliente+responsable (por email, sin distinguir mayúsculas)'; end if;

  -- 8d: sin write sobre la cartera destino
  ok := false;
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c003', p_initial_task_due_date := date '2026-10-01',
      p_phone := '+99900000099');
  exception when others then ok := sqlerrm = 'crm_sin_permiso_cartera';
  end;
  if not ok then raise exception 'FALLO (8d): cargó un lead en una cartera sin write'; end if;

  -- 8e: sin teléfono ni email no hay con qué deduplicar
  ok := false;
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
      p_company_name := 'Sin contacto', p_phone := '  ', p_email := '');
  exception when others then ok := sqlerrm = 'crm_falta_contacto';
  end;
  if not ok then raise exception 'FALLO (8e): aceptó un alta sin teléfono ni email'; end if;

  -- 8f: cliente nuevo en una cartera con write (SDR2)
  r := public.crm_create_lead_with_client(
    p_assigned_to := '00000000-0000-4000-8000-00000000c002', p_initial_task_due_date := date '2026-10-01',
    p_company_name := 'Inmo Nueva', p_email := 'nueva@prueba.test');
  if (r->>'client_reused')::boolean is distinct from false then
    raise exception 'FALLO (8f): un cliente nuevo salió como reutilizado: %', r;
  end if;
end $$;
reset role;

-- 8g: un inactivo no puede dar de alta
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c0f0","role":"authenticated"}';
do $$
declare ok boolean := false;
begin
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c0f0', p_initial_task_due_date := date '2026-10-01',
      p_phone := '+99900000098');
  exception when others then ok := sqlerrm = 'crm_sin_acceso';
  end;
  if not ok then raise exception 'FALLO (8g): un inactivo dio de alta un lead'; end if;
end $$;
reset role;

-- 8h: anon ni siquiera la puede ejecutar
set local role anon;
do $$
declare ok boolean := false;
begin
  begin
    perform public.crm_create_lead_with_client(
      p_assigned_to := '00000000-0000-4000-8000-00000000c001', p_initial_task_due_date := date '2026-10-01',
      p_phone := '+99900000097');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'FALLO (8h): anon puede ejecutar la RPC de alta'; end if;
end $$;
reset role;
```

- [ ] **Step 2: Escribir la RPC** — en `supabase/schema.sql`, reemplazar
  `-- ===== ALTA (Task 2) =====` (dentro de la región) por:

```sql
-- ---------- Alta: crm_create_lead_with_client ----------
-- Copia de create_lead_with_client del producto (versión endurecida,
-- 20260913151338_harden_create_lead_with_client.sql) sin organización, tipo de lead, briefing
-- ni propiedades. SECURITY DEFINER y no invoker: para reutilizar el cliente tiene que
-- encontrarlo por teléfono o email AUNQUE sea de una cartera que quien llama no ve. Con invoker
-- la RLS lo esconde, el lookup no lo encuentra, el insert choca contra el índice único y el
-- alta falla. Como saltea la RLS, el permiso se chequea a mano al principio.
--
-- Los errores son claves fijas (`crm_…`) y no frases: la pantalla las traduce
-- (src/pages/crm/lib/errores.ts) y una frase cambiada acá no rompería ningún test de allá.
create or replace function public.crm_create_lead_with_client(
  p_assigned_to            uuid,
  -- La manda el front: «hoy» es el de la zona de quien carga, no el UTC del servidor.
  p_initial_task_due_date  date,
  p_first_name             text default null,
  p_last_name              text default null,
  p_company_name           text default null,
  p_email                  text default null,
  p_phone                  text default null,
  p_channel_id             uuid default null,
  p_funnel_stage_id        uuid default null
) returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_phone     text := nullif(btrim(p_phone), '');
  v_email     text := nullif(btrim(p_email), '');
  v_stage_id  uuid := p_funnel_stage_id;
  v_client_id uuid;
  v_lead_id   uuid;
  v_reused    boolean := false;
begin
  if not public.es_usuario() then
    raise exception 'crm_sin_acceso';
  end if;
  if not public.crm_puede(p_assigned_to, 'write') then
    raise exception 'crm_sin_permiso_cartera' using errcode = '42501';
  end if;
  -- Sin ninguno de los dos no hay con qué deduplicar: el próximo alta del mismo cliente
  -- crearía otro.
  if v_phone is null and v_email is null then
    raise exception 'crm_falta_contacto';
  end if;
  -- crm_puede() deja pasar a un SUPERADMIN sobre cualquier id, incluso el de un inactivo.
  if not exists (select 1 from public.users where id = p_assigned_to and activo) then
    raise exception 'crm_responsable_inactivo';
  end if;
  if p_channel_id is not null and not exists (
    select 1 from public.crm_channels where id = p_channel_id and deleted_at is null) then
    raise exception 'crm_canal_invalido';
  end if;
  if v_stage_id is null then
    -- Por value y no por nombre: la etiqueta «Nuevo» se puede renombrar, NEW no.
    select id into v_stage_id from public.crm_funnel_stages
     where deleted_at is null order by (value = 'NEW') desc, position asc limit 1;
  elsif not exists (select 1 from public.crm_funnel_stages where id = v_stage_id and deleted_at is null) then
    raise exception 'crm_etapa_invalida';
  end if;

  -- Teléfono primero, como el producto: el email se tipea con más errores.
  if v_phone is not null then
    select id into v_client_id from public.crm_clients
     where phone = v_phone and deleted_at is null limit 1;
  end if;
  if v_client_id is null and v_email is not null then
    select id into v_client_id from public.crm_clients
     where lower(email) = lower(v_email) and deleted_at is null limit 1;
  end if;

  if v_client_id is not null then
    v_reused := true;
  else
    begin
      insert into public.crm_clients (first_name, last_name, company_name, email, phone, created_by)
      values (nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
              nullif(btrim(p_company_name), ''), v_email, v_phone, auth.uid())
      returning id into v_client_id;
    exception when unique_violation then
      -- Otro alta del mismo cliente ganó la carrera entre el lookup y el insert.
      select id into v_client_id from public.crm_clients
       where deleted_at is null
         and ((v_phone is not null and phone = v_phone)
           or (v_email is not null and lower(email) = lower(v_email)))
       limit 1;
      v_reused := true;
    end;
  end if;

  -- El único (client_id, assigned_to) dicho con una clave que la pantalla sabe traducir.
  if exists (select 1 from public.crm_leads
             where client_id = v_client_id and assigned_to = p_assigned_to and deleted_at is null) then
    raise exception 'crm_lead_duplicado';
  end if;

  insert into public.crm_leads (client_id, assigned_to, funnel_stage_id, channel_id, created_via, created_by)
  values (v_client_id, p_assigned_to, v_stage_id, p_channel_id, 'manual', auth.uid())
  returning id into v_lead_id;

  insert into public.crm_tasks (lead_id, title, due_date, assigned_to, created_by)
  values (v_lead_id, 'Asesorar cliente', p_initial_task_due_date, p_assigned_to, auth.uid());

  return json_build_object('lead_id', v_lead_id, 'client_id', v_client_id, 'client_reused', v_reused);
end;
$$;

-- REVOKE primero: un REVOKE ALL posterior se llevaría también el GRANT. Y a PUBLIC, no solo a
-- anon: anon hereda de PUBLIC.
revoke all on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.crm_create_lead_with_client(uuid, date, text, text, text, text, text, uuid, uuid)
  to authenticated;
```

- [ ] **Step 3: Validar sintaxis**

```bash
/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql supabase/tests/crm-permisos.sql
rg -n "ALTA \(Task 2\)" supabase/schema.sql supabase/tests/crm-permisos.sql
```
Expected: dos `✓`; el `rg` no encuentra nada (las dos marcas se reemplazaron).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql supabase/tests/crm-permisos.sql
git commit -m "feat(crm): RPC de alta crm_create_lead_with_client"
```

---

### Task 3: Aplicar a la base, correr las pruebas y regenerar los tipos

**Files:**
- Modify: `src/types/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: la región `INICIO/FIN permisos por cartera` de `supabase/schema.sql` y
  `supabase/tests/crm-permisos.sql`.
- Produces: `Tables<'crm_data_access'>` y `Database['public']['Functions']['crm_create_lead_with_client']`
  en `@/types/database.types`, que usan todas las tareas del front.

- [ ] **Step 1: Verificar que la migración solo toca objetos del CRM** (esta es la guarda que
  reemplaza la confirmación del usuario)

```bash
SCRATCH=/tmp/claude-crm && mkdir -p $SCRATCH
python3 -c "t=open('supabase/schema.sql', encoding='utf-8').read(); i=t.index('-- ===== INICIO permisos por cartera'); f=t.index('-- ===== FIN permisos por cartera'); open('$SCRATCH/crm-migracion.sql','w',encoding='utf-8').write(t[i:f])"
rg -n -i "(create|alter|drop|grant|revoke|insert|update|delete|truncate)\b[^;]*\b(public\.users|roadmap_|storage\.|es_usuario)" $SCRATCH/crm-migracion.sql
rg -n -i "^\s*(create|alter|drop)\b" $SCRATCH/crm-migracion.sql
```
Expected: el primer `rg` no devuelve nada, salvo líneas donde `public.users` aparece como
`references public.users(id)` dentro del `create table … crm_data_access` o como lectura
(`select … from public.users`) dentro de funciones `crm_*`. El segundo lista solo `create table
… crm_data_access`, `create trigger crm_data_access_…`, `drop trigger … crm_data_access_…`,
`create or replace function public.crm_…`, `create policy crm_…`. **Si aparece cualquier otra
cosa (un `alter`/`drop`/`create` sobre `users`, `roadmap_*`, `storage` o `es_usuario`): PARAR y
preguntarle al usuario.**

- [ ] **Step 2: Aplicar con el MCP**: `apply_migration` sobre `itqwxnmuxuiiydsueazb`, `name:
  crm_permisos_por_cartera`, `query:` el contenido de `$SCRATCH/crm-migracion.sql` tal cual.
  Expected: éxito. Si falla, NO reintentar a ciegas: leer el error, corregir `schema.sql`, volver
  al Step 1.

- [ ] **Step 3: Chequeo previo de las pruebas**: con `execute_sql`:

```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
select count(*) from public.crm_funnel_stages where value = 'NEW' and deleted_at is null;
```
Expected: ningún trigger en `auth.users` (si hubiera uno que inserta en `public.users`, sacar
los `insert into public.users` de las fixtures y convertirlos en `update` de `rol`/`activo`,
anotándolo en el commit); y `1` etapa NEW.

- [ ] **Step 4: Correr las pruebas**: `execute_sql` con el contenido entero de
  `supabase/tests/crm-permisos.sql`. Expected: una fila `crm-permisos: OK`. Si devuelve
  `FALLO (…)`: el número dice qué caso; arreglar la policy o la RPC en `schema.sql`, re-extraer
  (Step 1), aplicar como `crm_permisos_por_cartera_fix_N` (Step 2) y volver a correr.

- [ ] **Step 5: Confirmar que nada quedó** (el rollback se lleva todo):

```sql
select count(*) from public.users where email like 'crm-%@prueba.test';
select count(*) from auth.users where email like 'crm-%@prueba.test';
```
Expected: `0` y `0`.

- [ ] **Step 6: Advisors**: `get_advisors` tipo `security`. Expected: ningún aviso nuevo sobre
  `crm_*` (en particular, nada de «RLS disabled» ni «function search_path mutable» en las
  funciones nuevas: todas llevan `set search_path`).

- [ ] **Step 7: Regenerar los tipos**: `generate_typescript_types` sobre `itqwxnmuxuiiydsueazb`.
  Escribir el resultado tal cual en `src/types/database.types.ts`, conservando arriba las dos
  líneas de cabecera que ya tiene:
```ts
// GENERADO desde la base (MCP generate_typescript_types, proyecto itqwxnmuxuiiydsueazb). No editar a mano:
// si cambia supabase/schema.sql, se vuelve a generar.
```
Verificar:
```bash
rg -n "crm_data_access: \{|crm_create_lead_with_client: \{|crm_puede: \{" src/types/database.types.ts
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: las tres aparecen; `TSC OK`.

- [ ] **Step 8: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(crm): tipos regenerados con crm_data_access y la RPC de alta"
```

---

### Task 4: Lógica pura copiada — fechas, gestión, etapa, descarte, comentarios, cliente

**Files:**
- Create: `src/lib/calendarDate.ts`, `src/lib/calendarDate.test.ts`
- Create: `src/pages/crm/types.ts`
- Create: `src/pages/crm/lib/calendarDeadline.ts`, `calendarDeadline.test.ts`
- Create: `src/pages/crm/lib/gestionStatus.ts`, `gestionStatus.test.ts`
- Create: `src/pages/crm/lib/effectiveStage.ts`, `effectiveStage.test.ts`
- Create: `src/pages/crm/lib/discardStage.ts`, `discardStage.test.ts`
- Create: `src/pages/crm/lib/systemComment.ts`, `systemComment.test.ts`
- Create: `src/pages/crm/lib/clientData.ts`, `clientData.test.ts`

**Interfaces:**
- Consumes: `Tables<…>` de `@/types/database.types` (Task 3); `parsePhone` de `@/lib/phone` (ya existe).
- Produces:
  - `@/lib/calendarDate`: `localTodayIso(): string`, `toIsoDate(d: Date): string`,
    `shiftIsoDate(iso: string, days: number): string`, `fmtDueLabel(iso: string, today?: string): string`,
    `fmtDayMonth(iso: string): string`, `isOverdue(due: string | null, completed: boolean): boolean`,
    `startOfMonthIso(iso?: string): string`, `daysInMonth(startIso: string): number`,
    `periodBounds(startIso: string, days: number): { start: string; end: string }`.
  - `src/pages/crm/types.ts`: `CrmLead`, `CrmClient`, `CrmLeadRow = CrmLead & { client: CrmClient | null }`,
    `CrmStage`, `CrmPriority`, `CrmChannel`, `CrmTask`, `CrmComment`, `CrmManagementEvent`,
    `CrmMeeting`, `CrmStageHistory`, `CrmAssignmentHistory`, `CrmDataAccess`, `Usuario`,
    `EtapaConPrioridad = CrmStage & { priority: CrmPriority | null }`, `LeadDetalle`.
  - `calendarDeadline(referenceMs: number, toleranceHours: number): number`.
  - `gestionStatus.ts`: tipos `ManagementAction`, `ManagementEvent`, `GestionStatus`, `GestionReference`,
    `GestionKey = 'pendiente' | 'gestionado' | 'pospuesto'`, `LeadGestion`; funciones
    `resolveGestionReference(events, leadCreatedAt)`, `gestionDesdeReferencia(ref, toleranceHours, now?)`,
    `getGestionStatus(events, toleranceHours, leadCreatedAt, now?)`, `gestionDeLead(lead, toleranceHours, now?)`,
    `claveDeGestion(status): GestionKey`, `aplicarGestionOptimista<T extends LeadGestion>(lead: T, evento): T`.
  - `effectiveStage.ts`: `catalogoDeEtapas(etapas, prioridades): Map<string, EtapaConPrioridad>`,
    `etapaDelLead(lead: { funnel_stage_id: string | null }, etapas): EtapaConPrioridad | null`,
    `etapasVivas(etapas: Iterable<EtapaConPrioridad>): EtapaConPrioridad[]`.
  - `discardStage.ts`: `DiscardableStage`, `findDiscardedStage<T extends DiscardableStage>(stages: T[]): T | undefined`.
  - `systemComment.ts`: `comentarioReasignacion(de: string, a: string): string`, `comentarioDescarte(motivo: string | null): string`.
  - `clientData.ts`: `ClientData`, `ClientDataErrors`, `EMPTY_CLIENT`, `MISSING_CONTACT_ERROR`,
    `validateClientData(data): ClientDataErrors`, `nombreDelLead(client): string`, `contactoDelCliente(client): string`.

**Qué se copia de dónde:**
- `$PRODUCTO/src/lib/calendarDate.ts` → `src/lib/calendarDate.ts`: se **quedan** `localTodayIso`,
  `toIsoDate`, `fmtDayMonth`, `MONTHS_ES`, `shiftIsoDate`, `fmtDueLabel`, `isOverdue`,
  `startOfMonthIso`, `periodBounds`, `daysInMonth`; se **borran** `Recurrence`,
  `RECURRENCE_LABELS`, `nextOccurrence`, `startOfWeekIso`, `fmtPeriodLabel` (recurrencia y tablero
  de objetivos: fuera de alcance). Nada más cambia.
- `$PRODUCTO/src/pages/leads/lib/calendarDeadline.ts` → tal cual.
- `$PRODUCTO/src/tests/calendar-deadline.test.ts` → `src/pages/crm/lib/calendarDeadline.test.ts`,
  cambiando solo el import a `./calendarDeadline`.
- `gestionStatus.ts`: del producto se saca **todo lo de propiedades** (`LeadPropertyStageHistoryEntry`,
  `GestionLeadProperty`, el parámetro `leadProperties`, `reopenedBySystem`: acá no hay cruces, y la
  base tampoco lo calcula — ver el comentario de `crm_gestion_refresh()` en `schema.sql`). Se
  agrega lo que el CRM necesita: leer el estado desde las columnas que ya precalcula la base
  (`gestionDeLead`), la clave de filtro con tres valores y el optimista. Va entero abajo.
- `effectiveStage.ts`: el del producto elige la etapa entre la del cliente y las de los cruces con
  propiedades. Acá un lead tiene una sola columna de etapa, así que se reescribe como resolución
  por id contra el catálogo. Mismo archivo, mismo rol («de qué etapa es este lead»).
- `discardStage.ts`: se queda `findDiscardedClientStage` renombrada a `findDiscardedStage` (acá no
  hay «etapas de cliente» que distinguir) y que además ignora las borradas; se borra
  `discardActivityDescription` (habla de inmuebles; su gemelo acá es `comentarioDescarte`).
- `systemComment.ts`: **el del producto no sirve** — es el parser de los comentarios del inbound de
  Idealista. Lo que la spec pide («un comentario `SYSTEM` como `reassign_leads`») es el texto que
  arma esa RPC del producto (`'(Sistema) Lead reasignado de ' || de || ' a ' || a`). Se escribe
  nuevo con ese texto, sin el «(Sistema)»: acá el tipo ya lo dice `comment_type = 'SYSTEM'`.
- `clientData.ts`: copia de `$PRODUCTO/src/pages/leads/lib/clientData.ts` + `company_name` + los
  dos formateadores de nombre.

- [ ] **Step 1: `src/pages/crm/types.ts`** (solo tipos: lo importan los tests sin arrastrar el cliente de Supabase)

```ts
import type { Tables } from '@/types/database.types'

/* Los tipos del CRM, en un archivo que solo hace `import type`. La lógica pura de `lib/` y sus
   tests los usan sin cargar `@/lib/supabase`, que exige el `.env` al importarse y vitest corre
   sin él. */
export type CrmLead = Tables<'crm_leads'>
export type CrmClient = Tables<'crm_clients'>
/** El lead como lo trae la lista: con el cliente embebido (`client:crm_clients(*)`). */
export type CrmLeadRow = CrmLead & { client: CrmClient | null }
export type CrmStage = Tables<'crm_funnel_stages'>
export type CrmPriority = Tables<'crm_priorities'>
export type CrmChannel = Tables<'crm_channels'>
export type CrmTask = Tables<'crm_tasks'>
export type CrmComment = Tables<'crm_comments'>
export type CrmManagementEvent = Tables<'crm_management_events'>
export type CrmMeeting = Tables<'crm_meetings'>
export type CrmStageHistory = Tables<'crm_stage_history'>
export type CrmAssignmentHistory = Tables<'crm_assignment_history'>
export type CrmDataAccess = Tables<'crm_data_access'>
/** Lo que el CRM lee de `users`: la cartera es una persona. */
export type Usuario = Pick<Tables<'users'>, 'id' | 'email' | 'nombre' | 'iniciales' | 'color' | 'rol' | 'activo'>
/** La etapa con su prioridad ya resuelta: el color y el filtro de prioridad cuelgan de acá. */
export type EtapaConPrioridad = CrmStage & { priority: CrmPriority | null }
/** Todo lo que se pide al abrir el dialog de un lead (el `getLeadDetail` del producto). */
export type LeadDetalle = {
  tasks: CrmTask[]
  comments: CrmComment[]
  events: CrmManagementEvent[]
  meetings: CrmMeeting[]
  stageHistory: CrmStageHistory[]
  assignmentHistory: CrmAssignmentHistory[]
}
```

- [ ] **Step 2: Tests que fallan — `src/lib/calendarDate.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtDueLabel, isOverdue, localTodayIso, periodBounds, shiftIsoDate, startOfMonthIso, daysInMonth } from './calendarDate'

afterEach(() => { vi.useRealTimers() })

describe('localTodayIso', () => {
  // El caso que muerde: a las 23:30 en Buenos Aires ya es mañana en UTC. «Hoy» es el de quien mira.
  it('a las 23:30 hora local sigue siendo hoy, no el día UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30))
    expect(localTodayIso()).toBe('2026-09-30')
  })
})

describe('isOverdue', () => {
  it('una tarea que vence hoy NO está vencida; la de ayer sí; la completada nunca', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59))
    expect(isOverdue('2026-09-30', false)).toBe(false)
    expect(isOverdue('2026-09-29', false)).toBe(true)
    expect(isOverdue('2026-09-29', true)).toBe(false)
    expect(isOverdue(null, false)).toBe(false)
  })
})

describe('shiftIsoDate y fmtDueLabel', () => {
  it('cruza de mes sin correrse por el horario de verano', () => {
    expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('relativa cerca, fecha corta lejos', () => {
    expect(fmtDueLabel('2026-09-30', '2026-09-30')).toBe('Hoy')
    expect(fmtDueLabel('2026-10-01', '2026-09-30')).toBe('Mañana')
    expect(fmtDueLabel('2026-09-29', '2026-09-30')).toBe('Ayer')
    expect(fmtDueLabel('2026-10-12', '2026-09-30')).toBe('12 oct')
  })
})

describe('el mes', () => {
  it('primer día, cantidad de días y bordes locales', () => {
    expect(startOfMonthIso('2026-09-30')).toBe('2026-09-01')
    expect(daysInMonth('2026-09-01')).toBe(30)
    const { start, end } = periodBounds('2026-09-01', 30)
    expect(new Date(start).getDate()).toBe(1)
    expect(new Date(end).getMonth()).toBe(9) // 1 de octubre, exclusivo
  })
})
```

- [ ] **Step 3: Implementar `src/lib/calendarDate.ts`** — copiar `$PRODUCTO/src/lib/calendarDate.ts` y borrar
  exactamente `Recurrence`, `RECURRENCE_LABELS`, `nextOccurrence`, `startOfWeekIso` y `fmtPeriodLabel`
  (con sus comentarios). Agregar arriba de todo, debajo del comentario en inglés que ya trae:

```ts
// Copiado de propelia-frontend (src/lib/calendarDate.ts), sin la recurrencia ni el tablero de
// objetivos, que el CRM de acá no tiene. Las columnas `date` se comparan como string: nunca
// pasan por `new Date(str)`, que las leería como medianoche UTC y las correría un día.
```

- [ ] **Step 4: `calendarDeadline.ts` + su test** — copiar como dice «Qué se copia de dónde».
  Agregar arriba de `calendarDeadline.ts`: `// Copiado tal cual de propelia-frontend (src/pages/leads/lib/calendarDeadline.ts).`

- [ ] **Step 5: Test que falla — `src/pages/crm/lib/gestionStatus.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  aplicarGestionOptimista, claveDeGestion, gestionDeLead, getGestionStatus, type LeadGestion,
} from './gestionStatus'

// Portado de propelia-frontend (src/tests/gestion-status.test.ts) sin los casos de cruces con
// propiedades (reset del sistema), que acá no existen.
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi, 0, 0).toISOString()
const ev = (iso: string, id = 'e1', action: 'MANUAL' | 'POSTPONED' = 'MANUAL', createdAt = iso) =>
  ({ id, effective_at: iso, created_at: createdAt, action })
// 2026-07-13 20:00 hora local
const NOW = new Date(2026, 6, 13, 20, 0, 0, 0).getTime()

describe('getGestionStatus', () => {
  it('sin tolerancia ("Nunca"): Gestionado verde', () => {
    for (const tolerance of [null, undefined, 0] as const) {
      expect(getGestionStatus([], tolerance, local(2026, 6, 13, 8), NOW))
        .toMatchObject({ label: 'Gestionado', variant: 'green', postponed: false })
    }
  })
  it('sin tolerancia: una postergación a futuro igual marca postponed', () => {
    const s = getGestionStatus([ev(local(2026, 6, 20, 9), 'e1', 'POSTPONED')], null, local(2026, 6, 1, 8), NOW)
    expect(s).toMatchObject({ label: 'Gestionado', postponed: true })
  })
  it('sin eventos: Pendiente, con referencia en created_at', () => {
    const s = getGestionStatus([], 24, local(2026, 6, 13, 8), NOW)
    expect(s).toMatchObject({ label: 'Pendiente', variant: 'red', hasEvents: false, referenceDate: local(2026, 6, 13, 8) })
  })
  it('evento MANUAL del mismo día: Gestionado', () => {
    expect(getGestionStatus([ev(local(2026, 6, 13, 9))], 24, local(2026, 6, 1, 8), NOW).label).toBe('Gestionado')
  })
  it('usa el evento más reciente, no el primero del array', () => {
    const s = getGestionStatus([ev(local(2026, 6, 1, 10), 'a'), ev(local(2026, 6, 13, 9), 'b')], 24, local(2026, 6, 1, 8), NOW)
    expect(s.referenceDate).toBe(local(2026, 6, 13, 9))
  })
  it('evento de un día calendario anterior con 24h: Pendiente', () => {
    expect(getGestionStatus([ev(local(2026, 6, 12, 23))], 24, local(2026, 6, 1, 8), NOW).label).toBe('Pendiente')
  })
  it('168h: no vence al día siguiente, vence a los 7 días calendario', () => {
    const ref = local(2026, 6, 13, 9)
    expect(getGestionStatus([ev(ref)], 168, local(2026, 6, 1, 8), new Date(2026, 6, 14, 1).getTime()).label).toBe('Gestionado')
    expect(getGestionStatus([ev(ref)], 168, local(2026, 6, 1, 8), new Date(2026, 6, 20, 1).getTime()).label).toBe('Pendiente')
  })
  it('POSTPONED lejano: Gestionado + postponed', () => {
    const s = getGestionStatus([ev(local(2026, 9, 1, 10), 'e1', 'POSTPONED')], 24, local(2026, 6, 1, 8), NOW)
    expect(s).toMatchObject({ label: 'Gestionado', postponed: true })
  })
  it('POSTPONED vencido y ya cruzó medianoche: Pendiente como un MANUAL', () => {
    const s = getGestionStatus([ev(local(2026, 6, 11, 10), 'e1', 'POSTPONED')], 24, local(2026, 6, 1, 8), NOW)
    expect(s).toMatchObject({ label: 'Pendiente', postponed: false })
  })
})

const lead = (over: Partial<LeadGestion> = {}): LeadGestion => ({
  created_at: local(2026, 6, 1, 8),
  gestion_reference_at: null,
  gestion_postponed: false,
  gestion_has_events: false,
  ...over,
})

describe('gestionDeLead (las columnas que precalcula crm_gestion_refresh)', () => {
  it('sin referencia escrita cae a created_at, igual que la base', () => {
    expect(gestionDeLead(lead(), 24, NOW)).toMatchObject({ label: 'Pendiente', referenceDate: local(2026, 6, 1, 8) })
  })
  it('con una gestión de hoy: Gestionado', () => {
    expect(gestionDeLead(lead({ gestion_reference_at: local(2026, 6, 13, 9), gestion_has_events: true }), 24, NOW).label).toBe('Gestionado')
  })
  it('pospuesto a futuro: postponed', () => {
    const s = gestionDeLead(lead({ gestion_reference_at: local(2026, 9, 1, 9), gestion_has_events: true, gestion_postponed: true }), 24, NOW)
    expect(s.postponed).toBe(true)
  })
})

describe('claveDeGestion', () => {
  it('tres claves: pospuesto gana sobre gestionado', () => {
    expect(claveDeGestion({ label: 'Pendiente', variant: 'red', postponed: false, referenceDate: '', hasEvents: true })).toBe('pendiente')
    expect(claveDeGestion({ label: 'Gestionado', variant: 'green', postponed: false, referenceDate: '', hasEvents: true })).toBe('gestionado')
    expect(claveDeGestion({ label: 'Gestionado', variant: 'green', postponed: true, referenceDate: '', hasEvents: true })).toBe('pospuesto')
  })
})

describe('aplicarGestionOptimista (espejo de crm_gestion_refresh: gana el effective_at mayor)', () => {
  it('sin eventos previos, el nuevo manda', () => {
    const r = aplicarGestionOptimista(lead(), { action: 'MANUAL', effective_at: local(2026, 6, 13, 9) })
    expect(r).toMatchObject({ gestion_reference_at: local(2026, 6, 13, 9), gestion_has_events: true, gestion_postponed: false })
  })
  it('una gestión de hoy NO pisa una postergación a futuro', () => {
    const pospuesto = lead({ gestion_reference_at: local(2026, 9, 1, 9), gestion_has_events: true, gestion_postponed: true })
    expect(aplicarGestionOptimista(pospuesto, { action: 'MANUAL', effective_at: local(2026, 6, 13, 9) })).toBe(pospuesto)
  })
  it('posponer marca postponed', () => {
    const r = aplicarGestionOptimista(lead(), { action: 'POSTPONED', effective_at: local(2026, 9, 1, 9) })
    expect(r.gestion_postponed).toBe(true)
  })
})
```

- [ ] **Step 6: Implementar `src/pages/crm/lib/gestionStatus.ts`**

```ts
import { calendarDeadline } from './calendarDeadline'

/* Copiado de propelia-frontend (src/pages/leads/lib/gestionStatus.ts) sin los cruces con
   propiedades: allá un cambio de etapa del sistema sobre un cruce reabre el lead
   (`reopenedBySystem`); acá no hay cruces y `crm_gestion_refresh()` tampoco lo calcula. */

export type ManagementAction = 'MANUAL' | 'POSTPONED'

export type ManagementEvent = { id: string; effective_at: string; created_at: string; action: ManagementAction }

export type GestionStatus = {
  label: 'Gestionado' | 'Pendiente'
  variant: 'green' | 'red'
  postponed: boolean
  referenceDate: string
  hasEvents: boolean
}

/** Las tres claves del filtro de gestión. Pospuesto va aparte aunque se pinte verde: es lo que
 *  la spec llama «postergada», y mezclarla con «al día» escondería los leads que alguien pateó. */
export type GestionKey = 'pendiente' | 'gestionado' | 'pospuesto'

/**
 * La mitad determinística: desde qué fecha corre el reloj. Es EXACTAMENTE lo que precalcula la
 * base en `crm_leads.gestion_*`; lo que queda afuera (comparar contra el vencimiento) depende del
 * huso de quien mira y por eso no puede vivir en una columna.
 */
export type GestionReference = {
  referenceDate: string
  /** El evento que ganó es un POSTPONED. Si además su fecha es futura, el lead está pospuesto. */
  postponedCandidate: boolean
  hasEvents: boolean
}

export function resolveGestionReference(events: ManagementEvent[] | null, leadCreatedAt: string): GestionReference {
  // Date.parse y no localeCompare: Postgres devuelve `+00:00` y el front escribe `Z`, y como
  // strings no se ordenan igual. El desempate por created_at es el mismo de la base.
  const last = (events ?? []).slice().sort((a, b) =>
    Date.parse(b.effective_at) - Date.parse(a.effective_at) || Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  // Sin ningún evento el lead queda Pendiente: alguien tiene que hacer la primera gestión.
  if (!last) return { referenceDate: leadCreatedAt, postponedCandidate: false, hasEvents: false }
  return { referenceDate: last.effective_at, postponedCandidate: last.action === 'POSTPONED', hasEvents: true }
}

export function gestionDesdeReferencia(
  ref: GestionReference,
  toleranceHours: number | null | undefined,
  now: number = Date.now(),
): GestionStatus {
  const { referenceDate, postponedCandidate, hasEvents } = ref
  const refMs = Date.parse(referenceDate)
  const postponed = postponedCandidate && refMs > now
  // Tiempo de gestión «Nunca»: sin reloj no se puede vencer. Un estado real y no null, así la
  // celda, el filtro y los contadores dicen lo mismo.
  if (!toleranceHours) return { label: 'Gestionado', variant: 'green', postponed, referenceDate, hasEvents }
  if (!hasEvents) return { label: 'Pendiente', variant: 'red', postponed: false, referenceDate, hasEvents: false }
  const vigente = now < calendarDeadline(refMs, toleranceHours)
  return {
    label: vigente ? 'Gestionado' : 'Pendiente',
    variant: vigente ? 'green' : 'red',
    postponed,
    referenceDate,
    hasEvents: true,
  }
}

export function getGestionStatus(
  events: ManagementEvent[] | null,
  toleranceHours: number | null | undefined,
  leadCreatedAt: string,
  now: number = Date.now(),
): GestionStatus {
  return gestionDesdeReferencia(resolveGestionReference(events, leadCreatedAt), toleranceHours, now)
}

/** Lo mínimo de un lead para saber su gestión sin pedir sus eventos. */
export type LeadGestion = {
  created_at: string
  gestion_reference_at: string | null
  gestion_postponed: boolean
  gestion_has_events: boolean
}

/**
 * La gestión de un lead desde las columnas que ya escribe la base. Es lo que usa la lista: con
 * esto no hace falta traer los eventos de todos los leads para pintar una columna.
 * `gestion_reference_at` en null es un lead que el trigger todavía no tocó: vale created_at, lo
 * mismo que haría `crm_gestion_refresh()`.
 */
export function gestionDeLead(lead: LeadGestion, toleranceHours: number | null | undefined, now: number = Date.now()): GestionStatus {
  return gestionDesdeReferencia(
    {
      referenceDate: lead.gestion_reference_at ?? lead.created_at,
      postponedCandidate: lead.gestion_postponed,
      hasEvents: lead.gestion_has_events,
    },
    toleranceHours,
    now,
  )
}

export function claveDeGestion(status: GestionStatus): GestionKey {
  if (status.postponed) return 'pospuesto'
  return status.variant === 'red' ? 'pendiente' : 'gestionado'
}

/**
 * Lo que va a escribir `crm_gestion_refresh()` cuando llegue el evento, aplicado ya en pantalla.
 * Gana el de mayor effective_at; en empate gana el nuevo (la base desempata por created_at, y el
 * nuevo es el más reciente). Por eso una gestión de hoy no pisa una postergación a futuro.
 */
export function aplicarGestionOptimista<T extends LeadGestion>(
  lead: T,
  evento: { action: ManagementAction; effective_at: string },
): T {
  if (lead.gestion_has_events && lead.gestion_reference_at
      && Date.parse(lead.gestion_reference_at) > Date.parse(evento.effective_at)) {
    return lead
  }
  return {
    ...lead,
    gestion_reference_at: evento.effective_at,
    gestion_postponed: evento.action === 'POSTPONED',
    gestion_has_events: true,
  }
}
```

- [ ] **Step 7: Test que falla — `src/pages/crm/lib/effectiveStage.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CrmPriority, CrmStage } from '../types'
import { catalogoDeEtapas, etapaDelLead, etapasVivas } from './effectiveStage'

const prio = (over: Partial<CrmPriority>): CrmPriority => ({
  id: 'p1', name: 'Verde', color: '#639922', position: 1, management_tolerance_hours: 24,
  show_in_filters: true, created_at: '', updated_at: '', deleted_at: null, ...over,
})
const etapa = (over: Partial<CrmStage>): CrmStage => ({
  id: 's1', label: 'Nuevo', value: 'NEW', position: 1, priority_id: 'p1', is_out_of_funnel: false,
  allow_delete: false, allow_reorder: false, allow_rename: true, management_tolerance_hours: 24,
  created_at: '', updated_at: '', deleted_at: null, ...over,
})

describe('etapaDelLead', () => {
  const catalogo = catalogoDeEtapas(
    [etapa({}), etapa({ id: 's2', label: 'Vieja', position: 2, deleted_at: '2026-09-01T00:00:00Z', priority_id: null })],
    [prio({})],
  )
  it('resuelve la etapa con su prioridad', () => {
    expect(etapaDelLead({ funnel_stage_id: 's1' }, catalogo)?.priority?.color).toBe('#639922')
  })
  // Review Focus 2: un lead sin etapa o con una que ya no está en el catálogo no revienta.
  it('funnel_stage_id null → null', () => {
    expect(etapaDelLead({ funnel_stage_id: null }, catalogo)).toBeNull()
  })
  it('un id que no está en el catálogo → null', () => {
    expect(etapaDelLead({ funnel_stage_id: 'nada' }, catalogo)).toBeNull()
  })
  it('una etapa borrada (soft) todavía se lee con su nombre, sin prioridad', () => {
    expect(etapaDelLead({ funnel_stage_id: 's2' }, catalogo)).toMatchObject({ label: 'Vieja', priority: null })
  })
  it('etapasVivas saca las borradas y ordena por posición', () => {
    expect(etapasVivas(catalogo.values()).map(e => e.id)).toEqual(['s1'])
  })
})
```

- [ ] **Step 8: Implementar `src/pages/crm/lib/effectiveStage.ts`**

```ts
import type { CrmPriority, CrmStage, EtapaConPrioridad } from '../types'

/* En el producto (src/pages/leads/lib/effectiveStage.ts) la etapa «efectiva» se elige entre la
   del cliente y las de los cruces con propiedades. Acá un lead tiene una sola columna de etapa,
   así que el archivo se queda con su pregunta —de qué etapa es este lead— y la contesta por id. */

/**
 * El catálogo por id, CON las etapas y prioridades borradas (soft delete). Una etapa que se
 * borra del funnel sigue colgando de los leads que ya estaban ahí: se tiene que poder leer su
 * nombre. Lo que no se hace es ofrecerla en un menú: para eso está `etapasVivas`.
 */
export function catalogoDeEtapas(etapas: CrmStage[], prioridades: CrmPriority[]): Map<string, EtapaConPrioridad> {
  const porId = new Map(prioridades.map(p => [p.id, p]))
  return new Map(etapas.map(e => [e.id, { ...e, priority: e.priority_id ? porId.get(e.priority_id) ?? null : null }]))
}

/** null con `funnel_stage_id` null (la FK es `on delete set null`) o con un id fuera del catálogo. */
export function etapaDelLead(
  lead: { funnel_stage_id: string | null },
  etapas: ReadonlyMap<string, EtapaConPrioridad>,
): EtapaConPrioridad | null {
  if (!lead.funnel_stage_id) return null
  return etapas.get(lead.funnel_stage_id) ?? null
}

export function etapasVivas(etapas: Iterable<EtapaConPrioridad>): EtapaConPrioridad[] {
  return [...etapas].filter(e => e.deleted_at == null).sort((a, b) => a.position - b.position)
}
```

- [ ] **Step 9: Test que falla — `src/pages/crm/lib/discardStage.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { findDiscardedStage, type DiscardableStage } from './discardStage'

// Portado de propelia-frontend (src/tests/discard-stage.test.ts).
const stage = (over: Partial<DiscardableStage>): DiscardableStage =>
  ({ id: 'id', value: 'NEW', is_out_of_funnel: false, deleted_at: null, ...over })

describe('findDiscardedStage', () => {
  it('encuentra la de value DISCARDED sin importar mayúsculas', () => {
    const target = stage({ id: 'd', value: 'discarded' })
    expect(findDiscardedStage([stage({ id: 'n' }), target])).toBe(target)
  })
  it('si no hay DISCARDED, cae en la que está fuera del funnel', () => {
    const target = stage({ id: 'o', value: 'ARCHIVADO', is_out_of_funnel: true })
    expect(findDiscardedStage([stage({ id: 'n' }), target])).toBe(target)
  })
  it('ignora las borradas', () => {
    expect(findDiscardedStage([stage({ id: 'd', value: 'DISCARDED', deleted_at: '2026-09-01' })])).toBeUndefined()
  })
  it('undefined si no hay ninguna', () => {
    expect(findDiscardedStage([stage({})])).toBeUndefined()
  })
})
```

- [ ] **Step 10: Implementar `src/pages/crm/lib/discardStage.ts`**

```ts
/* Copiado de propelia-frontend (src/pages/leads/lib/discardStage.ts). Allá se llama
   `findDiscardedClientStage` porque hay dos funnels; acá hay uno. Se fue
   `discardActivityDescription`, que habla de inmuebles: su gemelo es `comentarioDescarte`. */
export interface DiscardableStage {
  id: string
  value: string
  is_out_of_funnel: boolean
  deleted_at?: string | null
}

/** Por value y no por nombre: «Descartado» se puede renombrar (en el seed no, pero igual), DISCARDED no. */
export function findDiscardedStage<T extends DiscardableStage>(stages: T[]): T | undefined {
  const vivas = stages.filter(s => s.deleted_at == null)
  return vivas.find(s => s.value.toUpperCase() === 'DISCARDED') ?? vivas.find(s => s.is_out_of_funnel)
}
```

- [ ] **Step 11: Test que falla — `src/pages/crm/lib/systemComment.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { comentarioDescarte, comentarioReasignacion } from './systemComment'

describe('comentarios SYSTEM', () => {
  it('reasignación: de quién a quién', () => {
    expect(comentarioReasignacion('Antonio', 'Lorenzo')).toBe('Lead reasignado de Antonio a Lorenzo.')
  })
  it('descarte con motivo, recortado', () => {
    expect(comentarioDescarte('  No tiene presupuesto ')).toBe('Lead descartado. Motivo: No tiene presupuesto')
  })
  it('descarte sin motivo (null o vacío)', () => {
    expect(comentarioDescarte(null)).toBe('Lead descartado. Sin motivo especificado.')
    expect(comentarioDescarte('   ')).toBe('Lead descartado. Sin motivo especificado.')
  })
})
```

- [ ] **Step 12: Implementar `src/pages/crm/lib/systemComment.ts`**

```ts
/* El `systemComment.ts` del producto es el parser de los comentarios del inbound de Idealista:
   acá no hay inbound. Lo que sí se trae es el texto que deja `reassign_leads` del producto
   ('(Sistema) Lead reasignado de X a Y'), sin el «(Sistema)»: acá lo dice `comment_type`.
   Un solo lugar para estos textos: la actividad es el registro que se lee después, y el mismo
   hecho no puede quedar escrito de dos formas según la puerta por la que entró. */
export function comentarioReasignacion(de: string, a: string): string {
  return `Lead reasignado de ${de} a ${a}.`
}

export function comentarioDescarte(motivo: string | null): string {
  const limpio = motivo?.trim()
  return limpio ? `Lead descartado. Motivo: ${limpio}` : 'Lead descartado. Sin motivo especificado.'
}
```

- [ ] **Step 13: Test que falla — `src/pages/crm/lib/clientData.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { contactoDelCliente, EMPTY_CLIENT, MISSING_CONTACT_ERROR, nombreDelLead, validateClientData } from './clientData'

describe('validateClientData', () => {
  it('sin teléfono ni email: error en los dos', () => {
    expect(validateClientData({ ...EMPTY_CLIENT, company_name: 'Inmo' }))
      .toEqual({ phone: MISSING_CONTACT_ERROR, email: MISSING_CONTACT_ERROR })
  })
  it('con email alcanza', () => {
    expect(validateClientData({ ...EMPTY_CLIENT, email: 'a@b.com' })).toEqual({})
  })
  it('teléfono que no es teléfono', () => {
    expect(validateClientData({ ...EMPTY_CLIENT, phone: '123' }).phone).toBe('Teléfono inválido')
  })
})

describe('nombreDelLead (Review Focus 1)', () => {
  const vacio = { company_name: null, first_name: null, last_name: null, email: null, phone: null }
  it('la empresa primero', () => {
    expect(nombreDelLead({ ...vacio, company_name: 'Inmo Sur', first_name: 'Ana' })).toBe('Inmo Sur')
  })
  it('sin empresa, la persona', () => {
    expect(nombreDelLead({ ...vacio, first_name: 'Ana', last_name: 'Torres' })).toBe('Ana Torres')
  })
  it('sin teléfono ni email ni nombre, y sin cliente: no revienta', () => {
    expect(nombreDelLead(vacio)).toBe('Sin nombre')
    expect(nombreDelLead(null)).toBe('Sin nombre')
  })
  it('contactoDelCliente es solo la persona', () => {
    expect(contactoDelCliente({ ...vacio, company_name: 'Inmo', first_name: 'Ana' })).toBe('Ana')
    expect(contactoDelCliente(undefined)).toBe('')
  })
})
```

- [ ] **Step 14: Implementar `src/pages/crm/lib/clientData.ts`**

```ts
import { parsePhone } from '@/lib/phone'
import type { CrmClient } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/lib/clientData.ts) + `company_name`: acá los
   clientes son inmobiliarias, y la persona sin su empresa no dice nada. */
export interface ClientData {
  company_name: string
  first_name: string
  last_name: string
  phone: string
  email: string
}

export type ClientDataErrors = Partial<Record<keyof ClientData, string>>

export const EMPTY_CLIENT: ClientData = { company_name: '', first_name: '', last_name: '', phone: '', email: '' }
export const MISSING_CONTACT_ERROR = 'Completá teléfono o email'

// Sin teléfono ni email la base no tiene con qué deduplicar (crm_create_lead_with_client lo rechaza).
export function validateClientData(data: ClientData): ClientDataErrors {
  const errors: ClientDataErrors = {}
  if (!data.phone.trim() && !data.email.trim()) {
    errors.phone = MISSING_CONTACT_ERROR
    errors.email = MISSING_CONTACT_ERROR
  } else if (data.phone.trim() && !parsePhone(data.phone).isValid) {
    errors.phone = 'Teléfono inválido'
  }
  return errors
}

type ClienteNombrable = Pick<CrmClient, 'company_name' | 'first_name' | 'last_name' | 'email' | 'phone'>

export function contactoDelCliente(client: ClienteNombrable | null | undefined): string {
  return [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim()
}

/**
 * Cómo se llama un lead en la lista, el dialog y los carteles. La empresa manda; después la
 * persona; después cualquier dato que lo identifique. Un cliente puede no tener teléfono ni
 * email (lo cargó alguien a mano, o se borraron) y el renglón igual tiene que decir algo.
 */
export function nombreDelLead(client: ClienteNombrable | null | undefined): string {
  return client?.company_name?.trim() || contactoDelCliente(client) || client?.email || client?.phone || 'Sin nombre'
}
```

- [ ] **Step 15: Typecheck** (valida también los tests)

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 16: Commit**

```bash
git add src/lib/calendarDate.ts src/lib/calendarDate.test.ts src/pages/crm/types.ts src/pages/crm/lib
git commit -m "feat(crm): lógica pura de gestión, etapa, descarte y cliente copiada del producto"
```

---

### Task 5: Filtros, parámetros de URL, contadores y estado de la lista

**Files:**
- Create: `src/pages/crm/lib/leadFilters.ts`, `leadFilters.test.ts`
- Create: `src/pages/crm/lib/leadFilterParams.ts`, `leadFilterParams.test.ts`
- Create: `src/pages/crm/lib/computeLeadListCounters.ts`, `computeLeadListCounters.test.ts`
- Create: `src/pages/crm/lib/tareas.ts`, `tareas.test.ts`
- Create: `src/pages/crm/lib/estadoDeLista.ts`, `estadoDeLista.test.ts`

**Interfaces:**
- Consumes: Task 4 (`etapaDelLead`, `gestionDeLead`, `claveDeGestion`, `GestionKey`, tipos).
- Produces:
  - `leadFilters.ts`: `PRIORITY_NONE = 'none'`; `LeadFilterState = { q: string; stageFilter: Set<string>;
    gestionExcluded: Set<GestionKey>; overdueOnly: boolean; includeDiscarded: boolean; excludedPriorities: Set<string> }`;
    `filtrosVacios(): LeadFilterState`; `LeadFilterContext = { overdueLeadIds: ReadonlySet<string>;
    etapas: ReadonlyMap<string, EtapaConPrioridad>; now: number }`; `FilterDimension = 'overdue' | 'gestion' | 'stage' | 'priority' | 'discarded'`;
    `estadoDeGestion(l: CrmLeadRow, ctx): GestionStatus`; `esDescartado(l, etapas): boolean`;
    `prioridadDelLead(l, etapas): string`; `filterLeads(leads, filters, ctx, skip?): CrmLeadRow[]`;
    `leadsDeCarteras(leads, ids: readonly string[]): CrmLeadRow[]`.
  - `leadFilterParams.ts`: `OWNERS_PARAM = 'owners'`, `LEAD_PARAM = 'lead'`, `LEAD_FILTER_PARAMS`,
    `LEAD_FILTER_PARAMS_WITH_QUERY`, `GESTION_KEYS`, `filtrosDesdeUrl(params: URLSearchParams): LeadFilterState`,
    `escribirFiltros(params: URLSearchParams, patch: Partial<LeadFilterState>): URLSearchParams`,
    `deleteLeadFilterParams(params, keys?): URLSearchParams`, `formatFilterList(labels: string[]): string`,
    `soloGestion(key: GestionKey): Set<GestionKey>`, `enlaceAlCrm(opts: { owners?: string[]; gestion?: GestionKey; overdueOnly?: boolean }): string`.
  - `computeLeadListCounters(leads, filters, ctx): LeadListCounters` con `{ gestionTotal, pendienteCount,
    gestionadoCount, pospuestoCount, tareasTotal, overdueLeadCount, stageCount(id), priorityTotal,
    priorityCount(id), discardedCount, matchingCount }`.
  - `tareas.ts`: `estaVencida(t, today): boolean`, `idsConTareasVencidas(tasks, today): Set<string>`,
    `tareasVencidasPorLead(tasks, today): Map<string, CrmTask[]>`.
  - `estadoDeLista({ cargando, error, total, visibles }): 'cargando' | 'error' | 'sin-leads' | 'sin-resultados' | 'ok'`.

**Qué se copia de dónde:**
- `leadFilters.ts` ← `$PRODUCTO/src/pages/leads/lib/leadFilters.ts`. Se **borran**: el tipo `Lead`
  derivado de `getLeadsForList` (acá es `CrmLeadRow`), `findLeadProperty`, `hasRealPropertyId`,
  `isDiscardedForProperty`, `matchesDiscarded`/`matchesProperty` por piso, `matchesBudget`,
  `matchesFeatures`, `matchesPaymentMethod`, `matchesZone`, `matchesSalePurchase`,
  `matchesProbableCross`, `frozenIds` y los campos de estado `propertyFilter`, `budget*`,
  `bedroomsMin`, `bathroomsMin`, `sqmMin`, `paymentMethods`, `zoneQuery`, `salePurchaseOnly`,
  `probableCross*`. Se **cambia**: `LeadFilterContext` lleva el catálogo y el `now` (la etapa ya no
  viene embebida en el lead); el descarte es una dimensión propia (`includeDiscarded`) y no la
  exclusión por defecto de la prioridad de «Descartado» (acá la etapa Descartado no tiene
  prioridad); el buscador suma empresa y teléfonos alternativos. Se **conserva**: la búsqueda
  levanta el descarte y la prioridad excluida (buscar es preguntar por un lead concreto), y el
  `skip` para los contadores.
- `leadFilterParams.ts` ← `$PRODUCTO/src/pages/leads/lib/leadFilterParams.ts`. Se conservan
  `LEAD_FILTER_PARAMS(_WITH_QUERY)`, `formatFilterList`, `deleteLeadFilterParams`; se borra
  `buildLeadFiltersJson` (era para el RPC de listado, que acá no existe). Se **agrega** el parser y
  el escritor: en el producto viven sueltos adentro de `LeadList.tsx` (líneas ~765-796) y acá los
  necesita también Equipo para armar enlaces.
- `computeLeadListCounters.ts` ← el del producto, sin `EstGroup`, cruces, propiedades ni
  compraventa; con el conteo de pospuestos y de descartados.

- [ ] **Step 1: Tests que fallan — `src/pages/crm/lib/leadFilters.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CrmClient, CrmLeadRow, EtapaConPrioridad } from '../types'
import { filterLeads, filtrosVacios, leadsDeCarteras, PRIORITY_NONE, type LeadFilterContext, type LeadFilterState } from './leadFilters'

const NOW = new Date(2026, 8, 30, 12).getTime()
const etapa = (id: string, over: Partial<EtapaConPrioridad> = {}): EtapaConPrioridad => ({
  id, label: id, value: id.toUpperCase(), position: 1, priority_id: null, is_out_of_funnel: false,
  allow_delete: true, allow_reorder: true, allow_rename: true, management_tolerance_hours: 24,
  created_at: '', updated_at: '', deleted_at: null, priority: null, ...over,
})
const ETAPAS = new Map<string, EtapaConPrioridad>([
  ['nuevo', etapa('nuevo', { priority: { id: 'verde', name: 'Verde', color: '#0f0', position: 1, management_tolerance_hours: 24, show_in_filters: true, created_at: '', updated_at: '', deleted_at: null } })],
  ['descartado', etapa('descartado', { value: 'DISCARDED', is_out_of_funnel: true, management_tolerance_hours: null })],
])
const ctx = (over: Partial<LeadFilterContext> = {}): LeadFilterContext =>
  ({ overdueLeadIds: new Set(), etapas: ETAPAS, now: NOW, ...over })
const cliente = (over: Partial<CrmClient> = {}): CrmClient => ({
  id: 'c', first_name: null, last_name: null, company_name: null, email: null, phone: null,
  alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  notes: null, created_by: null, created_at: '', updated_at: '', deleted_at: null, ...over,
})
const lead = (id: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: 'c', assigned_to: 'yo', funnel_stage_id: 'nuevo', channel_id: null, discard_reason: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: new Date(2026, 8, 1).toISOString(), updated_at: '', deleted_at: null,
  client: cliente(), ...over,
})
const f = (over: Partial<LeadFilterState>): LeadFilterState => ({ ...filtrosVacios(), ...over })

describe('buscador (Review Focus 1)', () => {
  const sinContacto = lead('a', { client: cliente({ company_name: 'Inmo Sur' }) })
  const conTel = lead('b', { client: cliente({ first_name: 'Ana', phone: '+34 600 111 222' }) })
  const sinCliente = lead('c', { client: null })

  it('encuentra por empresa aunque no tenga teléfono ni email', () => {
    expect(filterLeads([sinContacto, conTel], f({ q: 'inmo' }), ctx()).map(l => l.id)).toEqual(['a'])
  })
  it('una búsqueda de dígitos no iguala al que tiene el teléfono vacío', () => {
    expect(filterLeads([sinContacto, conTel, sinCliente], f({ q: '600 111' }), ctx()).map(l => l.id)).toEqual(['b'])
  })
  it('letras con un número no se leen como teléfono', () => {
    expect(filterLeads([conTel], f({ q: 'inmo 6' }), ctx())).toEqual([])
  })
  it('un lead sin cliente embebido no revienta', () => {
    expect(filterLeads([sinCliente], f({ q: 'algo' }), ctx())).toEqual([])
  })
  it('mayúsculas y espacios de más no importan', () => {
    expect(filterLeads([conTel], f({ q: '  ANA ' }), ctx()).map(l => l.id)).toEqual(['b'])
  })
})

describe('descartados', () => {
  const vivo = lead('v')
  const descartado = lead('d', { funnel_stage_id: 'descartado', client: cliente({ company_name: 'Muerta' }) })
  it('se esconden por defecto', () => {
    expect(filterLeads([vivo, descartado], f({}), ctx()).map(l => l.id)).toEqual(['v'])
  })
  it('«incluir descartados» los muestra', () => {
    expect(filterLeads([vivo, descartado], f({ includeDiscarded: true }), ctx())).toHaveLength(2)
  })
  it('la búsqueda los encuentra igual', () => {
    expect(filterLeads([vivo, descartado], f({ q: 'muerta' }), ctx()).map(l => l.id)).toEqual(['d'])
  })
  it('elegir la etapa Descartado en el filtro de etapa los muestra', () => {
    expect(filterLeads([vivo, descartado], f({ stageFilter: new Set(['descartado']) }), ctx()).map(l => l.id)).toEqual(['d'])
  })
})

describe('etapa, prioridad, gestión y tareas', () => {
  const sinEtapa = lead('s', { funnel_stage_id: null })
  const verde = lead('v')
  it('un lead sin etapa cae en «Sin prioridad» (Review Focus 2)', () => {
    expect(filterLeads([sinEtapa, verde], f({ excludedPriorities: new Set(['verde']) }), ctx()).map(l => l.id)).toEqual(['s'])
    expect(filterLeads([sinEtapa, verde], f({ excludedPriorities: new Set([PRIORITY_NONE]) }), ctx()).map(l => l.id)).toEqual(['v'])
  })
  it('gestión: excluir gestionados deja los pendientes', () => {
    const pendiente = lead('p', { gestion_has_events: false })
    expect(filterLeads([pendiente, verde], f({ gestionExcluded: new Set(['gestionado', 'pospuesto']) }), ctx()).map(l => l.id)).toEqual(['p'])
  })
  it('tareas vencidas: solo los del conjunto', () => {
    expect(filterLeads([verde, sinEtapa], f({ overdueOnly: true }), ctx({ overdueLeadIds: new Set(['s']) })).map(l => l.id)).toEqual(['s'])
  })
  it('skip apaga una dimensión (para los contadores)', () => {
    expect(filterLeads([verde], f({ overdueOnly: true }), ctx(), ['overdue'])).toHaveLength(1)
  })
})

describe('leadsDeCarteras', () => {
  it('se queda con los de las carteras elegidas', () => {
    expect(leadsDeCarteras([lead('a'), lead('b', { assigned_to: 'otro' })], ['otro']).map(l => l.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Implementar `src/pages/crm/lib/leadFilters.ts`**

```ts
import type { CrmLeadRow, EtapaConPrioridad } from '../types'
import { etapaDelLead } from './effectiveStage'
import { claveDeGestion, gestionDeLead, type GestionKey, type GestionStatus } from './gestionStatus'

/* Copiado de propelia-frontend (src/pages/leads/lib/leadFilters.ts) sin lo inmobiliario (pisos,
   presupuesto, zonas, cruces, compraventa) y sin `frozenIds`. Acá la lista entera ya está en el
   cliente —la RLS recortó— así que no hay RPC con el que mantenerse en espejo. */

export const PRIORITY_NONE = 'none'

export type LeadFilterState = {
  q: string
  stageFilter: Set<string>
  /** En la URL y acá, la lista de claves EXCLUIDAS (igual que el producto). */
  gestionExcluded: Set<GestionKey>
  overdueOnly: boolean
  includeDiscarded: boolean
  excludedPriorities: Set<string>
}

// Función y no constante: una constante con Sets adentro se compartiría y alguien la mutaría.
export function filtrosVacios(): LeadFilterState {
  return {
    q: '', stageFilter: new Set(), gestionExcluded: new Set(), overdueOnly: false,
    includeDiscarded: false, excludedPriorities: new Set(),
  }
}

export type LeadFilterContext = {
  overdueLeadIds: ReadonlySet<string>
  etapas: ReadonlyMap<string, EtapaConPrioridad>
  /** Un solo «ahora» por pintada: si cada fila leyera su propio Date.now(), dos leads idénticos
   *  podrían caer de lados distintos del vencimiento. */
  now: number
}

export type FilterDimension = 'overdue' | 'gestion' | 'stage' | 'priority' | 'discarded'

export function estadoDeGestion(l: CrmLeadRow, ctx: LeadFilterContext): GestionStatus {
  return gestionDeLead(l, etapaDelLead(l, ctx.etapas)?.management_tolerance_hours, ctx.now)
}

export function esDescartado(l: CrmLeadRow, etapas: ReadonlyMap<string, EtapaConPrioridad>): boolean {
  return etapaDelLead(l, etapas)?.is_out_of_funnel === true
}

/** La prioridad es la de la etapa: `crm_leads` no tiene prioridad propia. */
export function prioridadDelLead(l: CrmLeadRow, etapas: ReadonlyMap<string, EtapaConPrioridad>): string {
  return etapaDelLead(l, etapas)?.priority?.id ?? PRIORITY_NONE
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')
// Solo se busca por teléfono si lo tipeado tiene forma de teléfono. «inmo 6» no es un teléfono,
// y compararlo por sus dígitos traería a todo el que tenga un 6.
const PARECE_TELEFONO = /^[\d\s+()-]+$/

function matchesSearch(l: CrmLeadRow, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const c = l.client
  const texto = [c?.company_name, c?.first_name, c?.last_name, c?.email].filter(Boolean).join(' ').toLowerCase()
  if (texto.includes(query)) return true
  if (!PARECE_TELEFONO.test(query)) return false
  const digitos = soloDigitos(query)
  // Sin este corte, '' está incluido en cualquier string y un teléfono vacío igualaría todo.
  if (!digitos) return false
  return [c?.phone, c?.alternative_phone_1, c?.alternative_phone_2]
    .some(tel => !!tel && soloDigitos(tel).includes(digitos))
}

/**
 * Todos los criterios. `skip` apaga uno para contar «cuántos quedarían si prendo este», que es
 * lo que muestran los chips.
 */
export function filterLeads(
  leads: CrmLeadRow[],
  filters: LeadFilterState,
  ctx: LeadFilterContext,
  skip: FilterDimension[] = [],
): CrmLeadRow[] {
  const s = new Set(skip)
  /* Buscar es preguntar por UN lead: «¿dónde está éste?». Si la respuesta es «quedó descartado»,
     esconderlo deja la duda de si existe. La búsqueda levanta el descarte y la prioridad excluida;
     el resto de los filtros sigue acotando. */
  const buscando = filters.q.trim().length > 0
  return leads.filter(l => {
    const etapaId = l.funnel_stage_id
    const etapaElegida = etapaId != null && filters.stageFilter.has(etapaId)
    return matchesSearch(l, filters.q)
      // Elegir a mano la etapa Descartado en el filtro de etapa es pedir verlos.
      && (buscando || s.has('discarded') || filters.includeDiscarded || etapaElegida || !esDescartado(l, ctx.etapas))
      && (buscando || s.has('priority') || filters.excludedPriorities.size === 0
          || !filters.excludedPriorities.has(prioridadDelLead(l, ctx.etapas)))
      && (s.has('stage') || filters.stageFilter.size === 0 || etapaElegida)
      && (s.has('gestion') || filters.gestionExcluded.size === 0
          || !filters.gestionExcluded.has(claveDeGestion(estadoDeGestion(l, ctx))))
      // Un descartado con tareas vencidas no es trabajo pendiente (mismo criterio que el producto).
      && (s.has('overdue') || !filters.overdueOnly || (ctx.overdueLeadIds.has(l.id) && !esDescartado(l, ctx.etapas)))
  })
}

/** La cartera va aparte de los filtros: es de quién son los leads, no qué leads son. */
export function leadsDeCarteras(leads: CrmLeadRow[], ids: readonly string[]): CrmLeadRow[] {
  const set = new Set(ids)
  return leads.filter(l => set.has(l.assigned_to))
}
```

- [ ] **Step 3: Tests que fallan — `src/pages/crm/lib/leadFilterParams.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  deleteLeadFilterParams, enlaceAlCrm, escribirFiltros, filtrosDesdeUrl, formatFilterList, OWNERS_PARAM, soloGestion,
} from './leadFilterParams'

const params = (url: string) => new URL(url, 'http://x').searchParams

describe('filtrosDesdeUrl / escribirFiltros', () => {
  it('ida y vuelta', () => {
    const p = escribirFiltros(new URLSearchParams(), {
      q: 'inmo', stageFilter: new Set(['b', 'a']), gestionExcluded: new Set(['gestionado']),
      overdueOnly: true, includeDiscarded: true, excludedPriorities: new Set(['x']),
    })
    const f = filtrosDesdeUrl(p)
    expect(f.q).toBe('inmo')
    expect([...f.stageFilter]).toEqual(['a', 'b'])
    expect([...f.gestionExcluded]).toEqual(['gestionado'])
    expect(f.overdueOnly).toBe(true)
    expect(f.includeDiscarded).toBe(true)
    expect([...f.excludedPriorities]).toEqual(['x'])
  })
  it('apagar un filtro borra el parámetro en vez de dejarlo vacío', () => {
    const p = escribirFiltros(params('/crm?overdue=1&stages=a'), { overdueOnly: false, stageFilter: new Set() })
    expect(p.has('overdue')).toBe(false)
    expect(p.has('stages')).toBe(false)
  })
  it('una clave de gestión inventada en la URL se ignora', () => {
    expect([...filtrosDesdeUrl(params('/crm?gestion=pendiente,cualquiera')).gestionExcluded]).toEqual(['pendiente'])
  })
  it('no toca lo que no es filtro (carteras, lead abierto)', () => {
    const p = escribirFiltros(params('/crm?owners=u1&lead=l1'), { q: 'x' })
    expect(p.get('owners')).toBe('u1')
    expect(p.get('lead')).toBe('l1')
  })
})

describe('enlaceAlCrm — `gestion` es la lista de EXCLUIDOS', () => {
  it('«solo pendientes» excluye gestionados y pospuestos, no escribe ?gestion=pendiente', () => {
    const url = enlaceAlCrm({ owners: ['u1'], gestion: 'pendiente' })
    const f = filtrosDesdeUrl(params(url))
    expect(f.gestionExcluded).toEqual(soloGestion('pendiente'))
    expect(f.gestionExcluded.has('pendiente')).toBe(false)
    expect(params(url).get(OWNERS_PARAM)).toBe('u1')
  })
  it('tareas vencidas', () => {
    expect(filtrosDesdeUrl(params(enlaceAlCrm({ owners: ['u1'], overdueOnly: true }))).overdueOnly).toBe(true)
  })
  it('sin nada es /crm pelado', () => {
    expect(enlaceAlCrm({})).toBe('/crm')
  })
})

describe('deleteLeadFilterParams y formatFilterList (copiados)', () => {
  it('borra los filtros y deja el resto', () => {
    const p = deleteLeadFilterParams(params('/crm?overdue=1&owners=u1&q=a'), ['overdue', 'q'])
    expect(p.toString()).toBe('owners=u1')
  })
  it('lista en castellano', () => {
    expect(formatFilterList(['Gestión'])).toBe('Gestión')
    expect(formatFilterList(['Gestión', 'Etapa', 'Tareas'])).toBe('Gestión, Etapa y Tareas')
  })
})
```

- [ ] **Step 4: Implementar `src/pages/crm/lib/leadFilterParams.ts`**

```ts
import type { GestionKey } from './gestionStatus'
import { filtrosVacios, type LeadFilterState } from './leadFilters'

/* Copiado de propelia-frontend (src/pages/leads/lib/leadFilterParams.ts) sin `buildLeadFiltersJson`
   (era para el RPC de listado, que acá no hay) y con el parser/escritor que allá vive suelto en
   LeadList.tsx. Acá lo necesita también Equipo: sus enlaces al CRM ya filtrado se arman con esto
   y NUNCA a mano, porque `gestion` es la lista de estados EXCLUIDOS y un `?gestion=pendiente`
   escrito a mano mostraría justo lo contrario. */

/** Carteras mirando, separadas por coma. Ausente = la propia. */
export const OWNERS_PARAM = 'owners'
/** El lead abierto en el dialog: un enlace abre ese lead ya abierto. */
export const LEAD_PARAM = 'lead'

export const LEAD_FILTER_PARAMS = ['gestion', 'overdue', 'stages', 'excluded', 'includeDiscarded'] as const
export const LEAD_FILTER_PARAMS_WITH_QUERY = [...LEAD_FILTER_PARAMS, 'q'] as const

export const GESTION_KEYS: readonly GestionKey[] = ['pendiente', 'gestionado', 'pospuesto']
const esGestionKey = (v: string): v is GestionKey => (GESTION_KEYS as readonly string[]).includes(v)

const lista = (v: string | null) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function filtrosDesdeUrl(params: URLSearchParams): LeadFilterState {
  return {
    ...filtrosVacios(),
    q: params.get('q') ?? '',
    stageFilter: new Set(lista(params.get('stages'))),
    gestionExcluded: new Set(lista(params.get('gestion')).filter(esGestionKey)),
    overdueOnly: params.get('overdue') === '1',
    includeDiscarded: params.get('includeDiscarded') === '1',
    excludedPriorities: new Set(lista(params.get('excluded'))),
  }
}

/** Escribe solo lo que viene en `patch`. Un filtro apagado BORRA su parámetro: la URL limpia y la
 *  del estado por defecto tienen que ser la misma, o compartir un enlace arrastraría basura. */
export function escribirFiltros(params: URLSearchParams, patch: Partial<LeadFilterState>): URLSearchParams {
  const next = new URLSearchParams(params)
  const poner = (k: string, v: string) => { if (v) next.set(k, v); else next.delete(k) }
  // Ordenados: el mismo conjunto elegido en otro orden tiene que dar la misma URL.
  const unir = (s: Set<string>) => [...s].sort().join(',')
  if (patch.q !== undefined) poner('q', patch.q)
  if (patch.stageFilter) poner('stages', unir(patch.stageFilter))
  if (patch.gestionExcluded) poner('gestion', GESTION_KEYS.filter(k => patch.gestionExcluded!.has(k)).join(','))
  if (patch.overdueOnly !== undefined) poner('overdue', patch.overdueOnly ? '1' : '')
  if (patch.includeDiscarded !== undefined) poner('includeDiscarded', patch.includeDiscarded ? '1' : '')
  if (patch.excludedPriorities) poner('excluded', unir(patch.excludedPriorities))
  return next
}

export function deleteLeadFilterParams(params: URLSearchParams, keys: readonly string[] = LEAD_FILTER_PARAMS) {
  const next = new URLSearchParams(params)
  keys.forEach(k => next.delete(k))
  return next
}

/** "Gestión", "Gestión y Etapa", "Gestión, Etapa y Tareas". Sin Intl.ListFormat, como el producto. */
export function formatFilterList(labels: string[]): string {
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

/** «Solo esta clave» dicho en el idioma de la URL: excluir las otras dos. */
export function soloGestion(key: GestionKey): Set<GestionKey> {
  return new Set(GESTION_KEYS.filter(k => k !== key))
}

export function enlaceAlCrm(opts: { owners?: string[]; gestion?: GestionKey; overdueOnly?: boolean }): string {
  let p = new URLSearchParams()
  if (opts.owners?.length) p.set(OWNERS_PARAM, [...opts.owners].sort().join(','))
  p = escribirFiltros(p, {
    ...(opts.gestion ? { gestionExcluded: soloGestion(opts.gestion) } : {}),
    ...(opts.overdueOnly ? { overdueOnly: true } : {}),
  })
  const qs = p.toString()
  return qs ? `/crm?${qs}` : '/crm'
}
```

- [ ] **Step 5: Tests que fallan — `src/pages/crm/lib/tareas.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CrmTask } from '../types'
import { estaVencida, idsConTareasVencidas, tareasVencidasPorLead } from './tareas'

const tarea = (over: Partial<CrmTask>): CrmTask => ({
  id: 't', lead_id: 'l1', title: 'x', due_date: '2026-09-30', planned_for: null, assigned_to: 'u',
  completed: false, completed_at: null, recurrence: null, created_by: null, created_at: '',
  updated_at: '', deleted_at: null, ...over,
})
const HOY = '2026-09-30'

describe('estaVencida (Review Focus 4)', () => {
  it('la que vence hoy NO', () => expect(estaVencida(tarea({}), HOY)).toBe(false))
  it('la de ayer sí', () => expect(estaVencida(tarea({ due_date: '2026-09-29' }), HOY)).toBe(true))
  it('completada, borrada o sin fecha: no', () => {
    expect(estaVencida(tarea({ due_date: '2026-09-29', completed: true }), HOY)).toBe(false)
    expect(estaVencida(tarea({ due_date: '2026-09-29', deleted_at: '2026-09-29' }), HOY)).toBe(false)
    expect(estaVencida(tarea({ due_date: null }), HOY)).toBe(false)
  })
})

describe('idsConTareasVencidas / tareasVencidasPorLead', () => {
  const tareas = [
    tarea({ id: 'a', lead_id: 'l1', due_date: '2026-09-01' }),
    tarea({ id: 'b', lead_id: 'l1', due_date: '2026-09-02' }),
    tarea({ id: 'c', lead_id: 'l2', due_date: HOY }),
    tarea({ id: 'd', lead_id: null, due_date: '2026-09-01' }),
  ]
  it('solo leads, sin las sueltas', () => {
    expect([...idsConTareasVencidas(tareas, HOY)]).toEqual(['l1'])
  })
  it('agrupadas por lead', () => {
    expect(tareasVencidasPorLead(tareas, HOY).get('l1')?.map(t => t.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 6: Implementar `src/pages/crm/lib/tareas.ts`**

```ts
import type { CrmTask } from '../types'

type TareaVencible = Pick<CrmTask, 'due_date' | 'completed' | 'deleted_at'>

/** Vencida recién cuando el día terminó: la que vence hoy todavía está a tiempo. `due_date` es
 *  un día de calendario y se compara como string contra el `today` LOCAL de quien mira. */
export function estaVencida(t: TareaVencible, today: string): boolean {
  return !t.completed && t.deleted_at == null && t.due_date != null && t.due_date.slice(0, 10) < today
}

/** Los leads con alguna tarea vencida. Las sueltas (sin lead) no marcan a ningún lead. */
export function idsConTareasVencidas(tasks: Array<TareaVencible & Pick<CrmTask, 'lead_id'>>, today: string): Set<string> {
  const ids = new Set<string>()
  for (const t of tasks) if (t.lead_id && estaVencida(t, today)) ids.add(t.lead_id)
  return ids
}

export function tareasVencidasPorLead(tasks: CrmTask[], today: string): Map<string, CrmTask[]> {
  const porLead = new Map<string, CrmTask[]>()
  for (const t of tasks) {
    if (!t.lead_id || !estaVencida(t, today)) continue
    porLead.set(t.lead_id, [...(porLead.get(t.lead_id) ?? []), t])
  }
  return porLead
}
```

- [ ] **Step 7: Tests que fallan — `src/pages/crm/lib/computeLeadListCounters.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, EtapaConPrioridad } from '../types'
import { computeLeadListCounters } from './computeLeadListCounters'
import { filtrosVacios, PRIORITY_NONE, type LeadFilterContext } from './leadFilters'

const NOW = new Date(2026, 8, 30, 12).getTime()
const etapa = (id: string, over: Partial<EtapaConPrioridad> = {}): EtapaConPrioridad => ({
  id, label: id, value: id, position: 1, priority_id: null, is_out_of_funnel: false, allow_delete: true,
  allow_reorder: true, allow_rename: true, management_tolerance_hours: 24, created_at: '', updated_at: '',
  deleted_at: null, priority: null, ...over,
})
const ctx: LeadFilterContext = {
  overdueLeadIds: new Set(['p']),
  etapas: new Map([['n', etapa('n')], ['d', etapa('d', { value: 'DISCARDED', is_out_of_funnel: true })]]),
  now: NOW,
}
const lead = (id: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: id, assigned_to: 'u', funnel_stage_id: 'n', channel_id: null, discard_reason: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: new Date(2026, 8, 1).toISOString(), updated_at: '', deleted_at: null, client: null, ...over,
})

describe('computeLeadListCounters', () => {
  const leads = [
    lead('g'),
    lead('p', { gestion_has_events: false }),
    lead('z', { gestion_reference_at: new Date(2026, 10, 1).toISOString(), gestion_postponed: true }),
    lead('d', { funnel_stage_id: 'd' }),
  ]
  const c = computeLeadListCounters(leads, { ...filtrosVacios(), gestionExcluded: new Set(['gestionado']) }, ctx)

  it('gestión cuenta sin su propio filtro, y sin los descartados escondidos', () => {
    expect([c.gestionTotal, c.pendienteCount, c.gestionadoCount, c.pospuestoCount]).toEqual([3, 1, 1, 1])
  })
  it('tareas vencidas', () => expect(c.overdueLeadCount).toBe(1))
  it('una etapa sola', () => expect(c.stageCount('n')).toBe(2)) // g queda afuera por el filtro de gestión
  it('elegir la etapa Descartado cuenta a los descartados', () => expect(c.stageCount('d')).toBe(1))
  it('prioridad: todos caen en «Sin prioridad»', () => expect(c.priorityCount(PRIORITY_NONE)).toBe(2))
  it('descartados que aparecerían al incluirlos', () => expect(c.discardedCount).toBe(1))
  it('lo que queda con todo puesto', () => expect(c.matchingCount).toBe(2))
})
```

- [ ] **Step 8: Implementar `src/pages/crm/lib/computeLeadListCounters.ts`**

```ts
import type { CrmLeadRow } from '../types'
import { claveDeGestion } from './gestionStatus'
import {
  esDescartado, estadoDeGestion, filterLeads, prioridadDelLead, type LeadFilterContext, type LeadFilterState,
} from './leadFilters'

/* Copiado de propelia-frontend (src/pages/leads/lib/computeLeadListCounters.ts) sin cruces,
   pisos ni compraventa. Allá quedó como oráculo de un RPC porque la tabla pagina; acá la lista
   está entera en el cliente y esto ES el cálculo de los chips. Devuelve números y funciones de
   conteo, nunca los arrays intermedios. */
export type LeadListCounters = {
  gestionTotal: number
  pendienteCount: number
  gestionadoCount: number
  pospuestoCount: number
  tareasTotal: number
  overdueLeadCount: number
  /** Cuántos quedarían eligiendo SOLO esta etapa. */
  stageCount: (stageId: string) => number
  priorityTotal: number
  priorityCount: (priorityId: string) => number
  /** Cuántos descartados aparecerían al prender «incluir descartados». */
  discardedCount: number
  matchingCount: number
}

export function computeLeadListCounters(
  leads: CrmLeadRow[], filters: LeadFilterState, ctx: LeadFilterContext,
): LeadListCounters {
  const baseGestion = filterLeads(leads, filters, ctx, ['gestion'])
  let pendienteCount = 0, gestionadoCount = 0, pospuestoCount = 0
  for (const l of baseGestion) {
    const k = claveDeGestion(estadoDeGestion(l, ctx))
    if (k === 'pendiente') pendienteCount++
    else if (k === 'pospuesto') pospuestoCount++
    else gestionadoCount++
  }

  const baseTareas = filterLeads(leads, filters, ctx, ['overdue'])
  const overdueLeadCount = baseTareas.filter(l => ctx.overdueLeadIds.has(l.id) && !esDescartado(l, ctx.etapas)).length

  // Etapa: el filtro completo con esa etapa sola. Así el número de Descartado también es verdad
  // (elegirla los muestra) sin una regla aparte. Son decenas de leads: una pasada por chip se paga.
  const stageCount = (stageId: string) =>
    filterLeads(leads, { ...filters, stageFilter: new Set([stageId]) }, ctx).length

  const basePrioridad = filterLeads(leads, filters, ctx, ['priority'])
  const priorityCount = (priorityId: string) =>
    basePrioridad.filter(l => prioridadDelLead(l, ctx.etapas) === priorityId).length

  const discardedCount = filterLeads(leads, { ...filters, includeDiscarded: true }, ctx)
    .filter(l => esDescartado(l, ctx.etapas)).length

  return {
    gestionTotal: baseGestion.length,
    pendienteCount,
    gestionadoCount,
    pospuestoCount,
    tareasTotal: baseTareas.length,
    overdueLeadCount,
    stageCount,
    priorityTotal: basePrioridad.length,
    priorityCount,
    discardedCount,
    matchingCount: filterLeads(leads, filters, ctx).length,
  }
}
```

- [ ] **Step 9: Tests que fallan — `src/pages/crm/lib/estadoDeLista.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { estadoDeLista } from './estadoDeLista'

describe('estadoDeLista', () => {
  it('cargando por primera vez', () =>
    expect(estadoDeLista({ cargando: true, error: null, total: undefined, visibles: 0 })).toBe('cargando'))
  // La misma regla que accesoDe(): un error de red NO es «no tenés leads».
  it('error sin datos: error, no lista vacía', () =>
    expect(estadoDeLista({ cargando: false, error: new TypeError('Failed to fetch'), total: undefined, visibles: 0 })).toBe('error'))
  it('un refresco que falla con datos en pantalla no los tapa', () =>
    expect(estadoDeLista({ cargando: false, error: new Error('x'), total: 5, visibles: 5 })).toBe('ok'))
  // Review Focus 3: un SDR sin nada cargado ve «todavía no tenés leads», no un error.
  it('cartera vacía', () =>
    expect(estadoDeLista({ cargando: false, error: null, total: 0, visibles: 0 })).toBe('sin-leads'))
  it('hay leads pero los filtros los esconden', () =>
    expect(estadoDeLista({ cargando: false, error: null, total: 4, visibles: 0 })).toBe('sin-resultados'))
})
```

- [ ] **Step 10: Implementar `src/pages/crm/lib/estadoDeLista.ts`**

```ts
export type EstadoLista = 'cargando' | 'error' | 'sin-leads' | 'sin-resultados' | 'ok'

/**
 * Qué dibuja la lista. `total` es cuántos leads hay en las carteras elegidas, `undefined` si la
 * consulta nunca trajo nada. El orden importa y es el de `accesoDe()`: primero los datos —si ya
 * los tenemos, un refresco que falla no los tapa—, después cargando y error, y recién con la
 * consulta terminada y vacía es «no hay leads». Un corte de red no puede decirle a nadie que su
 * cartera está vacía.
 */
export function estadoDeLista(e: { cargando: boolean; error: unknown; total: number | undefined; visibles: number }): EstadoLista {
  if (e.total !== undefined && e.total > 0) return e.visibles > 0 ? 'ok' : 'sin-resultados'
  if (e.total === undefined) return e.error && !e.cargando ? 'error' : 'cargando'
  return 'sin-leads'
}
```

- [ ] **Step 11: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 12: Commit**

```bash
git add src/pages/crm/lib
git commit -m "feat(crm): filtros, parámetros de URL, contadores y estado de la lista"
```

---

### Task 6: Permisos en pantalla, colisiones de reasignación y mensajes de error

**Files:**
- Create: `src/pages/crm/lib/permisos.ts`, `permisos.test.ts`
- Create: `src/pages/crm/lib/reassignCollisions.ts`, `reassignCollisions.test.ts`
- Create: `src/pages/crm/lib/errores.ts`, `errores.test.ts`

**Interfaces:**
- Consumes: tipos de la Task 4.
- Produces:
  - `permisos.ts`: `NivelAcceso = 'read' | 'write'`; `Acceso = Pick<CrmDataAccess, 'viewer_id' | 'subject_id' | 'access'>`;
    `YoPermisos = Pick<Usuario, 'id' | 'rol' | 'activo'> | null | undefined`;
    `esSuperadmin(yo): boolean`; `nivelSobre(yo, owner: string, accesos: readonly Acceso[]): NivelAcceso | null`;
    `puedeLeer(yo, owner, accesos): boolean`; `puedeEscribir(yo, owner, accesos): boolean`;
    `carterasVisibles(yo, usuarios: Usuario[], accesos): Usuario[]`;
    `carterasConEscritura(yo, usuarios, accesos): Usuario[]`; `nombreDe(usuarios, id: string | null): string`.
  - `reassignCollisions.ts`: `LeadSlot = { clientId: string }`; `ReassignCandidate = LeadSlot & { id: string; clientName: string; assignedTo: string }`;
    `findReassignCollisions(candidates, targetSlots): ReassignCandidate[]`;
    `slotsDeCartera(leads: Pick<CrmLead, 'client_id' | 'assigned_to' | 'deleted_at'>[], userId: string): LeadSlot[]`;
    `particionarReasignacion(candidates, targetId: string, targetSlots): { mover: ReassignCandidate[]; chocan: ReassignCandidate[]; yaEran: ReassignCandidate[] }`.
  - `errores.ts`: `SIN_PERMISO: string`; `mensajeDeError(error: unknown, porDefecto?: string): string`.

**Qué se copia de dónde:** `reassignCollisions.ts` ← `$PRODUCTO/src/pages/leads/lib/reassignCollisions.ts`
sin `leadType` en la casilla (acá el único es `(client_id, assigned_to)`), más
`slotsDeCartera` y `particionarReasignacion` (el reparto que en el producto vive adentro de
`ReassignLeadsDialog`). `permisos.ts` y `errores.ts` son nuevos: `permisos.ts` es a `crm_puede()`
lo que `accesoDe()` es a `es_usuario()`.

- [ ] **Step 1: Tests que fallan — `src/pages/crm/lib/permisos.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import {
  carterasConEscritura, carterasVisibles, esSuperadmin, nivelSobre, nombreDe, puedeEscribir, puedeLeer, type Acceso,
} from './permisos'

const u = (id: string, over: Partial<Usuario> = {}): Usuario =>
  ({ id, email: `${id}@x`, nombre: id, iniciales: id.slice(0, 2).toUpperCase(), color: '#000', rol: 'SDR', activo: true, ...over })
const ADMIN = u('admin', { rol: 'SUPERADMIN' })
const SDR = u('sdr')
const ANA = u('ana')
const BETO = u('beto', { activo: false })
const USUARIOS = [ADMIN, SDR, ANA, BETO]

describe('nivelSobre (espejo de crm_puede)', () => {
  it('la propia cartera es write', () => expect(nivelSobre(SDR, 'sdr', [])).toBe('write'))
  it('un SUPERADMIN escribe en todas', () => expect(nivelSobre(ADMIN, 'ana', [])).toBe('write'))
  it('sin fila no hay nada', () => expect(nivelSobre(SDR, 'ana', [])).toBeNull())
  it('read y write según la fila', () => {
    const read: Acceso[] = [{ viewer_id: 'sdr', subject_id: 'ana', access: 'read' }]
    expect(puedeLeer(SDR, 'ana', read)).toBe(true)
    expect(puedeEscribir(SDR, 'ana', read)).toBe(false)
    expect(puedeEscribir(SDR, 'ana', [{ viewer_id: 'sdr', subject_id: 'ana', access: 'write' }])).toBe(true)
  })
  it('una fila de OTRO viewer no me da nada', () =>
    expect(nivelSobre(SDR, 'ana', [{ viewer_id: 'admin', subject_id: 'ana', access: 'write' }])).toBeNull())
  it('un inactivo no puede nada, ni lo suyo', () => {
    expect(nivelSobre(u('sdr', { activo: false }), 'sdr', [])).toBeNull()
    expect(esSuperadmin(u('x', { rol: 'SUPERADMIN', activo: false }))).toBe(false)
  })
  it('sin yo (cargando) no hay nada', () => expect(puedeLeer(null, 'ana', [])).toBe(false))
})

describe('carterasVisibles (Review Focus 3)', () => {
  it('un SDR sin accesos ve solo la suya', () =>
    expect(carterasVisibles(SDR, USUARIOS, []).map(x => x.id)).toEqual(['sdr']))
  it('yo primero y el resto por nombre', () => {
    const acc: Acceso[] = [{ viewer_id: 'sdr', subject_id: 'ana', access: 'read' }, { viewer_id: 'sdr', subject_id: 'admin', access: 'read' }]
    expect(carterasVisibles(SDR, USUARIOS, acc).map(x => x.id)).toEqual(['sdr', 'admin', 'ana'])
  })
  it('un SUPERADMIN ve todas, también la de un inactivo (sus leads siguen ahí)', () =>
    expect(carterasVisibles(ADMIN, USUARIOS, []).map(x => x.id)).toEqual(['admin', 'ana', 'beto', 'sdr']))
  it('inactivo: ninguna', () => expect(carterasVisibles(u('sdr', { activo: false }), USUARIOS, [])).toEqual([]))
})

describe('carterasConEscritura', () => {
  it('un SDR sin accesos solo puede cargar en la suya', () =>
    expect(carterasConEscritura(SDR, USUARIOS, []).map(x => x.id)).toEqual(['sdr']))
  it('read no alcanza; y a un inactivo no se le asigna nada', () => {
    expect(carterasConEscritura(SDR, USUARIOS, [{ viewer_id: 'sdr', subject_id: 'ana', access: 'read' }]).map(x => x.id)).toEqual(['sdr'])
    expect(carterasConEscritura(ADMIN, USUARIOS, []).map(x => x.id)).toEqual(['admin', 'ana', 'sdr'])
  })
})

describe('nombreDe', () => {
  it('nombre o el hueco', () => {
    expect(nombreDe(USUARIOS, 'ana')).toBe('ana')
    expect(nombreDe(USUARIOS, 'nadie')).toBe('Sin responsable')
    expect(nombreDe(USUARIOS, null)).toBe('Sin responsable')
  })
})
```

- [ ] **Step 2: Implementar `src/pages/crm/lib/permisos.ts`**

```ts
import type { CrmDataAccess, Usuario } from '../types'

/* El espejo en pantalla de `crm_puede()` (supabase/schema.sql). NO es la seguridad —esa vive en
   la RLS—: sirve para no mostrarle a un SDR un botón que la base le va a rechazar. Misma
   relación que `accesoDe()` con `es_usuario()`. Si cambia la regla de allá, cambia acá. */

export type NivelAcceso = 'read' | 'write'
export type Acceso = Pick<CrmDataAccess, 'viewer_id' | 'subject_id' | 'access'>
export type YoPermisos = Pick<Usuario, 'id' | 'rol' | 'activo'> | null | undefined

export function esSuperadmin(yo: YoPermisos): boolean {
  return !!yo && yo.activo && yo.rol === 'SUPERADMIN'
}

export function nivelSobre(yo: YoPermisos, owner: string, accesos: readonly Acceso[]): NivelAcceso | null {
  if (!yo || !yo.activo) return null
  if (owner === yo.id || esSuperadmin(yo)) return 'write'
  const fila = accesos.find(a => a.viewer_id === yo.id && a.subject_id === owner)
  if (fila?.access === 'write') return 'write'
  if (fila?.access === 'read') return 'read'
  return null
}

export const puedeLeer = (yo: YoPermisos, owner: string, accesos: readonly Acceso[]) =>
  nivelSobre(yo, owner, accesos) !== null

export const puedeEscribir = (yo: YoPermisos, owner: string, accesos: readonly Acceso[]) =>
  nivelSobre(yo, owner, accesos) === 'write'

const porNombre = (a: Usuario, b: Usuario) => a.nombre.localeCompare(b.nombre, 'es')

/**
 * Las carteras que puedo mirar: la propia primero y el resto por nombre. El orden es estable
 * porque estos ids terminan en la URL y en el selector. Incluye inactivos: sus leads siguen en
 * la base y alguien los tiene que poder ver para repartirlos.
 */
export function carterasVisibles(yo: YoPermisos, usuarios: Usuario[], accesos: readonly Acceso[]): Usuario[] {
  if (!yo || !yo.activo) return []
  const propia = usuarios.find(x => x.id === yo.id)
  const otras = usuarios.filter(x => x.id !== yo.id && puedeLeer(yo, x.id, accesos)).sort(porNombre)
  return propia ? [propia, ...otras] : otras
}

/** Donde puedo cargar o reasignar: con write y activas (la RPC rechaza un responsable inactivo). */
export function carterasConEscritura(yo: YoPermisos, usuarios: Usuario[], accesos: readonly Acceso[]): Usuario[] {
  return carterasVisibles(yo, usuarios, accesos).filter(x => x.activo && puedeEscribir(yo, x.id, accesos))
}

export function nombreDe(usuarios: Usuario[], id: string | null): string {
  return (id && usuarios.find(x => x.id === id)?.nombre) || 'Sin responsable'
}
```

- [ ] **Step 3: Tests que fallan — `src/pages/crm/lib/reassignCollisions.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  findReassignCollisions, particionarReasignacion, slotsDeCartera, type LeadSlot, type ReassignCandidate,
} from './reassignCollisions'

// Portado de propelia-frontend (src/tests/reassign-collisions.test.ts) sin lead_type.
const cand = (id: string, clientId: string, assignedTo = 'yo'): ReassignCandidate =>
  ({ id, clientId, assignedTo, clientName: `Cliente ${clientId}` })
const slot = (clientId: string): LeadSlot => ({ clientId })

describe('findReassignCollisions', () => {
  it('sin leads en el destino no hay choque', () => expect(findReassignCollisions([cand('l1', 'c1')], [])).toEqual([]))
  it('detecta el choque por cliente', () => {
    const c = cand('l1', 'c1')
    expect(findReassignCollisions([c], [slot('c1')])).toEqual([c])
  })
  it('en un lote mixto devuelve solo los que chocan, en orden', () => {
    const a = cand('l1', 'c1'), b = cand('l2', 'c2'), c = cand('l3', 'c3')
    expect(findReassignCollisions([a, b, c], [slot('c3'), slot('c1')])).toEqual([a, c])
  })
})

describe('slotsDeCartera', () => {
  it('solo los activos de ese usuario', () => {
    expect(slotsDeCartera([
      { client_id: 'c1', assigned_to: 'u', deleted_at: null },
      { client_id: 'c2', assigned_to: 'u', deleted_at: '2026-09-01' },
      { client_id: 'c3', assigned_to: 'otro', deleted_at: null },
    ], 'u')).toEqual([slot('c1')])
  })
})

describe('particionarReasignacion (Review Focus 5)', () => {
  it('reparte en mover y chocan', () => {
    const r = particionarReasignacion([cand('l1', 'c1'), cand('l2', 'c2')], 'destino', [slot('c2')])
    expect(r.mover.map(x => x.id)).toEqual(['l1'])
    expect(r.chocan.map(x => x.id)).toEqual(['l2'])
  })
  it('si chocan todos, no queda nada para mandar a la base', () => {
    expect(particionarReasignacion([cand('l1', 'c1')], 'destino', [slot('c1')]).mover).toEqual([])
  })
  it('el mismo cliente dos veces en el lote: el segundo choca contra el primero', () => {
    const r = particionarReasignacion([cand('l1', 'c1', 'ana'), cand('l2', 'c1', 'beto')], 'destino', [])
    expect(r.mover.map(x => x.id)).toEqual(['l1'])
    expect(r.chocan.map(x => x.id)).toEqual(['l2'])
  })
  it('los que ya son del destino no se mueven ni cuentan como choque', () => {
    const r = particionarReasignacion([cand('l1', 'c1', 'destino')], 'destino', [slot('c1')])
    expect(r.yaEran.map(x => x.id)).toEqual(['l1'])
    expect(r.chocan).toEqual([])
  })
})
```

- [ ] **Step 4: Implementar `src/pages/crm/lib/reassignCollisions.ts`**

```ts
import type { CrmLead } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/lib/reassignCollisions.ts). Allá la casilla es
   (cliente, tipo, agente); acá el único es `crm_leads_client_assignee_active_uidx
   (client_id, assigned_to)`: el mismo cliente puede tener un lead por comercial, pero no dos del
   mismo. Esto es un AVISO, no la autoridad: entre que se pinta y se confirma, el destino puede
   crear el lead que falta. Quien decide es la base. */

export interface LeadSlot {
  clientId: string
}

export interface ReassignCandidate extends LeadSlot {
  id: string
  /** Ya formateado por la página: es lo que se lista en el cartel. */
  clientName: string
  assignedTo: string
}

export const findReassignCollisions = (candidates: ReassignCandidate[], targetSlots: LeadSlot[]): ReassignCandidate[] => {
  if (targetSlots.length === 0) return []
  const taken = new Set(targetSlots.map(s => s.clientId))
  return candidates.filter(c => taken.has(c.clientId))
}

/** Las casillas ocupadas del destino, sacadas de la lista que ya está en memoria: quien puede
 *  reasignar ahí tiene write, o sea que ve todos los leads de esa cartera. */
export function slotsDeCartera(leads: Pick<CrmLead, 'client_id' | 'assigned_to' | 'deleted_at'>[], userId: string): LeadSlot[] {
  return leads.filter(l => l.assigned_to === userId && l.deleted_at == null).map(l => ({ clientId: l.client_id }))
}

/**
 * Qué se manda y qué no. Se mandan SOLO los que no chocan: mandar uno que choca haría fallar
 * ese update, y cada choque sería un error en vez de un aviso. Dos del mismo cliente en el mismo
 * lote también chocan entre sí: el primero ocupa la casilla del segundo.
 */
export function particionarReasignacion(
  candidates: ReassignCandidate[], targetId: string, targetSlots: LeadSlot[],
): { mover: ReassignCandidate[]; chocan: ReassignCandidate[]; yaEran: ReassignCandidate[] } {
  const ocupadas = new Set(targetSlots.map(s => s.clientId))
  const mover: ReassignCandidate[] = [], chocan: ReassignCandidate[] = [], yaEran: ReassignCandidate[] = []
  for (const c of candidates) {
    if (c.assignedTo === targetId) { yaEran.push(c); continue }
    if (ocupadas.has(c.clientId)) { chocan.push(c); continue }
    ocupadas.add(c.clientId)
    mover.push(c)
  }
  return { mover, chocan, yaEran }
}
```

Ojo con el orden: `yaEran` se chequea ANTES que las casillas, porque el lead que ya es del destino
ocupa su propia casilla en `targetSlots` y si no se contaría como choque consigo mismo.

- [ ] **Step 5: Tests que fallan — `src/pages/crm/lib/errores.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { mensajeDeError, SIN_PERMISO } from './errores'

describe('mensajeDeError', () => {
  it('las claves de la RPC', () => {
    expect(mensajeDeError({ message: 'crm_lead_duplicado', code: 'P0001' })).toBe('Ese cliente ya tiene un lead con ese responsable.')
    expect(mensajeDeError({ message: 'crm_falta_contacto' })).toBe('Falta teléfono o email.')
    expect(mensajeDeError({ message: 'crm_sin_permiso_cartera', code: '42501' })).toBe(SIN_PERMISO)
  })
  it('un rechazo de RLS no se muestra crudo', () => {
    expect(mensajeDeError({ code: '42501', message: 'new row violates row-level security policy for table "crm_leads"' })).toBe(SIN_PERMISO)
  })
  it('un update que la RLS dejó en cero filas', () => {
    expect(mensajeDeError(new Error('crm_sin_fila'))).toBe(SIN_PERMISO)
  })
  it('el único cliente+responsable al reasignar', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "crm_leads_client_assignee_active_uidx"' }))
      .toBe('Ese responsable ya tiene un lead de ese cliente.')
  })
  it('email o teléfono repetido al editar un cliente', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "crm_clients_phone_active_uidx"' }))
      .toBe('Ya hay otro cliente con ese teléfono.')
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "crm_clients_email_active_uidx"' }))
      .toBe('Ya hay otro cliente con ese email.')
  })
  it('sin red', () => expect(mensajeDeError(new TypeError('Failed to fetch'))).toBe('No hay conexión. Probá de nuevo.'))
  it('lo desconocido no se muestra crudo', () => {
    expect(mensajeDeError({ message: 'syntax error at or near' })).toBe('Algo salió mal. Probá de nuevo.')
    expect(mensajeDeError(undefined, 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })
})
```

- [ ] **Step 6: Implementar `src/pages/crm/lib/errores.ts`**

```ts
/* Lo que la base contesta, dicho en castellano. El error crudo de Postgres no le sirve a nadie
   y a veces miente («violates row-level security» se lee como un bug y es un permiso). */

export const SIN_PERMISO = 'No tenés permiso sobre esa cartera.'

// Las claves de crm_create_lead_with_client (supabase/schema.sql) y la de `unaFila()` del servicio.
const CLAVES: Record<string, string> = {
  crm_sin_acceso: 'Tu cuenta no tiene acceso al CRM.',
  crm_sin_permiso_cartera: SIN_PERMISO,
  crm_falta_contacto: 'Falta teléfono o email.',
  crm_responsable_inactivo: 'Ese responsable ya no está activo.',
  crm_canal_invalido: 'Ese canal ya no existe. Recargá la página.',
  crm_etapa_invalida: 'Esa etapa ya no existe. Recargá la página.',
  crm_lead_duplicado: 'Ese cliente ya tiene un lead con ese responsable.',
  crm_sin_fila: SIN_PERMISO,
}

export function mensajeDeError(error: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  const e = (error ?? {}) as { message?: unknown; code?: unknown }
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  for (const [clave, texto] of Object.entries(CLAVES)) if (message.includes(clave)) return texto
  if (code === '42501' || /row-level security/i.test(message)) return SIN_PERMISO
  if (code === '23505') {
    if (message.includes('crm_clients_phone')) return 'Ya hay otro cliente con ese teléfono.'
    if (message.includes('crm_clients_email')) return 'Ya hay otro cliente con ese email.'
    return 'Ese responsable ya tiene un lead de ese cliente.'
  }
  if (error instanceof TypeError || /Failed to fetch|NetworkError|fetch failed/i.test(message)) {
    return 'No hay conexión. Probá de nuevo.'
  }
  return porDefecto
}
```

- [ ] **Step 7: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 8: Commit**

```bash
git add src/pages/crm/lib
git commit -m "feat(crm): permisos en pantalla, colisiones de reasignación y mensajes de error"
```

---

### Task 7: Servicio y hooks

**Files:**
- Create: `src/pages/crm/service/crm.service.ts`
- Create: `src/pages/crm/hooks/keys.ts`, `useCrmLeads.ts`, `useCrmCatalogos.ts`, `useCarteras.ts`,
  `useVisibleAgents.ts`, `useCrmRealtime.ts`, `useLeadDetalle.ts`, `useLeadMutaciones.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `useUserSession`, `useYo`, todo `lib/` (Tasks 4-6).
- Produces (las usan las Tasks 8-13):
  - servicio: `getLeads(): Promise<CrmLeadRow[]>`; `getCatalogos(): Promise<{ etapas: CrmStage[]; prioridades: CrmPriority[]; canales: CrmChannel[] }>`;
    `getUsuarios(): Promise<Usuario[]>`; `getAccesos(): Promise<CrmDataAccess[]>`;
    `getTareasPendientes(): Promise<CrmTask[]>`; `getReunionesEntre(desde: string, hasta: string): Promise<CrmMeeting[]>`;
    `getDetalleLead(leadId: string): Promise<LeadDetalle>`;
    `LeadPatch`, `updateLead(id, patch: LeadPatch): Promise<CrmLead>`;
    `ClientePatch`, `updateCliente(id, patch: ClientePatch): Promise<CrmClient>`;
    `crearComentario(input: { lead_id: string; description: string; comment_type?: 'MANUAL' | 'SYSTEM' }): Promise<CrmComment>`;
    `crearEventoGestion(input: { lead_id: string; action: ManagementAction; effective_at?: string; note?: string | null }): Promise<CrmManagementEvent>`;
    `crearTarea(input: { lead_id: string | null; title: string; due_date: string | null; assigned_to: string }): Promise<CrmTask>`;
    `TareaPatch`, `actualizarTarea(id, patch: TareaPatch): Promise<CrmTask>`;
    `ReunionNueva`, `crearReunion(input: ReunionNueva): Promise<CrmMeeting>`;
    `ReunionPatch`, `actualizarReunion(id, patch: ReunionPatch): Promise<CrmMeeting>`;
    `AltaLead`, `ResultadoAlta`, `crearLeadConCliente(input: AltaLead): Promise<ResultadoAlta>`;
    `reasignarLead(leadId: string, nuevo: string, comentario: string): Promise<void>`;
    `EtapaNueva`, `EtapaPatch`, `crearEtapa`, `actualizarEtapa`, `borrarEtapa`, `reordenarEtapas`;
    `crearPrioridad(input: { name: string; color: string; position: number }): Promise<CrmPriority>`, `actualizarPrioridad(id, patch: { name?: string; color?: string })`, `borrarPrioridad`, `reordenarPrioridades`;
    `crearCanal(input: { label: string; position: number }): Promise<CrmChannel>`, `actualizarCanal(id, patch: { label: string })`, `borrarCanal`, `reordenarCanales`;
    `setAcceso(viewerId: string, subjectId: string, access: NivelAcceso | null): Promise<void>`.
  - `CRM_KEYS` (ver código).
  - `useCrmLeads()`, `useTareasPendientes()`, `useReunionesDelMes()` (queries).
  - `useCrmCatalogos(): { etapasPorId, etapasActivas, prioridadesActivas, canalesActivos, descartada, isLoading, error }`.
  - `useCarteras(): { myId, yo, usuarios, accesos, visibles, conEscritura, esSuperadmin, puedeEscribir(owner), isLoading }`.
  - `useVisibleAgents(): ReturnType<typeof useCarteras> & { selectedIds: string[]; setSelectedIds(ids: string[]): void; canSeeOthers: boolean }`.
  - `useCrmRealtime(): void`.
  - `useLeadDetalle(leadId: string | null)`.
  - `useActualizarLead()`, `useActualizarCliente()`, `useMarcarGestion(leadId)`, `useDescartar()`,
    `useReasignar()`, `useCrearLead()`, `useMutacionDelDetalle(leadId, fn, opciones?)` (ver código).

- [ ] **Step 1: `src/pages/crm/service/crm.service.ts`**

```ts
import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import type { ManagementAction } from '../lib/gestionStatus'
import type { NivelAcceso } from '../lib/permisos'
import type {
  CrmChannel, CrmClient, CrmComment, CrmDataAccess, CrmLead, CrmLeadRow, CrmManagementEvent, CrmMeeting,
  CrmPriority, CrmStage, CrmTask, LeadDetalle, Usuario,
} from '../types'

/* Todas las queries y mutaciones del CRM contra las `crm_*`. Nada de permisos acá: la RLS ya
   recorta lo que cada uno lee, y rechaza lo que no puede escribir. */

/* Un update que la RLS frena NO falla: devuelve cero filas. Sin esto la mutación «salía bien» y
   el optimista quedaba mintiendo hasta el próximo refresco. `crm_sin_fila` lo traduce
   `mensajeDeError()` a «No tenés permiso sobre esa cartera». */
function unaFila<T>(data: T[] | null): T {
  const fila = data?.[0]
  if (!fila) throw new Error('crm_sin_fila')
  return fila
}

async function comprobar(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p
  if (error) throw error
}

// ---------- Lectura ----------
export async function getLeads(): Promise<CrmLeadRow[]> {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*, client:crm_clients(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CrmLeadRow[]
}

/** Con las borradas: un lead en una etapa borrada tiene que poder leer su nombre (ver etapaDelLead). */
export async function getCatalogos(): Promise<{ etapas: CrmStage[]; prioridades: CrmPriority[]; canales: CrmChannel[] }> {
  const [etapas, prioridades, canales] = await Promise.all([
    supabase.from('crm_funnel_stages').select('*').order('position'),
    supabase.from('crm_priorities').select('*').order('position'),
    supabase.from('crm_channels').select('*').order('position'),
  ])
  if (etapas.error) throw etapas.error
  if (prioridades.error) throw prioridades.error
  if (canales.error) throw canales.error
  return { etapas: etapas.data, prioridades: prioridades.data, canales: canales.data }
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('users').select('id, email, nombre, iniciales, color, rol, activo').order('nombre')
  if (error) throw error
  return data
}

export async function getAccesos(): Promise<CrmDataAccess[]> {
  const { data, error } = await supabase.from('crm_data_access').select('*')
  if (error) throw error
  return data
}

export async function getTareasPendientes(): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from('crm_tasks').select('*').eq('completed', false).is('deleted_at', null)
  if (error) throw error
  return data
}

export async function getReunionesEntre(desde: string, hasta: string): Promise<CrmMeeting[]> {
  const { data, error } = await supabase
    .from('crm_meetings').select('*').gte('starts_at', desde).lt('starts_at', hasta).is('deleted_at', null)
  if (error) throw error
  return data
}

/** Todo lo del lead, al abrir el dialog (el `getLeadDetail` del producto). */
export async function getDetalleLead(leadId: string): Promise<LeadDetalle> {
  const [tasks, comments, events, meetings, stageHistory, assignmentHistory] = await Promise.all([
    supabase.from('crm_tasks').select('*').eq('lead_id', leadId).is('deleted_at', null).order('due_date', { nullsFirst: false }),
    supabase.from('crm_comments').select('*').eq('lead_id', leadId).is('deleted_at', null).order('created_at'),
    supabase.from('crm_management_events').select('*').eq('lead_id', leadId).is('deleted_at', null).order('created_at'),
    supabase.from('crm_meetings').select('*').eq('lead_id', leadId).is('deleted_at', null).order('starts_at'),
    supabase.from('crm_stage_history').select('*').eq('lead_id', leadId).order('changed_at'),
    supabase.from('crm_assignment_history').select('*').eq('lead_id', leadId).order('changed_at'),
  ])
  for (const r of [tasks, comments, events, meetings, stageHistory, assignmentHistory]) if (r.error) throw r.error
  return {
    tasks: tasks.data ?? [], comments: comments.data ?? [], events: events.data ?? [],
    meetings: meetings.data ?? [], stageHistory: stageHistory.data ?? [], assignmentHistory: assignmentHistory.data ?? [],
  }
}

// ---------- Lead y cliente ----------
// `gestion_*` NO está: la escribe la base (crm_gestion_refresh). Tampoco los historiales.
export type LeadPatch = Pick<TablesUpdate<'crm_leads'>,
  'funnel_stage_id' | 'channel_id' | 'discard_reason' | 'assigned_to' | 'last_important_event_at'>

export async function updateLead(id: string, patch: LeadPatch): Promise<CrmLead> {
  const { data, error } = await supabase.from('crm_leads').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

export type ClientePatch = Pick<TablesUpdate<'crm_clients'>,
  'company_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'alternative_phone_1'
  | 'alternative_phone_1_note' | 'alternative_phone_2' | 'alternative_phone_2_note' | 'notes'>

export async function updateCliente(id: string, patch: ClientePatch): Promise<CrmClient> {
  const { data, error } = await supabase.from('crm_clients').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

// ---------- Actividad ----------
export async function crearComentario(input: { lead_id: string; description: string; comment_type?: 'MANUAL' | 'SYSTEM' }): Promise<CrmComment> {
  const { data, error } = await supabase.from('crm_comments')
    .insert({ lead_id: input.lead_id, description: input.description, comment_type: input.comment_type ?? 'MANUAL' })
    .select().single()
  if (error) throw error
  return data
}

export async function crearEventoGestion(input: {
  lead_id: string; action: ManagementAction; effective_at?: string; note?: string | null
}): Promise<CrmManagementEvent> {
  const { data, error } = await supabase.from('crm_management_events').insert(input).select().single()
  if (error) throw error
  return data
}

// ---------- Tareas y reuniones ----------
export async function crearTarea(input: { lead_id: string | null; title: string; due_date: string | null; assigned_to: string }): Promise<CrmTask> {
  const { data, error } = await supabase.from('crm_tasks').insert(input).select().single()
  if (error) throw error
  return data
}

export type TareaPatch = Pick<TablesUpdate<'crm_tasks'>, 'completed' | 'completed_at' | 'title' | 'due_date' | 'deleted_at'>

export async function actualizarTarea(id: string, patch: TareaPatch): Promise<CrmTask> {
  const { data, error } = await supabase.from('crm_tasks').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

export type ReunionNueva = Pick<TablesInsert<'crm_meetings'>, 'lead_id' | 'assigned_to' | 'starts_at' | 'ends_at' | 'title' | 'description'>

export async function crearReunion(input: ReunionNueva): Promise<CrmMeeting> {
  const { data, error } = await supabase.from('crm_meetings').insert(input).select().single()
  if (error) throw error
  return data
}

export type ReunionPatch = Pick<TablesUpdate<'crm_meetings'>, 'status' | 'cancel_reason' | 'starts_at' | 'ends_at' | 'title' | 'description'>

export async function actualizarReunion(id: string, patch: ReunionPatch): Promise<CrmMeeting> {
  const { data, error } = await supabase.from('crm_meetings').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

// ---------- Alta y reasignación ----------
export type AltaLead = {
  assignedTo: string
  /** 'YYYY-MM-DD' en la zona de quien carga (localTodayIso). */
  initialTaskDueDate: string
  companyName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  channelId: string | null
  funnelStageId: string | null
}
export type ResultadoAlta = { lead_id: string; client_id: string; client_reused: boolean }

export async function crearLeadConCliente(input: AltaLead): Promise<ResultadoAlta> {
  const { data, error } = await supabase.rpc('crm_create_lead_with_client', {
    p_assigned_to: input.assignedTo,
    p_initial_task_due_date: input.initialTaskDueDate,
    p_company_name: input.companyName,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email,
    p_phone: input.phone,
    // `undefined` y no null: los parámetros con default de la RPC salen opcionales en los tipos.
    p_channel_id: input.channelId ?? undefined,
    p_funnel_stage_id: input.funnelStageId ?? undefined,
  })
  if (error) throw error
  return data as unknown as ResultadoAlta
}

/**
 * De a uno y no un update en bloque: en bloque, un solo choque con el único cliente+responsable
 * aborta el lote entero. El historial lo escribe el trigger; el comentario SYSTEM lo dejamos
 * acá, como `reassign_leads` del producto. Va DESPUÉS del update: el comentario se escribe con
 * el lead ya en la cartera nueva, sobre la que quien reasigna tiene write.
 */
export async function reasignarLead(leadId: string, nuevo: string, comentario: string): Promise<void> {
  await updateLead(leadId, { assigned_to: nuevo, last_important_event_at: new Date().toISOString() })
  await crearComentario({ lead_id: leadId, description: comentario, comment_type: 'SYSTEM' })
}

// ---------- Catálogo (solo SUPERADMIN: la RLS lo exige) ----------
// Borrar es soft delete: la FK de los leads es `on delete set null` y un borrado duro dejaría
// a los leads de esa etapa sin etapa y sin rastro de dónde estaban.
const ahora = () => new Date().toISOString()

export type EtapaNueva = Pick<TablesInsert<'crm_funnel_stages'>,
  'label' | 'value' | 'position' | 'priority_id' | 'management_tolerance_hours' | 'allow_delete' | 'allow_reorder' | 'allow_rename' | 'is_out_of_funnel'>
export type EtapaPatch = Pick<TablesUpdate<'crm_funnel_stages'>, 'label' | 'priority_id' | 'management_tolerance_hours' | 'position'>

export async function crearEtapa(input: EtapaNueva): Promise<CrmStage> {
  const { data, error } = await supabase.from('crm_funnel_stages').insert(input).select().single()
  if (error) throw error
  return data
}
export async function actualizarEtapa(id: string, patch: EtapaPatch): Promise<void> {
  const { data, error } = await supabase.from('crm_funnel_stages').update(patch).eq('id', id).select()
  if (error) throw error
  unaFila(data)
}
export const borrarEtapa = (id: string) =>
  comprobar(supabase.from('crm_funnel_stages').update({ deleted_at: ahora() }).eq('id', id))
export const reordenarEtapas = async (items: { id: string; position: number }[]) => {
  await Promise.all(items.map(i => comprobar(supabase.from('crm_funnel_stages').update({ position: i.position }).eq('id', i.id))))
}

export async function crearPrioridad(input: { name: string; color: string; position: number }): Promise<CrmPriority> {
  const { data, error } = await supabase.from('crm_priorities').insert(input).select().single()
  if (error) throw error
  return data
}
export const actualizarPrioridad = (id: string, patch: { name?: string; color?: string }) =>
  comprobar(supabase.from('crm_priorities').update(patch).eq('id', id))
export const borrarPrioridad = (id: string) =>
  comprobar(supabase.from('crm_priorities').update({ deleted_at: ahora() }).eq('id', id))
export const reordenarPrioridades = async (items: { id: string; position: number }[]) => {
  await Promise.all(items.map(i => comprobar(supabase.from('crm_priorities').update({ position: i.position }).eq('id', i.id))))
}

export async function crearCanal(input: { label: string; position: number }): Promise<CrmChannel> {
  const { data, error } = await supabase.from('crm_channels').insert(input).select().single()
  if (error) throw error
  return data
}
export const actualizarCanal = (id: string, patch: { label: string }) =>
  comprobar(supabase.from('crm_channels').update(patch).eq('id', id))
export const borrarCanal = (id: string) =>
  comprobar(supabase.from('crm_channels').update({ deleted_at: ahora() }).eq('id', id))
export const reordenarCanales = async (items: { id: string; position: number }[]) => {
  await Promise.all(items.map(i => comprobar(supabase.from('crm_channels').update({ position: i.position }).eq('id', i.id))))
}

// ---------- Visibilidad (solo SUPERADMIN) ----------
/**
 * Un solo punto para las tres transiciones de una celda: null borra la fila (DELETE de verdad,
 * ver el comentario de la tabla), read/write la crean o la cambian.
 */
export async function setAcceso(viewerId: string, subjectId: string, access: NivelAcceso | null): Promise<void> {
  if (viewerId === subjectId) throw new Error('Nadie necesita permiso para ver su propia cartera.')
  if (access === null) {
    await comprobar(supabase.from('crm_data_access').delete().eq('viewer_id', viewerId).eq('subject_id', subjectId))
    return
  }
  await comprobar(supabase.from('crm_data_access')
    .upsert({ viewer_id: viewerId, subject_id: subjectId, access }, { onConflict: 'viewer_id,subject_id' }))
}
```

- [ ] **Step 2: `src/pages/crm/hooks/keys.ts`**

```ts
/* Todas las keys del CRM bajo ['crm', …]: el realtime y las mutaciones invalidan por prefijo, y
   Equipo comparte la cache con el CRM (mismas keys = una sola request). */
export const CRM_KEYS = {
  leads: ['crm', 'leads'] as const,
  catalogos: ['crm', 'catalogos'] as const,
  usuarios: ['crm', 'usuarios'] as const,
  accesos: ['crm', 'accesos'] as const,
  tareasPendientes: ['crm', 'tareas-pendientes'] as const,
  /** Prefijo de todos los detalles abiertos. */
  detalles: ['crm', 'lead'] as const,
  detalle: (leadId: string) => ['crm', 'lead', leadId] as const,
  reuniones: (desde: string) => ['crm', 'reuniones', desde] as const,
}
```

- [ ] **Step 3: `src/pages/crm/hooks/useCrmLeads.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { daysInMonth, periodBounds, startOfMonthIso } from '@/lib/calendarDate'
import { getLeads, getReunionesEntre, getTareasPendientes } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* La lista entera, una vez (decisión 4 de la spec): son decenas de leads, la RLS ya recortó, y
   filtros y contadores salen de funciones puras sobre este array. */
export function useCrmLeads() {
  return useQuery({ queryKey: CRM_KEYS.leads, queryFn: getLeads })
}

/** Las pendientes de todas las carteras que veo: marcan «tareas vencidas» en la lista y en Equipo. */
export function useTareasPendientes() {
  return useQuery({ queryKey: CRM_KEYS.tareasPendientes, queryFn: getTareasPendientes })
}

/** Las del mes calendario local en curso (Equipo › «reuniones este mes»). */
export function useReunionesDelMes() {
  const desde = startOfMonthIso()
  const { start, end } = periodBounds(desde, daysInMonth(desde))
  return useQuery({ queryKey: CRM_KEYS.reuniones(desde), queryFn: () => getReunionesEntre(start, end) })
}
```

- [ ] **Step 4: `src/pages/crm/hooks/useCrmCatalogos.ts`**

```ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { findDiscardedStage } from '../lib/discardStage'
import { catalogoDeEtapas, etapasVivas } from '../lib/effectiveStage'
import { getCatalogos } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* Etapas, prioridades y canales. `etapasPorId` trae también las borradas (para leer el nombre de
   la etapa de un lead viejo); todo lo que se OFRECE en un menú sale de las «activas». */
export function useCrmCatalogos() {
  const q = useQuery({ queryKey: CRM_KEYS.catalogos, queryFn: getCatalogos, staleTime: 5 * 60_000 })
  const etapasPorId = useMemo(
    () => catalogoDeEtapas(q.data?.etapas ?? [], q.data?.prioridades ?? []), [q.data])
  const etapasActivas = useMemo(() => etapasVivas(etapasPorId.values()), [etapasPorId])
  const prioridadesActivas = useMemo(
    () => (q.data?.prioridades ?? []).filter(p => p.deleted_at == null), [q.data])
  const canalesActivos = useMemo(
    () => (q.data?.canales ?? []).filter(c => c.deleted_at == null), [q.data])
  const descartada = useMemo(() => findDiscardedStage(etapasActivas) ?? null, [etapasActivas])
  return { etapasPorId, etapasActivas, prioridadesActivas, canalesActivos, descartada, isLoading: q.isLoading, error: q.error }
}
```

- [ ] **Step 5: `src/pages/crm/hooks/useCarteras.ts`**

```ts
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import {
  carterasConEscritura, carterasVisibles, esSuperadmin, puedeEscribir, type Acceso,
} from '../lib/permisos'
import { getAccesos, getUsuarios } from '../service/crm.service'
import type { Usuario } from '../types'
import { CRM_KEYS } from './keys'

// Vacíos estables: un `?? []` nuevo en cada render rompería los useMemo de abajo.
const SIN_USUARIOS: Usuario[] = []
const SIN_ACCESOS: Acceso[] = []

/* Quién puede mirar y escribir qué cartera. Es el `@/hooks/useVisibleAgents` del producto (la
   mitad compartida): lo usan el CRM y Equipo. La selección en la URL es de cada página y vive en
   `useVisibleAgents`. */
export function useCarteras() {
  const { userSession } = useUserSession()
  const myId = userSession?.user.id ?? null
  const { data: yo } = useYo(myId ?? undefined)
  const usuariosQ = useQuery({ queryKey: CRM_KEYS.usuarios, queryFn: getUsuarios, staleTime: 5 * 60_000 })
  const accesosQ = useQuery({ queryKey: CRM_KEYS.accesos, queryFn: getAccesos })
  const usuarios = usuariosQ.data ?? SIN_USUARIOS
  const accesos = accesosQ.data ?? SIN_ACCESOS

  const visibles = useMemo(() => carterasVisibles(yo, usuarios, accesos), [yo, usuarios, accesos])
  const conEscritura = useMemo(() => carterasConEscritura(yo, usuarios, accesos), [yo, usuarios, accesos])
  const puedeEscribirEn = useCallback((owner: string) => puedeEscribir(yo, owner, accesos), [yo, accesos])

  return {
    myId,
    yo: yo ?? null,
    usuarios,
    accesos,
    visibles,
    conEscritura,
    esSuperadmin: esSuperadmin(yo),
    puedeEscribir: puedeEscribirEn,
    isLoading: usuariosQ.isLoading || accesosQ.isLoading || !yo,
  }
}
```

- [ ] **Step 6: `src/pages/crm/hooks/useVisibleAgents.ts`** — copia de
  `$PRODUCTO/src/pages/leads/hooks/useVisibleAgents.ts` con estos cambios: el núcleo es
  `useCarteras()` y no `@/hooks/useVisibleAgents`; el parámetro es `OWNERS_PARAM` (`owners`, el que
  nombra la spec) y no `agents`; mientras las carteras cargan, los ids de la URL se respetan tal
  cual (si no, un enlace de Equipo a `?owners=<otro>` caería un instante a «mis leads»).

```ts
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OWNERS_PARAM } from '../lib/leadFilterParams'
import { useCarteras } from './useCarteras'

/**
 * Qué carteras está mirando la lista. La selección vive en la URL (`?owners=`) porque la
 * consumen dos árboles que no se tocan —el botón de la cabecera y la lista— y porque un enlace
 * desde Equipo tiene que llegar con la cartera puesta. Ausente = la propia: la URL limpia y la de
 * mi cartera son la misma cosa, y compartir un enlace no arrastra la cartera de otro.
 */
export function useVisibleAgents() {
  const carteras = useCarteras()
  const { myId, visibles, isLoading } = carteras
  const [searchParams, setSearchParams] = useSearchParams()

  /* Ordenados (el mismo par en otro orden sería otra URL) y filtrados contra lo permitido: un id
     pegado a mano no abre la cartera de nadie. Mientras los permisos cargan no se filtra —todo
     id ajeno parecería prohibido y el enlace caería a mi cartera—; la RLS igual recorta. */
  const selectedIds = useMemo(() => {
    if (!myId) return []
    const fromUrl = (searchParams.get(OWNERS_PARAM) ?? '').split(',').filter(Boolean)
    const allowed = new Set(visibles.map(u => u.id))
    const validos = isLoading ? fromUrl : fromUrl.filter(id => allowed.has(id))
    return validos.length > 0 ? [...new Set(validos)].sort() : [myId]
  }, [searchParams, myId, visibles, isLoading])

  const setSelectedIds = useCallback((ids: string[]) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      const isDefault = ids.length === 0 || (ids.length === 1 && ids[0] === myId)
      if (isDefault) params.delete(OWNERS_PARAM)
      else params.set(OWNERS_PARAM, [...ids].sort().join(','))
      return params
    }, { replace: true })
  }, [setSearchParams, myId])

  return { ...carteras, selectedIds, setSelectedIds, canSeeOthers: visibles.length > 1 }
}
```

- [ ] **Step 7: `src/pages/crm/hooks/useCrmRealtime.ts`**

```ts
import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CRM_KEYS } from './keys'

/* Un canal para todas las tablas publicadas del CRM. No aplica el cambio: invalida la query que
   corresponde y TanStack re-trae. Un eco de lo propio re-trae lo mismo que la mutación ya puso,
   y no pisa nada porque los campos de texto guardan al salir (blur), como en el producto.
   Realtime aplica la RLS: a cada uno le llega solo lo que ve. */
const TABLAS: Record<string, QueryKey[]> = {
  crm_leads: [CRM_KEYS.leads, CRM_KEYS.detalles],
  crm_clients: [CRM_KEYS.leads],
  crm_tasks: [CRM_KEYS.tareasPendientes, CRM_KEYS.detalles],
  crm_comments: [CRM_KEYS.detalles],
  crm_management_events: [CRM_KEYS.detalles],
  crm_meetings: [CRM_KEYS.detalles, ['crm', 'reuniones']],
  // Te dieron o te sacaron acceso: cambian las carteras Y lo que la RLS te deja leer.
  crm_data_access: [CRM_KEYS.accesos, CRM_KEYS.leads, CRM_KEYS.tareasPendientes],
}

export function useCrmRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const canal = supabase.channel('crm')
    for (const [tabla, keys] of Object.entries(TABLAS)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => {
        for (const queryKey of keys) void qc.invalidateQueries({ queryKey })
      })
    }
    canal.subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [qc])
}
```

- [ ] **Step 8: `src/pages/crm/hooks/useLeadDetalle.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { getDetalleLead } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/** Se pide al abrir el dialog y no con la lista: son seis consultas por lead. */
export function useLeadDetalle(leadId: string | null) {
  return useQuery({
    queryKey: CRM_KEYS.detalle(leadId ?? ''),
    queryFn: () => getDetalleLead(leadId!),
    enabled: !!leadId,
  })
}
```

- [ ] **Step 9: `src/pages/crm/hooks/useLeadMutaciones.ts`**

```ts
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensajeDeError } from '../lib/errores'
import { aplicarGestionOptimista, type ManagementAction } from '../lib/gestionStatus'
import { comentarioDescarte, comentarioReasignacion } from '../lib/systemComment'
import {
  crearComentario, crearEventoGestion, crearLeadConCliente, reasignarLead, updateCliente, updateLead,
  type AltaLead, type ClientePatch, type LeadPatch,
} from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle, Usuario } from '../types'
import { CRM_KEYS } from './keys'

/* El «optimista + revertir + aviso» del tablero, dicho en TanStack Query: onMutate aplica en la
   cache, onError vuelve atrás y avisa con el motivo traducido, onSettled re-trae. */

async function optimistaSobreLeads(qc: QueryClient, cambio: (l: CrmLeadRow) => CrmLeadRow, ids: Set<string>) {
  await qc.cancelQueries({ queryKey: CRM_KEYS.leads })
  const previo = qc.getQueryData<CrmLeadRow[]>(CRM_KEYS.leads)
  qc.setQueryData<CrmLeadRow[]>(CRM_KEYS.leads, old => old?.map(l => (ids.has(l.id) ? cambio(l) : l)))
  return { previo }
}

function revertir(qc: QueryClient, previo: CrmLeadRow[] | undefined) {
  if (previo) qc.setQueryData(CRM_KEYS.leads, previo)
}

const refrescar = (qc: QueryClient, leadId?: string) => {
  void qc.invalidateQueries({ queryKey: CRM_KEYS.leads })
  void qc.invalidateQueries({ queryKey: leadId ? CRM_KEYS.detalle(leadId) : CRM_KEYS.detalles })
}

export function useActualizarLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LeadPatch }) => updateLead(id, patch),
    onMutate: ({ id, patch }) => optimistaSobreLeads(qc, l => ({ ...l, ...patch }), new Set([id])),
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error)) },
    onSettled: (_d, _e, { id }) => refrescar(qc, id),
  })
}

export function useActualizarCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, patch }: { clientId: string; patch: ClientePatch }) => updateCliente(clientId, patch),
    onMutate: async ({ clientId, patch }) => {
      await qc.cancelQueries({ queryKey: CRM_KEYS.leads })
      const previo = qc.getQueryData<CrmLeadRow[]>(CRM_KEYS.leads)
      // Un cliente puede colgar de varios leads (uno por cartera): se cambia en todos.
      qc.setQueryData<CrmLeadRow[]>(CRM_KEYS.leads, old => old?.map(l =>
        l.client?.id === clientId ? { ...l, client: { ...l.client, ...patch } } : l))
      return { previo }
    },
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error)) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.leads }) },
  })
}

export function useMarcarGestion(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { action: ManagementAction; effective_at?: string; note?: string | null }) =>
      crearEventoGestion({ lead_id: leadId, ...p }),
    onMutate: p => optimistaSobreLeads(
      qc,
      l => aplicarGestionOptimista(l, { action: p.action, effective_at: p.effective_at ?? new Date().toISOString() }),
      new Set([leadId]),
    ),
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error, 'No se pudo registrar la gestión')) },
    onSuccess: (_d, p) => toast.success(p.action === 'POSTPONED' ? 'Gestión pospuesta' : 'Gestión registrada'),
    onSettled: () => refrescar(qc, leadId),
  })
}

export function useDescartar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leadId, etapaId, motivo }: { leadId: string; etapaId: string; motivo: string | null }) => {
      await updateLead(leadId, { funnel_stage_id: etapaId, discard_reason: motivo })
      await crearComentario({ lead_id: leadId, description: comentarioDescarte(motivo), comment_type: 'SYSTEM' })
    },
    onMutate: ({ leadId, etapaId, motivo }) =>
      optimistaSobreLeads(qc, l => ({ ...l, funnel_stage_id: etapaId, discard_reason: motivo }), new Set([leadId])),
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error, 'No se pudo descartar el lead')) },
    onSuccess: () => toast.success('Lead descartado'),
    onSettled: (_d, _e, { leadId }) => refrescar(qc, leadId),
  })
}

export type ItemReasignacion = { leadId: string; deNombre: string }

/** Reasigna de a uno (ver `reasignarLead`) y junta lo que falló en vez de cortar en el primero. */
export function useReasignar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, nuevo }: { items: ItemReasignacion[]; nuevo: Usuario }) => {
      const fallidos: { leadId: string; error: unknown }[] = []
      for (const item of items) {
        try {
          await reasignarLead(item.leadId, nuevo.id, comentarioReasignacion(item.deNombre, nuevo.nombre))
        } catch (error) {
          fallidos.push({ leadId: item.leadId, error })
        }
      }
      return { movidos: items.length - fallidos.length, fallidos }
    },
    onMutate: ({ items, nuevo }) =>
      optimistaSobreLeads(qc, l => ({ ...l, assigned_to: nuevo.id }), new Set(items.map(i => i.leadId))),
    onSuccess: ({ movidos, fallidos }, { nuevo }, ctx) => {
      if (movidos > 0) toast.success(movidos === 1 ? `Lead reasignado a ${nuevo.nombre}` : `${movidos} leads reasignados a ${nuevo.nombre}`)
      if (fallidos.length > 0) {
        // Los que fallaron vuelven a su lugar con el refresco; el revert entero taparía los que sí se movieron.
        toast.error(`${fallidos.length} no se ${fallidos.length === 1 ? 'pudo' : 'pudieron'} reasignar: ${mensajeDeError(fallidos[0].error)}`)
        if (movidos === 0) revertir(qc, ctx?.previo)
      }
    },
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error)) },
    onSettled: () => {
      refrescar(qc)
      void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
    },
  })
}

/** Sin toast de error: el dialog de alta lo muestra adentro, al lado del campo. */
export function useCrearLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AltaLead) => crearLeadConCliente(input),
    onSuccess: r => toast.success(r.client_reused ? 'Lead creado. El cliente ya existía y se reutilizó.' : 'Lead creado'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CRM_KEYS.leads })
      void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
    },
  })
}

/**
 * Mutaciones de lo que cuelga del lead (tareas, reuniones, comentarios). `optimista` aplica el
 * cambio sobre el detalle en cache antes de que conteste la base.
 */
export function useMutacionDelDetalle<TVars, TData>(
  leadId: string,
  fn: (vars: TVars) => Promise<TData>,
  opciones: { exito?: string; optimista?: (d: LeadDetalle, vars: TVars) => LeadDetalle } = {},
) {
  const qc = useQueryClient()
  const key = CRM_KEYS.detalle(leadId)
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars: TVars) => {
      if (!opciones.optimista) return { previo: undefined }
      await qc.cancelQueries({ queryKey: key })
      const previo = qc.getQueryData<LeadDetalle>(key)
      if (previo) qc.setQueryData<LeadDetalle>(key, opciones.optimista(previo, vars))
      return { previo }
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previo) qc.setQueryData(key, ctx.previo)
      toast.error(mensajeDeError(error))
    },
    onSuccess: () => { if (opciones.exito) toast.success(opciones.exito) },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
      void qc.invalidateQueries({ queryKey: ['crm', 'reuniones'] })
    },
  })
}
```

- [ ] **Step 10: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`. Si `supabase.rpc('crm_create_lead_with_client', …)` no tipa, es que la Task 3
no regeneró los tipos: volver ahí, no castear para esquivarlo.

- [ ] **Step 11: Commit**

```bash
git add src/pages/crm/service src/pages/crm/hooks
git commit -m "feat(crm): servicio contra las crm_* y hooks de datos, carteras, realtime y mutaciones"
```

---

### Task 8: La lista del CRM — página, filtros, renglones y tarjetas

**Files:**
- Create: `src/components/AvatarUsuario.tsx`
- Create: `src/pages/crm/lib/leadCellFormat.ts`
- Create: `src/pages/crm/components/leadCells.tsx`, `AgentFilterButton.tsx`, `FiltrosCrm.tsx`, `CrmLeadList.tsx`
- Modify: `src/pages/crm/Crm.tsx` (reemplaza el placeholder entero)

**Interfaces:**
- Consumes: Tasks 4-7.
- Produces:
  - `AvatarUsuario({ usuario, size?: 'sm' | 'md', anillo?: boolean, className? })`.
  - `leadCellFormat.ts`: `fmtIngresoDate(iso)`, `fmtShortDate(iso)`, `fmtDueDate(dateStr)`.
  - `leadCells.tsx`: `StageBadge({ etapa: EtapaConPrioridad | null })`, `PostponePopover({ onPostpone(effectiveAt, note?), pending, postponed, trigger?, tooltipLabel? })`,
    `GestionBadge({ status, onConfirm, pending })`, `AgendaIcon({ overdueTasks })`,
    `GestionCell({ lead, toleranceHours, overdueTasks, puedeEscribir, now })`.
  - `AgentFilterButton()`; `FiltrosCrm(props)` (ver código).
  - `CrmLeadList()` con `LeadRow`/`LeadCard` internos que aceptan `acciones?: ReactNode` y
    `seleccion?: { marcado: boolean; onToggle: () => void }` (los usan las Tasks 10 y 11).
  - Abrir un lead escribe `?lead=<id>` (`LEAD_PARAM`); el dialog que lo lee llega en la Task 10.

**Qué se copia de dónde:**
- `leadCellFormat.ts` ← `$PRODUCTO/src/pages/leads/lib/leadCellFormat.ts`, tal cual.
- `leadCells.tsx` ← `$PRODUCTO/src/pages/leads/components/leadCells.tsx`: se **quedan**
  `StageBadge`, `GestionBadge`, `PostponePopover` y `AgendaIcon` tal cual, salvo: `StageBadge`
  recibe la etapa resuelta y pinta un punto con el color de la prioridad; `OverdueTask` pasa a
  `Pick<CrmTask, 'id' | 'title' | 'due_date'>`. Se **borran** `BriefingCell`, `formatBudgetCompact`,
  `briefingSpec*` (inmobiliario) y el ícono de laboratorio de `GestionCell` (solo en DEV). Se
  **reescribe** `GestionCell` sobre `useMarcarGestion` y `gestionDeLead` (sin `freezeLead` ni las
  listas paginadas del producto).
- `AgentFilterButton.tsx` ← `$PRODUCTO/src/pages/leads/components/AgentFilterButton.tsx`:
  `OwnerAvatar` → `AvatarUsuario`, `displayName(x)` → `x.nombre`, opciones = `visibles`.
- `CrmLeadList.tsx` y `FiltrosCrm.tsx` se escriben de nuevo (decisión 1 de la spec: `LeadList.tsx`
  del producto son 2.000 líneas de virtualización y paginado, y `LeadFiltersV9.tsx` 1.500 de
  filtros inmobiliarios), con el mismo aspecto: renglón con riel a la izquierda, cabecera de 12px
  en mayúsculas, badges de gestión verde/rojo, tarjetas en el teléfono.

- [ ] **Step 1: `src/components/AvatarUsuario.tsx`**

```tsx
import { cn } from '@/lib/utils'
import type { Usuario } from '@/pages/crm/types'

const SIZES = { sm: 'size-7 text-[11px]', md: 'size-9 text-[13px]' } as const

/* Quién es dueño de algo, en un círculo con sus iniciales. El `OwnerAvatar` del producto es
   neutro a propósito; acá cada persona YA tiene su color en `users` y el tablero lo usa hace
   meses (barra lateral, avatares de la lista), así que el CRM lo respeta: es el mismo dato en
   todo el sistema. El nombre completo va en el `title` y el `aria-label`. */
export function AvatarUsuario({ usuario, size = 'sm', anillo = false, className }: {
  usuario: Pick<Usuario, 'nombre' | 'iniciales' | 'color'> | null | undefined
  size?: keyof typeof SIZES
  /** «Este es mío»: solo tiene algo que decir cuando hay más de una cartera en pantalla. */
  anillo?: boolean
  className?: string
}) {
  const label = usuario ? `Responsable: ${usuario.nombre}` : 'Sin responsable'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white',
        SIZES[size],
        anillo && 'outline-2 outline-offset-[1.5px] outline-(--brand)',
        className,
      )}
      style={{ background: usuario?.color ?? 'var(--muted-foreground)' }}
    >
      <span aria-hidden>{usuario?.iniciales ?? '·'}</span>
    </span>
  )
}
```

- [ ] **Step 2: `leadCellFormat.ts`** — copiar tal cual de
  `$PRODUCTO/src/pages/leads/lib/leadCellFormat.ts` a `src/pages/crm/lib/leadCellFormat.ts`.
  Agregar arriba: `// Copiado tal cual de propelia-frontend (src/pages/leads/lib/leadCellFormat.ts).`

- [ ] **Step 3: `src/pages/crm/components/leadCells.tsx`** — copiar
  `$PRODUCTO/src/pages/leads/components/leadCells.tsx` y dejarlo así (lo copiado sin cambios se
  marca; lo demás es el código final):

```tsx
/**
 * Celdas del renglón de lead. Copiado de propelia-frontend (src/pages/leads/components/leadCells.tsx)
 * sin lo inmobiliario (BriefingCell). Viven aparte de la lista porque el dialog del lead usa las
 * mismas (etapa y gestión se leen igual en los dos lados).
 */
import { useState } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DatePickerCalendar } from '@/components/ui/date-picker-calendar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { gestionDeLead, type GestionStatus } from '../lib/gestionStatus'
import { fmtDueDate } from '../lib/leadCellFormat'
import { useMarcarGestion } from '../hooks/useLeadMutaciones'
import type { CrmLeadRow, CrmTask, EtapaConPrioridad } from '../types'

export type OverdueTask = Pick<CrmTask, 'id' | 'title' | 'due_date'>

/** La etapa con el color de su prioridad: la prioridad cuelga de la etapa (`crm_leads` no tiene propia). */
export function StageBadge({ etapa }: { etapa: EtapaConPrioridad | null }) {
  if (!etapa) return <span className="text-xs text-(--fg-faint)">Sin etapa</span>
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 text-[11px] font-semibold py-[3px] px-[9px] bg-(--surface-3) text-foreground [border:0.5px_solid_var(--line)]"
      title={etapa.priority ? `Prioridad: ${etapa.priority.name}` : 'Sin prioridad'}
    >
      <span aria-hidden className="size-[7px] rounded-full" style={{ background: etapa.priority?.color ?? 'var(--line-strong)' }} />
      {etapa.label}
    </Badge>
  )
}
```

A continuación, **sin cambios** respecto del producto: `function GestionBadge(...)` (exportarla:
`export function GestionBadge`), `export function PostponePopover(...)` y
`export function AgendaIcon(...)`. Después, en lugar del `GestionCell` del producto:

```tsx
export function GestionCell({ lead, toleranceHours, overdueTasks, puedeEscribir, now }: {
  lead: CrmLeadRow
  toleranceHours: number | null | undefined
  overdueTasks: OverdueTask[]
  /** Sin write sobre la cartera el badge se ve pero no se toca: la base lo rechazaría igual. */
  puedeEscribir: boolean
  now: number
}) {
  const mark = useMarcarGestion(lead.id)
  const status: GestionStatus = gestionDeLead(lead, toleranceHours, now)
  return (
    <div className="flex items-center gap-1" data-row-actions>
      <GestionBadge status={status} onConfirm={() => mark.mutate({ action: 'MANUAL' })} pending={mark.isPending || !puedeEscribir} />
      {puedeEscribir && (
        <PostponePopover
          onPostpone={(effectiveAt, note) => mark.mutate({ action: 'POSTPONED', effective_at: effectiveAt, note: note ?? null })}
          pending={mark.isPending}
          postponed={status.postponed}
        />
      )}
      <AgendaIcon overdueTasks={overdueTasks} />
    </div>
  )
}
```
Verificar que no quedó nada del producto: `rg -n "leads.service|freezeLead|leadListQueryKeys|Briefing|FlaskConical|customIcons" src/pages/crm/components/leadCells.tsx` → nada.
Los imports que ya no se usan (`useMutation`, `ArrowUpDown`, `Bath`, …) se borran: `noUnusedLocals` los marca.

- [ ] **Step 4: `src/pages/crm/components/AgentFilterButton.tsx`**

```tsx
import { UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { useVisibleAgents } from '../hooks/useVisibleAgents'

/**
 * Selector de cartera. Copiado de propelia-frontend (src/pages/leads/components/AgentFilterButton.tsx).
 * Solo aparece si podés ver a alguien más: un desplegable de una sola opción es ruido que además
 * sugiere un permiso que no existe (un SDR sin accesos no lo ve).
 */
export function AgentFilterButton() {
  const { myId, visibles, selectedIds, setSelectedIds, canSeeOthers } = useVisibleAgents()
  if (!myId || !canSeeOthers) return null

  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(s => s !== id) : [...selectedIds, id]
    // Nunca cero: la lista quedaría vacía y el filtro que la vació está escondido acá adentro.
    if (next.length === 0) return
    setSelectedIds(next)
  }

  const label = selectedIds.length === 1
    ? (visibles.find(u => u.id === selectedIds[0])?.nombre ?? 'Mis leads')
    : `${selectedIds.length} carteras`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <Icon icon={UsersIcon} size="xs" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Ver leads de</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibles.map(u => (
          <DropdownMenuCheckboxItem
            key={u.id}
            className="text-xs"
            checked={selectedIds.includes(u.id)}
            // Sin esto el menú se cierra en cada clic y marcar dos carteras obliga a abrirlo dos veces.
            onSelect={e => e.preventDefault()}
            onCheckedChange={() => toggle(u.id)}
          >
            <AvatarUsuario usuario={u} className="mr-1" />
            {u.nombre}
            {u.id === myId && <span className="ml-1 text-(--fg-muted)">(vos)</span>}
            {!u.activo && <span className="ml-1 text-(--fg-muted)">(inactivo)</span>}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 5: `src/pages/crm/components/FiltrosCrm.tsx`**

```tsx
import { ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { LeadListCounters } from '../lib/computeLeadListCounters'
import type { GestionKey } from '../lib/gestionStatus'
import { GESTION_KEYS, soloGestion } from '../lib/leadFilterParams'
import { PRIORITY_NONE, type LeadFilterState } from '../lib/leadFilters'
import type { CrmPriority, EtapaConPrioridad } from '../types'

type Pestaña = 'todos' | GestionKey

const PESTAÑAS: { id: Pestaña; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'gestionado', label: 'Al día' },
  { id: 'pospuesto', label: 'Pospuestos' },
]

// Qué pestaña corresponde a lo excluido en la URL. Una combinación que no es ninguna (alguien
// editó la URL a mano) deja las cuatro apagadas en vez de mentir con una.
function pestañaDe(excluidos: Set<GestionKey>): Pestaña | null {
  if (excluidos.size === 0) return 'todos'
  return GESTION_KEYS.find(k => {
    const solo = soloGestion(k)
    return solo.size === excluidos.size && [...solo].every(x => excluidos.has(x))
  }) ?? null
}

const chip = (activo: boolean) => cn(
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
  activo
    ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)

/**
 * Buscador, pestañas de gestión y chips. Todo vive en la URL (lo escribe `escribirFiltros`): la
 * lista, un enlace de Equipo y el botón «atrás» dicen lo mismo. Cada número es «cuántos quedarían
 * si prendo esto», de `computeLeadListCounters`.
 */
export function FiltrosCrm({ filtros, contadores, etapas, prioridades, onCambiar, onLimpiar }: {
  filtros: LeadFilterState
  contadores: LeadListCounters
  etapas: EtapaConPrioridad[]
  prioridades: CrmPriority[]
  onCambiar: (patch: Partial<LeadFilterState>) => void
  onLimpiar: () => void
}) {
  const activa = pestañaDe(filtros.gestionExcluded)
  const cuenta: Record<Pestaña, number> = {
    todos: contadores.gestionTotal,
    pendiente: contadores.pendienteCount,
    gestionado: contadores.gestionadoCount,
    pospuesto: contadores.pospuestoCount,
  }
  const hayFiltros = filtros.q.trim() !== '' || filtros.stageFilter.size > 0 || filtros.gestionExcluded.size > 0
    || filtros.overdueOnly || filtros.includeDiscarded || filtros.excludedPriorities.size > 0

  const alternar = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-2 max-md:px-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative block w-72 max-md:w-full">
          <Icon icon={Search} size="sm" className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-(--fg-muted)" />
          <input
            type="text"
            value={filtros.q}
            onChange={e => onCambiar({ q: e.target.value })}
            placeholder="Buscar por empresa, contacto, teléfono o email…"
            aria-label="Buscar por empresa, contacto, teléfono o email"
            // 16px en el teléfono: abajo de eso el navegador hace zoom al tocar el campo.
            className="h-9 w-full rounded-lg bg-(--surface) pl-[32px] pr-3 text-[13px] text-foreground outline-none transition-colors [border:1px_solid_var(--line-strong)] placeholder:text-(--fg-muted) focus:[border-color:var(--brand)] max-md:text-[16px]"
          />
        </span>

        <div role="tablist" aria-label="Estado de gestión" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          {PESTAÑAS.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa === p.id}
              onClick={() => onCambiar({ gestionExcluded: p.id === 'todos' ? new Set() : soloGestion(p.id) })}
              className={cn(
                'h-8 cursor-pointer rounded-md px-3 text-[12.5px] transition-colors',
                activa === p.id ? 'bg-card font-semibold text-foreground shadow-xs' : 'text-(--fg-2) hover:text-foreground',
              )}
            >
              {p.label} <span className="tabular-nums text-(--fg-muted)">{cuenta[p.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chip(filtros.stageFilter.size > 0)}>
              Etapa{filtros.stageFilter.size > 0 && ` (${filtros.stageFilter.size})`}
              <Icon icon={ChevronDown} size="xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {etapas.map(e => (
              <DropdownMenuCheckboxItem
                key={e.id}
                className="text-xs"
                checked={filtros.stageFilter.has(e.id)}
                onSelect={ev => ev.preventDefault()}
                onCheckedChange={() => onCambiar({ stageFilter: alternar(filtros.stageFilter, e.id) })}
              >
                <span className="size-[7px] rounded-full" style={{ background: e.priority?.color ?? 'var(--line-strong)' }} />
                <span className="flex-1">{e.label}</span>
                <span className="tabular-nums text-(--fg-muted)">{contadores.stageCount(e.id)}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chip(filtros.excludedPriorities.size > 0)}>
              Prioridad{filtros.excludedPriorities.size > 0 && ' (filtrada)'}
              <Icon icon={ChevronDown} size="xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {[...prioridades.map(p => ({ id: p.id, name: p.name, color: p.color })),
              { id: PRIORITY_NONE, name: 'Sin prioridad', color: 'var(--line-strong)' }].map(p => (
              <DropdownMenuCheckboxItem
                key={p.id}
                className="text-xs"
                // Marcada = se ve. En la URL viaja la lista de EXCLUIDAS, como en el producto.
                checked={!filtros.excludedPriorities.has(p.id)}
                onSelect={ev => ev.preventDefault()}
                onCheckedChange={() => onCambiar({ excludedPriorities: alternar(filtros.excludedPriorities, p.id) })}
              >
                <span className="size-[7px] rounded-full" style={{ background: p.color }} />
                <span className="flex-1">{p.name}</span>
                <span className="tabular-nums text-(--fg-muted)">{contadores.priorityCount(p.id)}</span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              className="text-xs"
              checked={filtros.excludedPriorities.size === 0}
              onCheckedChange={() => onCambiar({ excludedPriorities: new Set() })}
            >
              Todas
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" aria-pressed={filtros.overdueOnly} className={chip(filtros.overdueOnly)}
          onClick={() => onCambiar({ overdueOnly: !filtros.overdueOnly })}>
          Tareas vencidas <span className="tabular-nums">{contadores.overdueLeadCount}</span>
        </button>

        <button type="button" aria-pressed={filtros.includeDiscarded} className={chip(filtros.includeDiscarded)}
          onClick={() => onCambiar({ includeDiscarded: !filtros.includeDiscarded })}>
          Incluir descartados <span className="tabular-nums">{contadores.discardedCount}</span>
        </button>

        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            <Icon icon={X} size="xs" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: `src/pages/crm/components/CrmLeadList.tsx`**

```tsx
import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCw } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { useIsMobile } from '@/hooks/use-mobile'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { contactoDelCliente, nombreDelLead } from '../lib/clientData'
import { computeLeadListCounters } from '../lib/computeLeadListCounters'
import { etapaDelLead } from '../lib/effectiveStage'
import { estadoDeLista } from '../lib/estadoDeLista'
import { fmtIngresoDate, fmtShortDate } from '../lib/leadCellFormat'
import {
  deleteLeadFilterParams, escribirFiltros, filtrosDesdeUrl, formatFilterList, LEAD_FILTER_PARAMS_WITH_QUERY, LEAD_PARAM,
} from '../lib/leadFilterParams'
import { filterLeads, leadsDeCarteras, type LeadFilterContext, type LeadFilterState } from '../lib/leadFilters'
import { idsConTareasVencidas, tareasVencidasPorLead } from '../lib/tareas'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrmLeads, useTareasPendientes } from '../hooks/useCrmLeads'
import { useVisibleAgents } from '../hooks/useVisibleAgents'
import type { CrmLeadRow, CrmTask, EtapaConPrioridad, Usuario } from '../types'
import { FiltrosCrm } from './FiltrosCrm'
import { GestionCell, StageBadge } from './leadCells'

const SIN_TAREAS: CrmTask[] = []

type RenglonProps = {
  lead: CrmLeadRow
  etapa: EtapaConPrioridad | null
  responsable: Usuario | undefined
  /** El anillo de «es mío» solo dice algo con más de una cartera en pantalla. */
  esMio: boolean | null
  vencidas: CrmTask[]
  puedeEscribir: boolean
  now: number
  onAbrir: (leadId: string) => void
  /** El menú de acciones del renglón (Task 10). */
  acciones?: ReactNode
  /** Modo selección para reasignar en lote (Task 11): el riel se vuelve casilla. */
  seleccion?: { marcado: boolean; onToggle: () => void }
}

// Los portales (popovers, menús) burbujean por el árbol de React aunque su DOM viva afuera: sin
// este corte, un clic adentro del menú de posponer abriría el lead. Y la casilla de selección
// vive adentro de un `data-row-actions`: su clic lo atiende ella, no el renglón (si no, marcaría
// y desmarcaría en el mismo clic).
function clicDelRenglon(e: React.MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement
  return e.currentTarget.contains(target) && !target.closest('[data-row-actions]')
}

function LeadRow({ lead, etapa, responsable, esMio, vencidas, puedeEscribir, now, onAbrir, acciones, seleccion }: RenglonProps) {
  const contacto = contactoDelCliente(lead.client)
  return (
    <tr
      onClick={e => {
        if (!clicDelRenglon(e)) return
        if (seleccion) seleccion.onToggle()
        else onAbrir(lead.id)
      }}
      className="cursor-pointer transition-colors [border-bottom:1px_solid_var(--line-soft)] hover:bg-secondary/40"
    >
      <td className={cn(seleccion ? 'px-3.5 py-[11px]' : 'p-0')} data-row-actions>
        {seleccion ? (
          <Checkbox checked={seleccion.marcado} onCheckedChange={seleccion.onToggle} aria-label="Seleccionar lead" />
        ) : (
          <span aria-hidden className="block h-[44px] w-[4px] rounded-r-[3px]" style={{ background: 'var(--line-soft)' }} />
        )}
      </td>
      <td className="whitespace-nowrap px-[18px] py-[11px] text-[13.5px] font-medium tabular-nums text-(--fg-2)">
        {fmtIngresoDate(lead.created_at)}
      </td>
      <td className="px-[18px] py-[11px]">
        <div className="flex items-center gap-[9px]">
          <AvatarUsuario usuario={responsable} anillo={esMio === true} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{nombreDelLead(lead.client)}</div>
            {contacto && contacto !== nombreDelLead(lead.client) && (
              <div className="truncate text-[12px] text-(--fg-muted)">{contacto}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-[18px] py-[11px] text-[12.5px] text-(--fg-2)">
        <div className="truncate">{lead.client?.phone ?? ''}</div>
        <div className="truncate text-(--fg-muted)">{lead.client?.email ?? ''}</div>
      </td>
      <td className="px-[18px] py-[11px]"><StageBadge etapa={etapa} /></td>
      <td className="px-[18px] py-[11px]">
        <GestionCell lead={lead} toleranceHours={etapa?.management_tolerance_hours} overdueTasks={vencidas}
          puedeEscribir={puedeEscribir} now={now} />
      </td>
      <td className="whitespace-nowrap px-[18px] py-[11px] text-[12.5px] tabular-nums text-(--fg-muted)">
        {fmtShortDate(lead.last_important_event_at)}
      </td>
      <td className="px-2 py-[11px] text-right" data-row-actions>{acciones}</td>
    </tr>
  )
}

/** El mismo renglón en el teléfono: empresa arriba, etapa y gestión abajo. */
function LeadCard({ lead, etapa, responsable, esMio, vencidas, puedeEscribir, now, onAbrir, acciones, seleccion }: RenglonProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => {
        if (!clicDelRenglon(e)) return
        if (seleccion) seleccion.onToggle()
        else onAbrir(lead.id)
      }}
      onKeyDown={e => { if (e.key === 'Enter' && !seleccion) onAbrir(lead.id) }}
      className="flex flex-col gap-2 bg-card px-3 py-3 [border-bottom:1px_solid_var(--line-soft)]"
    >
      <div className="flex items-center gap-2.5">
        {seleccion && (
          <span data-row-actions>
            <Checkbox checked={seleccion.marcado} onCheckedChange={seleccion.onToggle} aria-label="Seleccionar lead" />
          </span>
        )}
        <AvatarUsuario usuario={responsable} anillo={esMio === true} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">{nombreDelLead(lead.client)}</div>
          <div className="truncate text-[12.5px] text-(--fg-muted)">
            {[contactoDelCliente(lead.client), lead.client?.phone].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span data-row-actions>{acciones}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge etapa={etapa} />
        <GestionCell lead={lead} toleranceHours={etapa?.management_tolerance_hours} overdueTasks={vencidas}
          puedeEscribir={puedeEscribir} now={now} />
      </div>
    </div>
  )
}

const HEADERS = ['', 'Alta', 'Lead', 'Contacto', 'Etapa', 'Gestión', 'Última actividad', '']

export function CrmLeadList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()
  const leadsQ = useCrmLeads()
  const tareasQ = useTareasPendientes()
  const cat = useCrmCatalogos()
  const agentes = useVisibleAgents()

  const filtros = useMemo(() => filtrosDesdeUrl(searchParams), [searchParams])
  const hoy = localTodayIso()
  const tareas = tareasQ.data ?? SIN_TAREAS
  const vencidasPorLead = useMemo(() => tareasVencidasPorLead(tareas, hoy), [tareas, hoy])
  const overdueLeadIds = useMemo(() => idsConTareasVencidas(tareas, hoy), [tareas, hoy])
  // Un solo «ahora» por pintada (ver LeadFilterContext).
  const ctx = useMemo<LeadFilterContext>(
    () => ({ overdueLeadIds, etapas: cat.etapasPorId, now: Date.now() }),
    [overdueLeadIds, cat.etapasPorId, leadsQ.dataUpdatedAt],
  )

  const deCarteras = useMemo(
    () => leadsDeCarteras(leadsQ.data ?? [], agentes.selectedIds), [leadsQ.data, agentes.selectedIds])
  const visibles = useMemo(() => filterLeads(deCarteras, filtros, ctx), [deCarteras, filtros, ctx])
  const contadores = useMemo(() => computeLeadListCounters(deCarteras, filtros, ctx), [deCarteras, filtros, ctx])
  const estado = estadoDeLista({
    cargando: leadsQ.isLoading,
    error: leadsQ.error,
    total: leadsQ.data ? deCarteras.length : undefined,
    visibles: visibles.length,
  })

  const cambiarFiltros = (patch: Partial<LeadFilterState>) =>
    setSearchParams(prev => escribirFiltros(prev, patch), { replace: true })
  const limpiarFiltros = () =>
    setSearchParams(prev => deleteLeadFilterParams(prev, LEAD_FILTER_PARAMS_WITH_QUERY), { replace: true })
  const abrirLead = (leadId: string | null) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (leadId) p.set(LEAD_PARAM, leadId)
    else p.delete(LEAD_PARAM)
    return p
  }, { replace: true })

  const usuariosPorId = useMemo(() => new Map(agentes.usuarios.map(u => [u.id, u])), [agentes.usuarios])
  const variasCarteras = agentes.selectedIds.length > 1

  const propsDe = (lead: CrmLeadRow): RenglonProps => ({
    lead,
    etapa: etapaDelLead(lead, cat.etapasPorId),
    responsable: usuariosPorId.get(lead.assigned_to),
    esMio: variasCarteras ? lead.assigned_to === agentes.myId : null,
    vencidas: vencidasPorLead.get(lead.id) ?? SIN_TAREAS,
    puedeEscribir: agentes.puedeEscribir(lead.assigned_to),
    now: ctx.now,
    onAbrir: abrirLead,
  })

  const etiquetasFiltros = [
    filtros.q.trim() && 'Búsqueda',
    filtros.stageFilter.size > 0 && 'Etapa',
    filtros.gestionExcluded.size > 0 && 'Gestión',
    filtros.excludedPriorities.size > 0 && 'Prioridad',
    filtros.overdueOnly && 'Tareas vencidas',
  ].filter((v): v is string => typeof v === 'string')

  return (
    <>
      <FiltrosCrm
        filtros={filtros}
        contadores={contadores}
        etapas={cat.etapasActivas}
        prioridades={cat.prioridadesActivas}
        onCambiar={cambiarFiltros}
        onLimpiar={limpiarFiltros}
      />

      {estado === 'cargando' && (
        <div className="flex flex-col gap-2 px-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-secondary" />)}
        </div>
      )}

      {/* Un error de red NO vacía la lista: si hay datos, se siguen viendo (estadoDeLista). */}
      {estado === 'error' && (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">No pudimos cargar los leads.</p>
          <Button variant="outline" onClick={() => void leadsQ.refetch()} disabled={leadsQ.isFetching}>
            <Icon icon={RotateCw} size="xs" className={cn(leadsQ.isFetching && 'animate-spin')} />
            {leadsQ.isFetching ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      )}

      {estado === 'sin-leads' && (
        <div className="px-4 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {agentes.selectedIds.length > 1 ? 'Estas carteras todavía no tienen leads.' : 'Todavía no tenés leads.'}
          </p>
          <p className="mt-1 text-[13px] text-(--fg-2)">Cargá el primero con «Nuevo lead».</p>
        </div>
      )}

      {estado === 'sin-resultados' && (
        <div className="px-4 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            Ningún lead con {formatFilterList(etiquetasFiltros) || 'estos filtros'}.
          </p>
          <Button variant="outline" className="mt-3" onClick={limpiarFiltros}>Limpiar filtros</Button>
        </div>
      )}

      {estado === 'ok' && (isMobile ? (
        <div className="flex flex-col">
          {visibles.map(lead => <LeadCard key={lead.id} {...propsDe(lead)} />)}
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {HEADERS.map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap bg-(--surface-2) px-[18px] py-[7px] text-left text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)',
                    'shadow-[inset_0_-1px_0_var(--line-strong)]',
                    i === 0 && 'w-[28px] px-0',
                  )}
                >
                  {i === HEADERS.length - 1 ? (
                    <span className="block text-right tabular-nums">{visibles.length} lead{visibles.length === 1 ? '' : 's'}</span>
                  ) : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(lead => <LeadRow key={lead.id} {...propsDe(lead)} />)}
          </tbody>
        </table>
      ))}
    </>
  )
}
```

Nota para quien implementa: `leadsQ.dataUpdatedAt` va en las dependencias del `ctx` a
propósito: cada vez que llegan datos nuevos (realtime, mutación) se toma un «ahora» nuevo, así
una gestión que venció mientras la pantalla estaba abierta se ve vencida en el próximo refresco.

- [ ] **Step 7: `src/pages/crm/Crm.tsx`** (reemplaza el placeholder)

```tsx
import { AgentFilterButton } from './components/AgentFilterButton'
import { CrmLeadList } from './components/CrmLeadList'
import { useCrmRealtime } from './hooks/useCrmRealtime'

/* Cabecera (carteras, funnel, canales, + Nuevo lead) y la lista. El realtime se abre acá y no en
   la lista: vive lo que vive la página. */
export function Crm() {
  useCrmRealtime()
  return (
    // `ui-scale-md`: la escala del producto en escritorio y 1 en el teléfono (objetivos táctiles).
    <div className="ui-scale-md flex flex-col">
      <header className="flex items-center justify-end gap-2 px-4 pb-2 pt-3 max-md:px-2">
        <h1 className="mr-auto text-lg font-semibold text-foreground">CRM</h1>
        <AgentFilterButton />
      </header>
      <div className="p-1 max-md:p-0">
        <CrmLeadList />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Typecheck y chequeo de restos del producto**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
rg -n "organization_id|lead_type|briefing_|lead_properties|idealista_|@/service/" src/pages/crm src/components/AvatarUsuario.tsx
```
Expected: `TSC OK`; el `rg` no encuentra nada.

- [ ] **Step 9: Commit**

```bash
git add src/components/AvatarUsuario.tsx src/pages/crm
git commit -m "feat(crm): lista de leads con filtros, contadores y carteras"
```

---

### Task 9: Las piezas del lead — cliente, tareas, reuniones y actividad

(Va antes del dialog y no después, a diferencia de la lista de la spec: son las hojas que el
dialog monta. Así la Task 10 arma el dialog con sus tres pestañas completas y ninguna tarea deja
una pestaña vacía en el medio.)

**Files:**
- Create: `src/components/tasks/TaskDueDatePicker.tsx` (copia tal cual)
- Create: `src/pages/crm/components/ClientFields.tsx`, `LeadTasksPanel.tsx`, `MeetingsPanel.tsx`,
  `DockedActivityChat.tsx`, `ActividadLead.tsx`
- Create: `src/pages/crm/lib/actividad.ts`, `actividad.test.ts`
- Create: `src/pages/crm/lib/reuniones.ts`, `reuniones.test.ts`

**Interfaces:**
- Consumes: Tasks 4-8.
- Produces:
  - `TaskDueDatePicker({ value, onSelect, children, align? })`.
  - `ClientFields({ data, onChange, errors, onCommit?, extendido?, description? })` — `data: ClientData & Partial<ClienteExtra>`.
  - `LeadTasksPanel({ leadId, responsableId, puedeEscribir, tareas, cargando })`.
  - `MeetingsPanel({ leadId, responsableId, puedeEscribir, reuniones, cargando })`.
  - `DockedActivityChat({ title, getOrigin, children })`, `ColumnChatSlot({ onLeave, className?, children })`, `ChatOrigin`.
  - `ActividadLead({ lead, detalle, cargando, puedeEscribir, now })`.
  - `actividad.ts`: `ItemActividad = { id: string; tipo: 'comentario' | 'sistema' | 'gestion' | 'pospuesto' | 'etapa' | 'asignacion'; fecha: string; texto: string; autorId: string | null }`,
    `lineaDeTiempo(detalle: LeadDetalle, etapas: ReadonlyMap<string, EtapaConPrioridad>, usuarios: Usuario[]): ItemActividad[]`.
  - `reuniones.ts`: `armarReunion(fecha: string, hora: string, minutos: number): { starts_at: string; ends_at: string }`,
    `agruparReuniones(reuniones: CrmMeeting[], now: number): { proximas: CrmMeeting[]; pasadas: CrmMeeting[] }`.

**Qué se copia de dónde:**
- `TaskDueDatePicker.tsx` ← `$PRODUCTO/src/components/tasks/TaskDueDatePicker.tsx`, tal cual.
- `ClientFields.tsx` ← `$PRODUCTO/src/pages/leads/components/ClientFields.tsx` + empresa, los dos
  teléfonos alternativos con su nota y las notas (modo `extendido`, el del dialog), y `onCommit`
  para guardar al salir del campo. El import de `clientData` apunta a `../lib/clientData`.
- `LeadTasksPanel.tsx` ← `$PRODUCTO/src/pages/leads/components/LeadTasksPanel.tsx`: `groupTasks`,
  `dueLabel`, `TaskCard` y `NewTaskSheet` quedan **tal cual** (con `Task` → `CrmTask` y los imports
  de `@/lib/calendarDate`, `@/components/tasks/TaskDueDatePicker`). Se reemplaza la cabeza de
  `LeadTasksPanel`: no hay `useTasks` ni `current-user-id`; las tareas llegan del detalle y se
  escriben con `useMutacionDelDetalle` (código abajo).
- `DockedActivityChat.tsx` ← `$PRODUCTO/src/pages/leads/components/DockedActivityChat.tsx`, tal
  cual salvo el avatar del bot: `import propelinAvatar from '@/assets/propelia-bot.png'` y el `<img>`
  se reemplazan por `<Icon icon={MessageSquare} size="sm" className="shrink-0 text-(--fg-muted)" />`
  (sumar `MessageSquare` al import de lucide-react). El asset no está en este repo y no vale traer
  un PNG para un ícono de cabecera. `@radix-ui/react-focus-scope` ya está en `node_modules` (viene
  con `react-dialog`, igual que en el producto): no es una dependencia nueva.
- `MeetingsPanel.tsx`, `ActividadLead.tsx`, `actividad.ts`, `reuniones.ts`: nuevos (el producto
  usa visitas con calendario de Google, que acá no hay).

- [ ] **Step 1: Copiar `TaskDueDatePicker` y `DockedActivityChat`** según lo de arriba.

```bash
PRODUCTO=/mnt/c/Users/anton/Documents/programacion/propelia/propelia-frontend
mkdir -p src/components/tasks
cp $PRODUCTO/src/components/tasks/TaskDueDatePicker.tsx src/components/tasks/
cp $PRODUCTO/src/pages/leads/components/DockedActivityChat.tsx src/pages/crm/components/
```
Después, en `DockedActivityChat.tsx`, el cambio del avatar descripto. Verificar:
`rg -n "propelia-bot|@/assets" src/pages/crm/components/DockedActivityChat.tsx` → nada.

- [ ] **Step 2: Tests que fallan — `src/pages/crm/lib/actividad.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { EtapaConPrioridad, LeadDetalle, Usuario } from '../types'
import { lineaDeTiempo } from './actividad'

const vacio: LeadDetalle = { tasks: [], comments: [], events: [], meetings: [], stageHistory: [], assignmentHistory: [] }
const etapas = new Map([
  ['n', { id: 'n', label: 'Nuevo' } as EtapaConPrioridad],
  ['c', { id: 'c', label: 'Contactado' } as EtapaConPrioridad],
])
const usuarios = [{ id: 'a', nombre: 'Antonio' }, { id: 'l', nombre: 'Lorenzo' }] as Usuario[]

describe('lineaDeTiempo', () => {
  const detalle: LeadDetalle = {
    ...vacio,
    comments: [
      { id: 'c1', lead_id: 'x', description: 'hola', long_description: null, comment_type: 'MANUAL', created_by: 'a', created_at: '2026-09-30T10:00:00Z', deleted_at: null },
      { id: 'c2', lead_id: 'x', description: 'Lead reasignado de Antonio a Lorenzo.', long_description: null, comment_type: 'SYSTEM', created_by: 'a', created_at: '2026-09-30T12:00:00Z', deleted_at: null },
    ],
    events: [
      { id: 'e1', lead_id: 'x', action: 'MANUAL', effective_at: '2026-09-30T11:00:00Z', note: null, created_by: 'l', created_at: '2026-09-30T11:00:00Z', deleted_at: null },
      { id: 'e2', lead_id: 'x', action: 'POSTPONED', effective_at: '2026-10-05T09:00:00Z', note: 'viaja', created_by: 'l', created_at: '2026-09-30T13:00:00Z', deleted_at: null },
    ],
    stageHistory: [
      { id: 's1', lead_id: 'x', from_stage_id: null, to_stage_id: 'n', changed_by: null, changed_at: '2026-09-30T09:00:00Z' },
      { id: 's2', lead_id: 'x', from_stage_id: 'n', to_stage_id: 'borrada', changed_by: 'a', changed_at: '2026-09-30T09:30:00Z' },
    ],
  }
  const items = lineaDeTiempo(detalle, etapas, usuarios)

  it('ordena de lo más viejo a lo más nuevo (el chat se lee de arriba abajo)', () => {
    expect(items.map(i => i.id)).toEqual(['s1', 's2', 'c1', 'e1', 'c2', 'e2'])
  })
  it('las gestiones se fechan cuando se hicieron, no a dónde se pospusieron', () => {
    expect(items.find(i => i.id === 'e2')).toMatchObject({ tipo: 'pospuesto', fecha: '2026-09-30T13:00:00Z' })
  })
  it('una etapa que ya no está en el catálogo se nombra igual', () => {
    expect(items.find(i => i.id === 's2')?.texto).toBe('Etapa: Nuevo → (etapa borrada)')
    expect(items.find(i => i.id === 's1')?.texto).toBe('Entró en Nuevo')
  })
  it('comentarios SYSTEM como sistema', () => {
    expect(items.find(i => i.id === 'c2')?.tipo).toBe('sistema')
  })
  it('el pospuesto dice hasta cuándo y la nota', () => {
    expect(items.find(i => i.id === 'e2')?.texto).toMatch(/^Gestión pospuesta hasta \d{2}\/\d{2} · viaja$/)
  })
})
```

- [ ] **Step 3: Implementar `src/pages/crm/lib/actividad.ts`**

```ts
import { fmtDayMonth } from '@/lib/calendarDate'
import type { EtapaConPrioridad, LeadDetalle, Usuario } from '../types'
import { nombreDe } from './permisos'

/* La actividad del lead en una sola lista: lo que se escribió (comentarios MANUAL), lo que dejó
   el sistema (comentarios SYSTEM) y lo que registran la base y los triggers (gestiones, cambios
   de etapa y de responsable). Una lista y no cuatro: la pregunta al abrir un lead es «qué pasó
   con esto», y la respuesta es en orden. */
export type ItemActividad = {
  id: string
  tipo: 'comentario' | 'sistema' | 'gestion' | 'pospuesto' | 'etapa' | 'asignacion'
  /** Cuándo pasó (no cuándo vence): lo que ordena la lista. */
  fecha: string
  texto: string
  autorId: string | null
}

export function lineaDeTiempo(
  detalle: LeadDetalle, etapas: ReadonlyMap<string, EtapaConPrioridad>, usuarios: Usuario[],
): ItemActividad[] {
  const etapa = (id: string | null) => (id ? etapas.get(id)?.label ?? '(etapa borrada)' : '')
  const items: ItemActividad[] = [
    ...detalle.comments.map(c => ({
      id: c.id, tipo: c.comment_type === 'SYSTEM' ? 'sistema' as const : 'comentario' as const,
      fecha: c.created_at, texto: c.description, autorId: c.created_by,
    })),
    ...detalle.events.map(e => ({
      id: e.id,
      tipo: e.action === 'POSTPONED' ? 'pospuesto' as const : 'gestion' as const,
      // created_at: un pospuesto a la semana que viene se hizo HOY, y ahí va en la lista.
      fecha: e.created_at,
      texto: (e.action === 'POSTPONED' ? `Gestión pospuesta hasta ${fmtDayMonth(localDia(e.effective_at))}` : 'Gestión registrada')
        + (e.note ? ` · ${e.note}` : ''),
      autorId: e.created_by,
    })),
    ...detalle.stageHistory.map(h => ({
      id: h.id, tipo: 'etapa' as const, fecha: h.changed_at,
      texto: h.from_stage_id ? `Etapa: ${etapa(h.from_stage_id)} → ${etapa(h.to_stage_id)}` : `Entró en ${etapa(h.to_stage_id)}`,
      autorId: h.changed_by,
    })),
    ...detalle.assignmentHistory.map(h => ({
      id: h.id, tipo: 'asignacion' as const, fecha: h.changed_at,
      texto: `Responsable: ${nombreDe(usuarios, h.from_user_id)} → ${nombreDe(usuarios, h.to_user_id)}`,
      autorId: h.changed_by,
    })),
  ]
  return items.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
}

/** El día LOCAL de un instante, como 'YYYY-MM-DD' (un timestamptz de las 01:00 UTC es el día anterior en Buenos Aires). */
function localDia(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

(`localDia` es una `function` declarada: se puede usar arriba de su definición.)

- [ ] **Step 4: Tests que fallan — `src/pages/crm/lib/reuniones.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CrmMeeting } from '../types'
import { agruparReuniones, armarReunion } from './reuniones'

const reunion = (id: string, starts: Date, status: CrmMeeting['status'] = 'scheduled'): CrmMeeting => ({
  id, lead_id: 'l', assigned_to: 'u', starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600_000).toISOString(),
  status, title: null, description: null, cancel_reason: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
})

describe('armarReunion', () => {
  it('fecha y hora LOCALES a instantes, con la duración', () => {
    const r = armarReunion('2026-10-01', '09:30', 45)
    expect(new Date(r.starts_at).getHours()).toBe(9)
    expect(new Date(r.starts_at).getMinutes()).toBe(30)
    expect(Date.parse(r.ends_at) - Date.parse(r.starts_at)).toBe(45 * 60_000)
  })
})

describe('agruparReuniones', () => {
  const now = new Date(2026, 8, 30, 12).getTime()
  it('próximas agendadas en orden; pasadas y cerradas, de la más nueva a la más vieja', () => {
    const g = agruparReuniones([
      reunion('pasada', new Date(2026, 8, 20, 10)),
      reunion('luego', new Date(2026, 9, 5, 10)),
      reunion('pronto', new Date(2026, 9, 1, 10)),
      reunion('cancelada', new Date(2026, 9, 2, 10), 'cancelled'),
    ], now)
    expect(g.proximas.map(r => r.id)).toEqual(['pronto', 'luego'])
    expect(g.pasadas.map(r => r.id)).toEqual(['cancelada', 'pasada'])
  })
})
```

- [ ] **Step 5: Implementar `src/pages/crm/lib/reuniones.ts`**

```ts
import type { CrmMeeting } from '../types'

/** Día y hora que eligió quien agenda, en SU zona, a instantes para las columnas timestamptz. */
export function armarReunion(fecha: string, hora: string, minutos: number): { starts_at: string; ends_at: string } {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const inicio = new Date(y, m - 1, d, h, mi, 0, 0)
  return { starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + minutos * 60_000).toISOString() }
}

/**
 * Próximas = agendadas que todavía no terminaron, la más cercana primero (es lo que se viene a
 * mirar). Todo lo demás —ya pasó, completada, cancelada— va abajo, la más nueva primero.
 */
export function agruparReuniones(reuniones: CrmMeeting[], now: number): { proximas: CrmMeeting[]; pasadas: CrmMeeting[] } {
  const vivas = reuniones.filter(r => r.deleted_at == null)
  const esProxima = (r: CrmMeeting) => r.status === 'scheduled' && Date.parse(r.ends_at) > now
  return {
    proximas: vivas.filter(esProxima).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    pasadas: vivas.filter(r => !esProxima(r)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
  }
}
```

- [ ] **Step 6: `src/pages/crm/components/ClientFields.tsx`**

```tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { MISSING_CONTACT_ERROR, type ClientData, type ClientDataErrors } from '../lib/clientData'

/* Copiado de propelia-frontend (src/pages/leads/components/ClientFields.tsx) + empresa. En modo
   `extendido` (el dialog del lead) suma los teléfonos alternativos y las notas. Con `onCommit` el
   campo guarda AL SALIR, no tecla por tecla: cada tecla sería un update, un eco de realtime y un
   repintado encima de lo que se está escribiendo. */

export type ClienteExtra = {
  alternative_phone_1: string
  alternative_phone_1_note: string
  alternative_phone_2: string
  alternative_phone_2_note: string
  notes: string
}
type Campo = keyof ClientData | keyof ClienteExtra

/** 48px y esquinas de 12px debajo de 768px: el objetivo táctil del alta en móvil. */
const MOBILE_FIELD = 'max-md:h-12 max-md:rounded-xl'

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[12.5px] font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
    </div>
  )
}

export function ClientFields({ data, onChange, errors, onCommit, extendido = false, description, disabled = false }: {
  data: ClientData & Partial<ClienteExtra>
  onChange: (patch: Partial<ClientData & ClienteExtra>) => void
  errors: ClientDataErrors
  /** Guardar un campo al salir de él. Sin esto el formulario es de alta (se guarda con un botón). */
  onCommit?: (campo: Campo) => void
  extendido?: boolean
  description?: string
  disabled?: boolean
}) {
  const texto = (campo: Campo, label: string, placeholder: string, type = 'text') => (
    <Field label={label} error={errors[campo as keyof ClientData]}>
      <Input
        className={MOBILE_FIELD}
        type={type}
        placeholder={placeholder}
        value={data[campo] ?? ''}
        disabled={disabled}
        onChange={e => onChange({ [campo]: e.target.value })}
        onBlur={() => onCommit?.(campo)}
        aria-invalid={!!errors[campo as keyof ClientData]}
      />
    </Field>
  )
  const telefono = (campo: 'phone' | 'alternative_phone_1' | 'alternative_phone_2', label: string) => (
    <Field label={label} error={errors[campo as keyof ClientData]}>
      {/* PhoneInput no tiene onBlur propio: se escucha en el contenedor (el blur burbujea como focusout). */}
      <div onBlur={() => onCommit?.(campo)}>
        <PhoneInput value={data[campo] ?? ''} onChange={v => onChange({ [campo]: v })} aria-invalid={!!errors[campo as keyof ClientData]} />
      </div>
    </Field>
  )

  return (
    <div className="flex flex-col gap-3">
      {description && <p className="mb-1 text-xs text-muted-foreground">{description}</p>}
      {texto('company_name', 'Empresa', 'Inmobiliaria Sur')}
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {texto('first_name', 'Nombre', 'Ana')}
        {texto('last_name', 'Apellido', 'Torres')}
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {telefono('phone', 'Teléfono')}
        {texto('email', 'Email', 'ana@mail.com', 'email')}
      </div>
      {errors.phone === MISSING_CONTACT_ERROR && (
        <p className="rounded-md bg-warning-soft px-2.5 py-[7px] text-[11px] text-warning">
          Ingresá al menos teléfono o email para poder contactar al cliente.
        </p>
      )}
      {extendido && (
        <>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {telefono('alternative_phone_1', 'Teléfono alternativo')}
            {texto('alternative_phone_1_note', 'De quién es', 'Recepción')}
          </div>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {telefono('alternative_phone_2', 'Otro teléfono')}
            {texto('alternative_phone_2_note', 'De quién es', 'Dueño')}
          </div>
          <Field label="Notas">
            <Textarea
              rows={4}
              value={data.notes ?? ''}
              disabled={disabled}
              onChange={e => onChange({ notes: e.target.value })}
              onBlur={() => onCommit?.('notes')}
            />
          </Field>
        </>
      )}
    </div>
  )
}
```

Verificar la firma real de `PhoneInput` antes de escribir (`rg -n "aria-invalid|disabled" src/components/ui/phone-input.tsx`):
si no acepta `aria-invalid`, sacarlo de las dos llamadas; si acepta `disabled`, pasárselo.

- [ ] **Step 7: `src/pages/crm/components/LeadTasksPanel.tsx`** — copiar
  `$PRODUCTO/src/pages/leads/components/LeadTasksPanel.tsx`. Imports finales:

```tsx
import { useState } from 'react'
import { CalendarPlus, ChevronDown, Plus } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { FullscreenComposer } from '@/components/ui/fullscreen-composer'
import { TaskDueDatePicker } from '@/components/tasks/TaskDueDatePicker'
import { fmtDueLabel, localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { actualizarTarea, crearTarea } from '../service/crm.service'
import type { CrmTask, LeadDetalle } from '../types'

type Task = CrmTask
```
`groupTasks`, `dueLabel`, `TaskCard` y `NewTaskSheet` quedan idénticos. `TaskCard` gana un prop
`disabled: boolean` que se pasa al `<button role="checkbox">` (`disabled={disabled}`). La función
exportada se reemplaza entera por:

```tsx
/* Las tareas del lead, agrupadas por urgencia (Vencidas → Hoy → Próximas, lo hecho plegado al
   final). Llegan del detalle del lead (una sola consulta al abrir) y no de un `useTasks` propio. */
export function LeadTasksPanel({ leadId, responsableId, puedeEscribir, tareas, cargando }: {
  leadId: string
  /** Una tarea nueva es del responsable del lead, no de quien la anota: es su trabajo. */
  responsableId: string
  puedeEscribir: boolean
  tareas: CrmTask[]
  cargando: boolean
}) {
  const today = localTodayIso()
  const [composerOpen, setComposerOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const agregar = useMutacionDelDetalle(leadId, (v: { title: string; dueDate: string | null }) =>
    crearTarea({ lead_id: leadId, title: v.title, due_date: v.dueDate, assigned_to: responsableId }), { exito: 'Tarea creada' })
  const alternar = useMutacionDelDetalle(leadId,
    (t: CrmTask) => actualizarTarea(t.id, { completed: !t.completed, completed_at: t.completed ? null : new Date().toISOString() }),
    { optimista: (d: LeadDetalle, t: CrmTask) => ({ ...d, tasks: d.tasks.map(x => x.id === t.id ? { ...x, completed: !t.completed } : x) }) },
  )

  const pending = tareas.filter(t => !t.completed)
  const done = tareas.filter(t => t.completed)
  const groups = groupTasks(pending, today)
  const onToggle = (t: CrmTask) => alternar.mutate(t)
```

y de ahí para abajo el JSX del producto sin cambios, salvo: `isLoading` → `cargando`; los tres
`onToggle={t => toggleTask({ id: t.id, completed: !t.completed })}` → `onToggle={onToggle}` con
`disabled={!puedeEscribir}`; el pie con «Nueva tarea» se dibuja solo `{puedeEscribir && (…)}`; el
`NewTaskSheet` recibe `isPending={agregar.isPending}` y
`onCreate={(title, dueDate) => agregar.mutate({ title, dueDate })}`; el texto del vacío pasa a
«Lo que haya que hacer con esta inmobiliaria se anota acá.» (acá no hay «tu día»). Verificar:
`rg -n "useTasks|entityType|current-user-id|@/service" src/pages/crm/components/LeadTasksPanel.tsx` → nada.

- [ ] **Step 8: `src/pages/crm/components/MeetingsPanel.tsx`**

```tsx
import { useState } from 'react'
import { CalendarPlus, Check, X } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TimeSelect } from '@/components/ui/time-select'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { agruparReuniones, armarReunion } from '../lib/reuniones'
import { actualizarReunion, crearReunion } from '../service/crm.service'
import type { CrmMeeting, LeadDetalle } from '../types'

/* NUEVO: el producto agenda visitas a pisos contra Google Calendar; acá una reunión es con una
   inmobiliaria y vive solo en `crm_meetings`. Listado con agendar, completar y cancelar (con
   motivo). Sin calendario (fuera de alcance, spec §8). */

const DURACIONES = [15, 30, 45, 60, 90, 120]
const fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const ESTADO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'text-primary' },
  completed: { label: 'Hecha', className: 'text-success' },
  cancelled: { label: 'Cancelada', className: 'text-(--fg-muted) line-through' },
}

function Tarjeta({ r, puedeEscribir, onCompletar, onCancelar }: {
  r: CrmMeeting; puedeEscribir: boolean; onCompletar: () => void; onCancelar: () => void
}) {
  const estado = ESTADO[r.status] ?? ESTADO.scheduled
  return (
    <div className="flex items-start gap-3 rounded-xl bg-card p-3 [border:1px_solid_var(--line)]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium text-foreground">{r.title || 'Reunión'}</span>
        <span className="text-[12.5px] tabular-nums text-(--fg-2)">{fmt.format(new Date(r.starts_at))}</span>
        {r.description && <span className="text-[12.5px] text-(--fg-muted)">{r.description}</span>}
        {r.cancel_reason && <span className="text-[12.5px] text-(--fg-muted)">Motivo: {r.cancel_reason}</span>}
        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', estado.className)}>{estado.label}</span>
      </div>
      {puedeEscribir && r.status === 'scheduled' && (
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={onCompletar}><Icon icon={Check} size="xs" />Hecha</Button>
          <Button variant="ghost" size="sm" onClick={onCancelar}><Icon icon={X} size="xs" />Cancelar</Button>
        </div>
      )}
    </div>
  )
}

export function MeetingsPanel({ leadId, responsableId, puedeEscribir, reuniones, cargando }: {
  leadId: string
  responsableId: string
  puedeEscribir: boolean
  reuniones: CrmMeeting[]
  cargando: boolean
}) {
  const [agendando, setAgendando] = useState(false)
  const [fecha, setFecha] = useState(localTodayIso())
  const [hora, setHora] = useState('10:00')
  const [duracion, setDuracion] = useState(60)
  const [titulo, setTitulo] = useState('')
  const [cancelando, setCancelando] = useState<CrmMeeting | null>(null)
  const [motivo, setMotivo] = useState('')

  const agendar = useMutacionDelDetalle(leadId, () =>
    crearReunion({ lead_id: leadId, assigned_to: responsableId, title: titulo.trim() || null, ...armarReunion(fecha, hora, duracion) }),
    { exito: 'Reunión agendada' })
  const cambiar = useMutacionDelDetalle(leadId,
    (v: { id: string; status: 'completed' | 'cancelled'; cancel_reason?: string | null }) =>
      actualizarReunion(v.id, { status: v.status, cancel_reason: v.cancel_reason ?? null }),
    { optimista: (d: LeadDetalle, v) => ({ ...d, meetings: d.meetings.map(m => m.id === v.id ? { ...m, status: v.status, cancel_reason: v.cancel_reason ?? null } : m) }) },
  )

  const { proximas, pasadas } = agruparReuniones(reuniones, Date.now())

  const confirmarAgenda = () => {
    agendar.mutate(undefined, { onSuccess: () => { setAgendando(false); setTitulo('') } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-(--surface-2)">
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {cargando ? (
          <p className="py-6 text-[13.5px] text-(--fg-muted)">Cargando reuniones…</p>
        ) : proximas.length === 0 && pasadas.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[15.5px] font-semibold text-foreground">Sin reuniones con este lead</p>
            <p className="mt-1 text-[13.5px] text-(--fg-2)">Las que se agenden aparecen acá, con su estado.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {([{ rotulo: 'Próximas', lista: proximas }, { rotulo: 'Anteriores', lista: pasadas }]).map(({ rotulo, lista }) =>
              lista.length > 0 && (
                <section key={rotulo} className="flex flex-col gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-(--fg-2)">{rotulo}</span>
                  {lista.map(r => (
                    <Tarjeta key={r.id} r={r} puedeEscribir={puedeEscribir}
                      onCompletar={() => cambiar.mutate({ id: r.id, status: 'completed' })}
                      onCancelar={() => { setMotivo(''); setCancelando(r) }} />
                  ))}
                </section>
              ))}
          </div>
        )}
      </div>

      {puedeEscribir && (
        <div className="shrink-0 bg-card px-4 pb-4 pt-2.5 [border-top:1px_solid_var(--line)]">
          {agendando ? (
            <div className="flex flex-col gap-2">
              <Input placeholder="Título (opcional)" value={titulo} onChange={e => setTitulo(e.target.value)} />
              <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px]">Día</Label>
                  <Input type="date" value={fecha} min={localTodayIso()} onChange={e => setFecha(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px]">Hora</Label>
                  <TimeSelect value={hora} onChange={setHora} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px]">Duración</Label>
                  <Select value={String(duracion)} onValueChange={v => setDuracion(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURACIONES.map(m => <SelectItem key={m} value={String(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAgendando(false)}>Cancelar</Button>
                <Button onClick={confirmarAgenda} disabled={!fecha || agendar.isPending}>Agendar</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="h-12 w-full rounded-xl text-[16px]" onClick={() => setAgendando(true)}>
              <Icon icon={CalendarPlus} size="sm" />
              Agendar reunión
            </Button>
          )}
        </div>
      )}

      {cancelando && (
        <AlertDialog open onOpenChange={o => { if (!o) setCancelando(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar la reunión?</AlertDialogTitle>
              <AlertDialogDescription>Queda en el historial del lead como cancelada, con el motivo.</AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={() => cambiar.mutate({ id: cancelando.id, status: 'cancelled', cancel_reason: motivo.trim() || null })}>
                Cancelar reunión
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
```

- [ ] **Step 9: `src/pages/crm/components/ActividadLead.tsx`**

```tsx
import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useMarcarGestion, useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { lineaDeTiempo } from '../lib/actividad'
import { etapaDelLead } from '../lib/effectiveStage'
import { gestionDeLead } from '../lib/gestionStatus'
import { fmtShortDate } from '../lib/leadCellFormat'
import { crearComentario } from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle } from '../types'
import { GestionBadge, PostponePopover } from './leadCells'

/* NUEVO. En el producto el contenido del chat de actividad vive adentro de LeadAccordion (5.600
   líneas); acá es un componente propio. Arriba, el estado de gestión con «marcar» y «posponer»;
   en el medio, la línea de tiempo; abajo, el compositor de comentarios. Lo usan la columna de la
   pestaña Cliente y la ventana acoplada (DockedActivityChat) de las otras dos. */
export function ActividadLead({ lead, detalle, cargando, puedeEscribir, now }: {
  lead: CrmLeadRow
  detalle: LeadDetalle | undefined
  cargando: boolean
  puedeEscribir: boolean
  now: number
}) {
  const { etapasPorId } = useCrmCatalogos()
  const { usuarios } = useCarteras()
  const [texto, setTexto] = useState('')
  const marcar = useMarcarGestion(lead.id)
  const comentar = useMutacionDelDetalle(lead.id, (description: string) => crearComentario({ lead_id: lead.id, description }))

  const status = gestionDeLead(lead, etapaDelLead(lead, etapasPorId)?.management_tolerance_hours, now)
  const items = detalle ? lineaDeTiempo(detalle, etapasPorId, usuarios) : []
  const usuariosPorId = new Map(usuarios.map(u => [u.id, u]))

  const enviar = () => {
    const limpio = texto.trim()
    if (!limpio) return
    comentar.mutate(limpio, { onSuccess: () => setTexto('') })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 [border-bottom:1px_solid_var(--line-soft)]">
        <span className="text-[12px] font-semibold text-(--fg-2)">Gestión</span>
        <GestionBadge status={status} onConfirm={() => marcar.mutate({ action: 'MANUAL' })} pending={marcar.isPending || !puedeEscribir} />
        {puedeEscribir && (
          <PostponePopover
            onPostpone={(effectiveAt, note) => marcar.mutate({ action: 'POSTPONED', effective_at: effectiveAt, note: note ?? null })}
            pending={marcar.isPending}
            postponed={status.postponed}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {cargando && <p className="py-4 text-[13px] text-(--fg-muted)">Cargando actividad…</p>}
        {!cargando && items.length === 0 && <p className="py-4 text-[13px] text-(--fg-muted)">Sin actividad todavía.</p>}
        <ol className="flex flex-col gap-2">
          {items.map(i => (
            <li key={i.id} className={cn('flex gap-2', i.tipo !== 'comentario' && 'text-(--fg-2)')}>
              {i.tipo === 'comentario'
                ? <AvatarUsuario usuario={i.autorId ? usuariosPorId.get(i.autorId) : null} />
                : <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-(--line-strong)" />}
              <div className="min-w-0 flex-1">
                <p className={cn('whitespace-pre-wrap text-[13.5px]', i.tipo === 'comentario' ? 'text-foreground' : 'text-[12.5px]')}>{i.texto}</p>
                <span className="text-[11px] tabular-nums text-(--fg-muted)">{fmtShortDate(i.fecha)}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {puedeEscribir && (
        <div className="flex shrink-0 items-end gap-2 bg-card px-3 py-2 [border-top:1px_solid_var(--line)]">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
            rows={2}
            placeholder="Escribí un comentario…"
            className="min-h-[44px] flex-1 resize-none rounded-lg bg-card px-2.5 py-2 text-[13.5px] text-foreground outline-none [border:1px_solid_var(--line)] placeholder:text-(--fg-faint) max-md:text-[16px]"
          />
          <Button size="icon" onClick={enviar} disabled={!texto.trim() || comentar.isPending} aria-label="Enviar comentario">
            <Icon icon={Send} size="sm" />
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 11: Commit**

```bash
git add src/components/tasks src/pages/crm
git commit -m "feat(crm): cliente, tareas, reuniones y actividad del lead"
```

---

### Task 10: El dialog del lead y las acciones del renglón

**Files:**
- Create: `src/pages/crm/components/LeadRowActions.tsx`, `LeadDialog.tsx`
- Modify: `src/pages/crm/components/CrmLeadList.tsx` (acciones en el renglón y el dialog)

**Interfaces:**
- Consumes: Tasks 7-9.
- Produces:
  - `LeadRowActions({ lead, puedeEscribir, onStartReassign?: (leadId: string) => void, triggerClassName?: string })`.
  - `LeadDialog({ lead, indice, total, onPaso, onCerrar, onStartReassign? })` con
    `indice: number` (−1 si el lead abierto no está en la lista filtrada), `onPaso: (delta: -1 | 1) => void`.

**Qué se copia de dónde:**
- `LeadRowActions.tsx` ← `$PRODUCTO/src/pages/leads/components/LeadRowActions.tsx`. Se **borran**:
  `LeadFunnel`/`isSeller` y los dos catálogos (acá hay un funnel), `EditLeadDialog` (se edita en
  la pestaña Cliente), eliminar (fuera de alcance: la spec no pide borrar leads), `freezeLead`,
  `useInvalidateLeadList`, `onStartDelete`, la hoja inferior de móvil (`BottomSheet`: son cuatro
  acciones y el `DropdownMenu` anda con el dedo). Se **conservan**: posponer con calendario y nota,
  descartar con motivo, reasignar por callback. Se **agrega**: «Cambiar etapa» (submenú con las
  etapas activas del funnel), y todo deshabilitado sin write.
- `LeadDialog.tsx` ← el `Dialog` de `$PRODUCTO/src/pages/leads/components/LeadList.tsx:1767-1935`
  (cabecera, anterior/siguiente con chevrones y ↑/↓, no se cierra clickeando afuera, a pantalla
  completa abajo de 768px) con el cuerpo nuevo: las tres pestañas.

- [ ] **Step 1: `src/pages/crm/components/LeadRowActions.tsx`**

```tsx
import { useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DatePickerCalendar } from '@/components/ui/date-picker-calendar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useActualizarLead, useDescartar, useMarcarGestion } from '../hooks/useLeadMutaciones'
import { etapaDelLead } from '../lib/effectiveStage'
import { gestionDeLead } from '../lib/gestionStatus'
import type { CrmLeadRow } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/components/LeadRowActions.tsx) sin el segundo
   funnel, sin eliminar y sin la hoja inferior de móvil. Todo deshabilitado sin write sobre la
   cartera: la base lo rechazaría igual, pero un botón que falla al tocarlo enseña a desconfiar. */
export function LeadRowActions({ lead, puedeEscribir, onStartReassign, triggerClassName }: {
  lead: CrmLeadRow
  puedeEscribir: boolean
  /** Sin handler no se ofrece «Reasignar» (lo conecta la lista, Task 11). */
  onStartReassign?: (leadId: string) => void
  triggerClassName?: string
}) {
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const actualizar = useActualizarLead()
  const descartar = useDescartar()
  const marcar = useMarcarGestion(lead.id)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discardReason, setDiscardReason] = useState('')
  const [postponeOpen, setPostponeOpen] = useState(false)
  const [postponeDate, setPostponeDate] = useState<Date | null>(null)
  const [postponeNote, setPostponeNote] = useState('')

  const etapa = etapaDelLead(lead, etapasPorId)
  const yaDescartado = !!descartada && lead.funnel_stage_id === descartada.id
  const postponed = gestionDeLead(lead, etapa?.management_tolerance_hours).postponed
  // Las del funnel para elegir; Descartado se elige desde «Descartar», que pide el motivo.
  const enFunnel = etapasActivas.filter(e => !e.is_out_of_funnel)

  const closePostpone = () => { setPostponeOpen(false); setPostponeDate(null); setPostponeNote('') }
  const confirmPostpone = () => {
    if (!postponeDate) return
    // 9am local del día elegido; si es hoy y ya pasaron las 9, ahora mismo (como el producto).
    const chosen = new Date(postponeDate.getFullYear(), postponeDate.getMonth(), postponeDate.getDate(), 9).getTime()
    marcar.mutate({ action: 'POSTPONED', effective_at: new Date(Math.max(chosen, Date.now())).toISOString(), note: postponeNote.trim() || null })
    closePostpone()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('size-8', triggerClassName)} aria-label="Acciones del lead">
            <Icon icon={EllipsisVertical} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!puedeEscribir || postponed || marcar.isPending} onSelect={() => setPostponeOpen(true)}>
            Posponer gestión
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!puedeEscribir}>Cambiar etapa</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={lead.funnel_stage_id ?? ''}
                onValueChange={id => actualizar.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null } })}
              >
                {enFunnel.map(e => (
                  <DropdownMenuRadioItem key={e.id} value={e.id} className="text-xs">
                    <span className="mr-1.5 size-[7px] rounded-full" style={{ background: e.priority?.color ?? 'var(--line-strong)' }} />
                    {e.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {onStartReassign && (
            <DropdownMenuItem disabled={!puedeEscribir} onSelect={() => onStartReassign(lead.id)}>Reasignar</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!puedeEscribir || !descartada || yaDescartado || descartar.isPending}
            onSelect={() => { setDiscardReason(''); setConfirmDiscard(true) }}
          >
            Descartar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {postponeOpen && (
        <AlertDialog open onOpenChange={next => next ? setPostponeOpen(true) : closePostpone()}>
          <AlertDialogContent className="w-auto max-w-fit">
            <AlertDialogHeader>
              <AlertDialogTitle>Posponer gestión</AlertDialogTitle>
              <AlertDialogDescription>
                El lead queda como gestionado hasta la fecha elegida; ahí arranca de nuevo el contador.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <DatePickerCalendar selected={postponeDate ?? undefined} onSelect={setPostponeDate} disabled={{ before: new Date() }} />
            <Textarea value={postponeNote} onChange={e => setPostponeNote(e.target.value)} placeholder="Nota (opcional)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPostpone} disabled={!postponeDate || marcar.isPending}>Posponer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {confirmDiscard && descartada && (
        <AlertDialog open onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Descartar este lead?</AlertDialogTitle>
              <AlertDialogDescription>
                Pasa a «{descartada.label}». El motivo queda en el lead y en su actividad.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea value={discardReason} onChange={e => setDiscardReason(e.target.value)} placeholder="Motivo (opcional)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => descartar.mutate({ leadId: lead.id, etapaId: descartada.id, motivo: discardReason.trim() || null })}
              >
                Descartar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
```

- [ ] **Step 2: `src/pages/crm/components/LeadDialog.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useLeadDetalle } from '../hooks/useLeadDetalle'
import { useActualizarCliente, useActualizarLead } from '../hooks/useLeadMutaciones'
import { nombreDelLead, type ClientData } from '../lib/clientData'
import type { ClientePatch } from '../service/crm.service'
import type { CrmLeadRow } from '../types'
import { ActividadLead } from './ActividadLead'
import { ClientFields, type ClienteExtra } from './ClientFields'
import { ColumnChatSlot, DockedActivityChat, type ChatOrigin } from './DockedActivityChat'
import { LeadRowActions } from './LeadRowActions'
import { LeadTasksPanel } from './LeadTasksPanel'
import { MeetingsPanel } from './MeetingsPanel'

type Pestaña = 'cliente' | 'tareas' | 'reuniones'
const PESTAÑAS: { id: Pestaña; label: string }[] = [
  { id: 'cliente', label: 'Cliente' }, { id: 'tareas', label: 'Tareas' }, { id: 'reuniones', label: 'Reuniones' },
]
const SIN_CANAL = '__sin_canal__'

type Borrador = ClientData & ClienteExtra
const borradorDe = (l: CrmLeadRow): Borrador => ({
  company_name: l.client?.company_name ?? '', first_name: l.client?.first_name ?? '', last_name: l.client?.last_name ?? '',
  phone: l.client?.phone ?? '', email: l.client?.email ?? '',
  alternative_phone_1: l.client?.alternative_phone_1 ?? '', alternative_phone_1_note: l.client?.alternative_phone_1_note ?? '',
  alternative_phone_2: l.client?.alternative_phone_2 ?? '', alternative_phone_2_note: l.client?.alternative_phone_2_note ?? '',
  notes: l.client?.notes ?? '',
})

/* El contenido del dialog, montado por lead (key = id): cambiar de lead con las flechas arranca
   de cero la pestaña y el borrador, igual que cerrar y abrir. */
function CuerpoDelLead({ lead, pestaña }: { lead: CrmLeadRow; pestaña: Pestaña }) {
  const isMobile = useIsMobile()
  const { etapasPorId, etapasActivas, canalesActivos } = useCrmCatalogos()
  const { usuarios, puedeEscribir } = useCarteras()
  const detalleQ = useLeadDetalle(lead.id)
  /* Descartado no se elige acá: pide motivo (menú de acciones). Pero si el lead YA está en
     Descartado, o en una etapa que se borró del funnel, esa opción tiene que estar: si no, el
     select queda en blanco y parece que el lead no tiene etapa. */
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel || e.id === lead.funnel_stage_id)
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  const actualizarLead = useActualizarLead()
  const actualizarCliente = useActualizarCliente()
  const escribe = puedeEscribir(lead.assigned_to)
  const now = Date.now()

  // Borrador local: se escribe acá y se guarda campo por campo al salir (onCommit). Si llega un
  // cambio de otro por realtime mientras no estoy escribiendo, se toma.
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(lead))
  const editando = useRef(false)
  useEffect(() => { if (!editando.current) setBorrador(borradorDe(lead)) }, [lead])

  const guardar = (campo: keyof Borrador) => {
    editando.current = false
    if (!lead.client) return
    const valor = borrador[campo].trim()
    const actual = (lead.client[campo] ?? '').trim()
    if (valor === actual) return
    actualizarCliente.mutate({ clientId: lead.client.id, patch: { [campo]: valor || null } as ClientePatch })
  }

  // La actividad sale de la columna al dejar «Cliente» y aparece acoplada: se registra de dónde.
  const origen = useRef<ChatOrigin | null>(null)
  const alSalir = useCallback((o: ChatOrigin) => { origen.current = o }, [])
  const actividad = (
    <ActividadLead lead={lead} detalle={detalleQ.data} cargando={detalleQ.isLoading} puedeEscribir={escribe} now={now} />
  )
  const responsable = usuarios.find(u => u.id === lead.assigned_to)

  return (
    <>
      {pestaña === 'cliente' && (
        <div className="grid min-h-0 gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_380px] max-md:p-3">
          <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-48 flex-col gap-1">
                <Label className="text-[12.5px] font-semibold">Etapa</Label>
                <Select
                  value={lead.funnel_stage_id ?? ''}
                  disabled={!escribe}
                  onValueChange={id => actualizarLead.mutate({ id: lead.id, patch: { funnel_stage_id: id } })}
                >
                  <SelectTrigger><SelectValue placeholder="Sin etapa" /></SelectTrigger>
                  <SelectContent>
                    {opcionesEtapa.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.deleted_at ? `${e.label} (borrada)` : e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-40 flex-col gap-1">
                <Label className="text-[12.5px] font-semibold">Canal</Label>
                <Select
                  value={lead.channel_id ?? SIN_CANAL}
                  disabled={!escribe}
                  onValueChange={v => actualizarLead.mutate({ id: lead.id, patch: { channel_id: v === SIN_CANAL ? null : v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_CANAL}>Sin canal</SelectItem>
                    {canalesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[12.5px] font-semibold">Responsable</Label>
                <div className="flex h-9 items-center gap-2 text-[13.5px]">
                  <AvatarUsuario usuario={responsable} />
                  {responsable?.nombre ?? 'Sin responsable'}
                </div>
              </div>
            </div>
            {lead.discard_reason && (
              <p className="rounded-md bg-(--surface-2) px-3 py-2 text-[13px] text-(--fg-2)">Motivo del descarte: {lead.discard_reason}</p>
            )}
            <ClientFields
              extendido
              disabled={!escribe}
              data={borrador}
              errors={{}}
              onChange={patch => { editando.current = true; setBorrador(b => ({ ...b, ...patch })) }}
              onCommit={guardar}
            />
          </div>
          {/* Abajo de lg la actividad se apila debajo del cliente (el acoplado no existe en el teléfono). */}
          <ColumnChatSlot onLeave={alSalir} className="flex min-h-[420px] flex-col overflow-hidden rounded-xl bg-card [border:1px_solid_var(--line)] lg:min-h-0">
            {actividad}
          </ColumnChatSlot>
        </div>
      )}
      {pestaña === 'tareas' && (
        <LeadTasksPanel leadId={lead.id} responsableId={lead.assigned_to} puedeEscribir={escribe}
          tareas={detalleQ.data?.tasks ?? []} cargando={detalleQ.isLoading} />
      )}
      {pestaña === 'reuniones' && (
        <MeetingsPanel leadId={lead.id} responsableId={lead.assigned_to} puedeEscribir={escribe}
          reuniones={detalleQ.data?.meetings ?? []} cargando={detalleQ.isLoading} />
      )}
      {pestaña !== 'cliente' && !isMobile && (
        <DockedActivityChat title={`Actividad · ${nombreDelLead(lead.client)}`} getOrigin={() => origen.current}>
          {actividad}
        </DockedActivityChat>
      )}
    </>
  )
}

/**
 * El dialog del lead. Copia del patrón del producto (LeadList.tsx:1767): 94vw × 92vh, a pantalla
 * completa abajo de 768px, NO se cierra clickeando afuera (adentro se edita con guardado al blur
 * y un clic al pasar por el velo tiraba todo abajo) — se sale con Escape o «Volver al panel».
 */
export function LeadDialog({ lead, indice, total, onPaso, onCerrar, onStartReassign }: {
  lead: CrmLeadRow | null
  /** Posición en la lista filtrada; −1 si el lead abierto no está en ella (llegó por enlace). */
  indice: number
  total: number
  onPaso: (delta: -1 | 1) => void
  onCerrar: () => void
  onStartReassign?: (leadId: string) => void
}) {
  const [pestaña, setPestaña] = useState<Pestaña>('cliente')
  const { puedeEscribir } = useCarteras()
  const hayAnterior = indice > 0
  const haySiguiente = indice !== -1 && indice < total - 1
  // Al cambiar de lead vuelve a «Cliente»: es la pestaña que se abre para leer un lead.
  useEffect(() => { setPestaña('cliente') }, [lead?.id])

  return (
    <Dialog open={lead != null} onOpenChange={open => { if (!open) onCerrar() }}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={e => e.preventDefault()}
        /* ↑/↓ hacen lo mismo que los chevrones, con las excepciones del producto: no mientras se
           escribe, no en controles que ya usan flechas, no si alguien más atendió la tecla, no
           desde un portal (popover) que burbujea por el árbol de React. */
        onKeyDown={e => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
          const target = e.target as HTMLElement
          if (!e.currentTarget.contains(target)) return
          if (target.isContentEditable || target.closest('input, textarea, select, [role="listbox"], [role="menu"], [role="combobox"], [role="radiogroup"], [role="slider"], [role="spinbutton"]')) return
          const delta = e.key === 'ArrowUp' ? -1 : 1
          if (delta < 0 ? !hayAnterior : !haySiguiente) return
          e.preventDefault()
          onPaso(delta)
        }}
        className="dialog-fullscreen-mobile grid h-[92vh] max-h-none w-[94vw] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-y-auto p-0 max-md:overflow-hidden lg:overflow-hidden"
      >
        <DialogHeader className="ui-scale max-md:[zoom:1] sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-end gap-2 bg-card px-3 pb-0 pt-1.5 [border-bottom:0.5px_solid_var(--line)] max-md:flex max-md:flex-wrap max-md:items-center max-md:px-2">
          <DialogTitle className="sr-only">{lead ? nombreDelLead(lead.client) : 'Lead'}</DialogTitle>
          <DialogDescription className="sr-only">Cliente, tareas, reuniones y actividad del lead.</DialogDescription>

          <div className="mb-1.5 flex min-w-0 items-center gap-2 max-md:order-1 max-md:mb-0 max-md:flex-1">
            <DialogClose asChild>
              <button type="button" aria-label="Volver al panel"
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors [border:0.5px_solid_var(--line)] hover:bg-(--surface-2) max-md:size-10 max-md:justify-center max-md:px-0">
                <ArrowLeft size={14} />
                <span className="max-md:hidden">Volver al panel</span>
              </button>
            </DialogClose>
            <div className="flex shrink-0 items-center gap-1 max-md:order-4 max-md:ml-auto">
              <button type="button" onClick={() => onPaso(-1)} disabled={!hayAnterior} aria-label="Lead anterior"
                title={hayAnterior ? 'Lead anterior' : 'Es el primero de la lista'}
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg bg-card text-foreground [border:0.5px_solid_var(--line)] hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35">
                <ChevronUp size={15} />
              </button>
              <button type="button" onClick={() => onPaso(1)} disabled={!haySiguiente} aria-label="Lead siguiente"
                title={haySiguiente ? 'Lead siguiente' : 'Es el último de la lista'}
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg bg-card text-foreground [border:0.5px_solid_var(--line)] hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35">
                <ChevronDown size={15} />
              </button>
              {indice !== -1 && <span className="ml-1 text-[11px] tabular-nums text-muted-foreground max-md:hidden">{indice + 1} de {total}</span>}
            </div>
            {lead && (
              <span className="ml-1 min-w-0 truncate text-[15px] font-semibold text-foreground max-md:order-2">{nombreDelLead(lead.client)}</span>
            )}
          </div>

          <div role="tablist" aria-label="Secciones del lead" className="flex items-end gap-1 max-md:order-3 max-md:w-full">
            {PESTAÑAS.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={pestaña === p.id} onClick={() => setPestaña(p.id)}
                className={cn(
                  'h-10 cursor-pointer px-3 text-[13px] font-medium transition-colors max-md:flex-1',
                  pestaña === p.id ? 'text-foreground shadow-[inset_0_-2px_0_var(--brand)]' : 'text-(--fg-2) hover:text-foreground',
                )}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="mb-1.5 flex justify-end max-md:order-2 max-md:mb-0">
            {lead && <LeadRowActions lead={lead} puedeEscribir={puedeEscribir(lead.assigned_to)} onStartReassign={onStartReassign} />}
          </div>
        </DialogHeader>
        {lead && (
          <div className="ui-scale flex min-h-0 flex-col max-md:h-full lg:h-full">
            <CuerpoDelLead key={lead.id} lead={lead} pestaña={pestaña} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

Verificar que `dialog-fullscreen-mobile`
existe en `src/index.css` (`rg -n "dialog-fullscreen-mobile" src/index.css`); si no está, copiar su
regla desde `$PRODUCTO/src/index.css` (es del design system copiado).

- [ ] **Step 3: Conectar el dialog y las acciones en `CrmLeadList.tsx`**

3a. Imports nuevos:
```tsx
import { LeadDialog } from './LeadDialog'
import { LeadRowActions } from './LeadRowActions'
```

3b. En `propsDe`, agregar la última propiedad:
```tsx
    acciones: <LeadRowActions lead={lead} puedeEscribir={agentes.puedeEscribir(lead.assigned_to)} />,
```

3c. Antes del `return` de `CrmLeadList`:
```tsx
  // El lead abierto sale de TODOS los leads y no de los visibles: un enlace a `?lead=` tiene que
  // abrirlo aunque los filtros lo escondan. Las flechas recorren la lista tal como se ve.
  const leadAbiertoId = searchParams.get(LEAD_PARAM)
  const leadAbierto = leadAbiertoId ? (leadsQ.data ?? []).find(l => l.id === leadAbiertoId) ?? null : null
  const indiceAbierto = leadAbierto ? visibles.findIndex(l => l.id === leadAbierto.id) : -1
  const pasoLead = (delta: -1 | 1) => {
    const siguiente = visibles[indiceAbierto + delta]
    if (siguiente) abrirLead(siguiente.id)
  }
```

3d. Como último hijo del fragmento que devuelve `CrmLeadList` (justo antes del `</>` final):
```tsx
      <LeadDialog
        lead={leadAbierto}
        indice={indiceAbierto}
        total={visibles.length}
        onPaso={pasoLead}
        onCerrar={() => abrirLead(null)}
      />
```

Nota: si el lead de `?lead=` no existe o la RLS no lo deja ver, `leadAbierto` es null y el dialog
no abre; el parámetro queda en la URL sin efecto. No se inventa un cartel: es un enlace viejo.

- [ ] **Step 4: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/crm
git commit -m "feat(crm): dialog del lead con Cliente, Tareas y Reuniones, y acciones del renglón"
```

---

### Task 11: Alta de leads y reasignación (de a uno y en lote)

**Files:**
- Create: `src/pages/crm/components/NewLeadDialog.tsx`, `ReassignLeadsDialog.tsx`, `BulkActionBar.tsx`
- Modify: `src/pages/crm/components/CrmLeadList.tsx` (modo selección, barra y dialog de reasignar)
- Modify: `src/pages/crm/Crm.tsx` (botón «Nuevo lead»)

**Interfaces:**
- Consumes: `useCrearLead`, `useReasignar`, `useCarteras`, `useCrmCatalogos`, `particionarReasignacion`,
  `slotsDeCartera`, `mensajeDeError`, `validateClientData`, `localTodayIso`, `nombreDe`.
- Produces:
  - `NewLeadDialog({ open, onOpenChange, onCreado?: (leadId: string) => void })`.
  - `ReassignLeadsDialog({ open, onOpenChange, candidatos: ReassignCandidate[], leads: CrmLeadRow[], isPending, onConfirm: (nuevo: Usuario, mover: ReassignCandidate[]) => void })`.
  - `BulkActionBar({ selectedCount, totalCount?, confirmLabel, onCancel, onConfirm })`.

**Qué se copia de dónde:**
- `BulkActionBar.tsx` ← `$PRODUCTO/src/pages/leads/components/BulkActionBar.tsx`, tal cual salvo
  el prop `destructive` (acá no hay borrado en lote) y el comentario de `totalCount` (acá es el
  total de la lista filtrada, no del servidor).
- `ReassignLeadsDialog.tsx` ← `$PRODUCTO/src/pages/leads/components/ReassignLeadsDialog.tsx`:
  `useOrganizationUsers` → `useCarteras().conEscritura` (solo se ofrecen carteras con write);
  `getLeadSlotsForUser` (una query) → `slotsDeCartera(leads, destino)` (la lista ya está en
  memoria); el reparto → `particionarReasignacion`; el cartel ya no promete «se van a fusionar»
  (acá no hay fusión: dice que esos no se reasignan).
- `NewLeadDialog.tsx`: versión chica de `$PRODUCTO/src/pages/leads/components/NewLeadWizard.tsx`
  (un paso en vez de un asistente: sin briefing, piso ni zonas), contra la RPC.

- [ ] **Step 1: `BulkActionBar.tsx`** — copiar y borrar `destructive`:

```tsx
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * Barra de selección múltiple. Copiada de propelia-frontend
 * (src/pages/leads/components/BulkActionBar.tsx) sin el modo destructivo: acá la única acción en
 * lote es reasignar.
 */
export function BulkActionBar({ selectedCount, totalCount, confirmLabel, onCancel, onConfirm }: {
  selectedCount: number
  /** Cuántos hay en la lista filtrada: «3 de 40» dice qué tan grande es lo que se está moviendo. */
  totalCount?: number
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const { state, isMobile } = useSidebar()
  const leftOffset = isMobile ? '0px' : state === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)'
  return (
    /* `bottom` desde `--tabbar-h`: en el teléfono se apoya encima de la barra de pestañas. */
    <div
      className="ui-scale-reset fixed bottom-(--tabbar-h) right-0 z-10 flex items-center justify-between gap-3 bg-card px-4 py-3 transition-[left] duration-200 ease-linear [border-top:0.5px_solid_var(--line)]"
      style={{ left: leftOffset }}
    >
      <span className="text-sm text-muted-foreground">
        {totalCount != null
          ? `${selectedCount} de ${totalCount} lead${totalCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`
          : `${selectedCount} lead${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onConfirm} disabled={selectedCount === 0}>{confirmLabel}</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `ReassignLeadsDialog.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCarteras } from '../hooks/useCarteras'
import { particionarReasignacion, slotsDeCartera, type ReassignCandidate } from '../lib/reassignCollisions'
import type { CrmLeadRow, Usuario } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/components/ReassignLeadsDialog.tsx). Solo ofrece
   carteras con write (la base rechaza el resto: reasignar exige write en la vieja y en la nueva).
   Las casillas ocupadas del destino salen de la lista en memoria, no de otra consulta. */
export function ReassignLeadsDialog({ open, onOpenChange, candidatos, leads, isPending, onConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  candidatos: ReassignCandidate[]
  leads: CrmLeadRow[]
  isPending: boolean
  onConfirm: (nuevo: Usuario, mover: ReassignCandidate[]) => void
}) {
  const { conEscritura } = useCarteras()
  const [destinoId, setDestinoId] = useState('')
  const [avisoAbierto, setAvisoAbierto] = useState(false)
  const destino = conEscritura.find(u => u.id === destinoId) ?? null

  const reparto = useMemo(
    () => particionarReasignacion(candidatos, destinoId, destinoId ? slotsDeCartera(leads, destinoId) : []),
    [candidatos, destinoId, leads],
  )

  const cerrar = (v: boolean) => {
    if (!v) { setDestinoId(''); setAvisoAbierto(false) }
    onOpenChange(v)
  }

  const mandar = () => {
    if (!destino) return
    // Nada que mover (todos chocan o ya eran de ese responsable): se dice y no se llama a la base.
    if (reparto.mover.length === 0) {
      toast.warning(reparto.chocan.length > 0
        ? `No se reasignó ninguno: ${destino.nombre} ya tiene un lead de ${reparto.chocan.length === 1 ? 'ese cliente' : 'esos clientes'}.`
        : `Ya ${candidatos.length === 1 ? 'es' : 'son'} de ${destino.nombre}.`)
      cerrar(false)
      return
    }
    onConfirm(destino, reparto.mover)
  }

  const confirmar = () => {
    if (!destino) return
    if (reparto.chocan.length > 0) { setAvisoAbierto(true); return }
    mandar()
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Reasignar {candidatos.length === 1 ? 'el lead' : `${candidatos.length} leads`} a…
          </DialogTitle>
        </DialogHeader>
        <Select value={destinoId} onValueChange={setDestinoId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Elegí un responsable" /></SelectTrigger>
          <SelectContent>
            {conEscritura.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!destino || isPending}>Confirmar</Button>
        </DialogFooter>

        {/* Descendiente del Dialog y no hermano: con un hermano, la capa de dismissal de Radix
            decide por árbol de React y el cartel se cerraría junto con el diálogo de abajo. */}
        <AlertDialog open={avisoAbierto} onOpenChange={setAvisoAbierto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {reparto.chocan.length === 1 ? 'Uno no se puede reasignar' : `${reparto.chocan.length} no se pueden reasignar`}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>{destino?.nombre ?? 'Ese responsable'} ya tiene un lead de:</p>
                  <ul className="list-disc pl-5">{reparto.chocan.map(c => <li key={c.id}>{c.clientName}</li>)}</ul>
                  <p>
                    {reparto.mover.length > 0
                      ? `Se reasignan los otros ${reparto.mover.length}; esos quedan donde están.`
                      : 'No queda ninguno para reasignar.'}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setAvisoAbierto(false); mandar() }} disabled={isPending}>
                {reparto.mover.length > 0 ? 'Reasignar los demás' : 'Entendido'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: `NewLeadDialog.tsx`**

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { localTodayIso } from '@/lib/calendarDate'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrearLead } from '../hooks/useLeadMutaciones'
import { EMPTY_CLIENT, validateClientData, type ClientData, type ClientDataErrors } from '../lib/clientData'
import { mensajeDeError } from '../lib/errores'
import { ClientFields } from './ClientFields'

const SIN_CANAL = '__sin_canal__'

/**
 * NUEVO: la versión chica de NewLeadWizard del producto. Un paso: empresa, contacto, teléfono,
 * email, canal y responsable. Contra `crm_create_lead_with_client`, que reutiliza el cliente si ya
 * existe (aunque sea de otra cartera) y crea la tarea «Asesorar cliente» con vencimiento HOY —el
 * hoy de quien carga, por eso la fecha sale de acá y no del servidor—.
 */
export function NewLeadDialog({ open, onOpenChange, onCreado }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreado?: (leadId: string) => void
}) {
  const { myId, conEscritura } = useCarteras()
  const { canalesActivos } = useCrmCatalogos()
  const crear = useCrearLead()
  const [data, setData] = useState<ClientData>(EMPTY_CLIENT)
  const [errors, setErrors] = useState<ClientDataErrors>({})
  const [canal, setCanal] = useState(SIN_CANAL)
  const [responsable, setResponsable] = useState('')
  const [errorBase, setErrorBase] = useState<string | null>(null)
  // Yo por defecto. Si no tengo write sobre mí mismo (inactivo) no hay a quién: el botón se apaga.
  const responsableId = responsable || (conEscritura.some(u => u.id === myId) ? myId ?? '' : '')

  const cerrar = (v: boolean) => {
    if (!v) { setData(EMPTY_CLIENT); setErrors({}); setCanal(SIN_CANAL); setResponsable(''); setErrorBase(null) }
    onOpenChange(v)
  }

  const enviar = async () => {
    const errs = validateClientData(data)
    // Un lead sin empresa ni persona no se reconoce en la lista.
    if (!data.company_name.trim() && !data.first_name.trim()) errs.company_name = 'Poné la empresa o el nombre'
    setErrors(errs)
    if (Object.keys(errs).length > 0 || !responsableId) return
    setErrorBase(null)
    try {
      const r = await crear.mutateAsync({
        assignedTo: responsableId,
        initialTaskDueDate: localTodayIso(),
        companyName: data.company_name,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone,
        channelId: canal === SIN_CANAL ? null : canal,
        funnelStageId: null,
      })
      cerrar(false)
      onCreado?.(r.lead_id)
    } catch (e) {
      // Adentro del dialog y no en un toast: el que tiene que corregir algo está mirando el formulario.
      setErrorBase(mensajeDeError(e, 'No se pudo crear el lead.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[560px] max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none">
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
          <DialogDescription>Si el teléfono o el email ya son de un cliente, se reutiliza.</DialogDescription>
        </DialogHeader>
        <ClientFields data={data} errors={errors} onChange={patch => setData(d => ({ ...d, ...patch }))} />
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <div className="flex flex-col gap-1">
            <Label className="text-[12.5px] font-semibold">Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_CANAL}>Sin canal</SelectItem>
                {canalesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Solo si hay dónde elegir: un SDR sin accesos carga siempre en su cartera. */}
          {conEscritura.length > 1 && (
            <div className="flex flex-col gap-1">
              <Label className="text-[12.5px] font-semibold">Responsable</Label>
              <Select value={responsableId} onValueChange={setResponsable}>
                <SelectTrigger><SelectValue placeholder="Elegí" /></SelectTrigger>
                <SelectContent>
                  {conEscritura.map(u => <SelectItem key={u.id} value={u.id}>{u.id === myId ? `${u.nombre} (vos)` : u.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {errorBase && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{errorBase}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
          <Button onClick={() => void enviar()} disabled={crear.isPending || !responsableId}>
            {crear.isPending ? 'Creando…' : 'Crear lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
Verificar que existan las clases `bg-danger-soft`/`text-danger` en `src/index.css`
(`rg -n "danger-soft" src/index.css`); si no, usar `bg-destructive/10 text-destructive`.

- [ ] **Step 4: Modo selección y reasignación en `CrmLeadList.tsx`**

4a. Imports: agregar `useState` al import de react y

```tsx
import { useReasignar } from '../hooks/useLeadMutaciones'
import { nombreDe } from '../lib/permisos'
import type { ReassignCandidate } from '../lib/reassignCollisions'
import { BulkActionBar } from './BulkActionBar'
import { ReassignLeadsDialog } from './ReassignLeadsDialog'
```

4b. Después de `const agentes = useVisibleAgents()`:

```tsx
  // Reasignar: desde el menú de un renglón se entra al modo selección con ese lead marcado (como
  // el producto); desde el dialog del lead se reasigna ese solo, sin pasar por la selección.
  const [seleccionando, setSeleccionando] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set())
  const [aReasignar, setAReasignar] = useState<string[] | null>(null)
  const reasignar = useReasignar()
  const empezarSeleccion = (leadId: string) => { setSeleccionando(true); setMarcados(new Set([leadId])) }
  const salirDeSeleccion = () => { setSeleccionando(false); setMarcados(new Set()) }
  const alternarMarcado = (leadId: string) => setMarcados(prev => {
    const next = new Set(prev)
    if (next.has(leadId)) next.delete(leadId)
    else next.add(leadId)
    return next
  })
```

4c. En `propsDe`, reemplazar la línea de `acciones` por estas dos:

```tsx
    acciones: <LeadRowActions lead={lead} puedeEscribir={agentes.puedeEscribir(lead.assigned_to)} onStartReassign={empezarSeleccion} />,
    // Solo se puede marcar lo que se puede mover: un lead de una cartera de solo lectura sigue
    // abriéndose con el clic, como fuera del modo selección.
    seleccion: seleccionando && agentes.puedeEscribir(lead.assigned_to)
      ? { marcado: marcados.has(lead.id), onToggle: () => alternarMarcado(lead.id) }
      : undefined,
```

4d. Antes del `return`, junto al cálculo del lead abierto:

```tsx
  const candidatos = (ids: string[]): ReassignCandidate[] => (leadsQ.data ?? [])
    .filter(l => ids.includes(l.id))
    .map(l => ({ id: l.id, clientId: l.client_id, clientName: nombreDelLead(l.client), assignedTo: l.assigned_to }))
```

4e. Al `<LeadDialog …/>` sumarle `onStartReassign={leadId => setAReasignar([leadId])}`, y
después de él, dentro del mismo fragmento:

```tsx
      {seleccionando && (
        <BulkActionBar
          selectedCount={marcados.size}
          totalCount={visibles.length}
          confirmLabel="Reasignar leads"
          onCancel={salirDeSeleccion}
          onConfirm={() => setAReasignar([...marcados])}
        />
      )}

      {aReasignar && (
        <ReassignLeadsDialog
          open
          onOpenChange={abierto => { if (!abierto) setAReasignar(null) }}
          candidatos={candidatos(aReasignar)}
          leads={leadsQ.data ?? []}
          isPending={reasignar.isPending}
          onConfirm={(nuevo, mover) => reasignar.mutate(
            { items: mover.map(c => ({ leadId: c.id, deNombre: nombreDe(agentes.usuarios, c.assignedTo) })), nuevo },
            { onSettled: () => { setAReasignar(null); salirDeSeleccion() } },
          )}
        />
      )}
```

- [ ] **Step 5: Botón «Nuevo lead» en `Crm.tsx`** — el archivo queda:

```tsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { AgentFilterButton } from './components/AgentFilterButton'
import { CrmLeadList } from './components/CrmLeadList'
import { NewLeadDialog } from './components/NewLeadDialog'
import { useCrmRealtime } from './hooks/useCrmRealtime'
import { LEAD_PARAM } from './lib/leadFilterParams'

/* Cabecera (carteras, funnel, canales, + Nuevo lead) y la lista. El realtime se abre acá y no en
   la lista: vive lo que vive la página. */
export function Crm() {
  useCrmRealtime()
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [, setSearchParams] = useSearchParams()
  // Recién creado, se abre: lo próximo que se hace con un lead nuevo es trabajarlo.
  const abrir = (leadId: string) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    p.set(LEAD_PARAM, leadId)
    return p
  }, { replace: true })

  return (
    <div className="ui-scale-md flex flex-col">
      <header className="flex items-center justify-end gap-2 px-4 pb-2 pt-3 max-md:px-2">
        <h1 className="mr-auto text-lg font-semibold text-foreground">CRM</h1>
        <AgentFilterButton />
        <Button onClick={() => setAltaAbierta(true)}>
          <Icon icon={PlusIcon} size="xs" />
          <span className="hidden md:inline">Nuevo lead</span>
          <span className="md:hidden">Nuevo</span>
        </Button>
      </header>
      <div className="p-1 max-md:p-0">
        <CrmLeadList />
      </div>
      <NewLeadDialog open={altaAbierta} onOpenChange={setAltaAbierta} onCreado={abrir} />
    </div>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/crm
git commit -m "feat(crm): alta de leads por RPC y reasignación de a uno y en lote"
```

---

### Task 12: Configuración del funnel y de los canales (solo SUPERADMIN)

**Files:**
- Create: `src/pages/crm/lib/managementTolerance.ts` (copia tal cual)
- Create: `src/pages/crm/hooks/useCatalogoMutaciones.ts`
- Create: `src/pages/crm/components/ManagementToleranceSelect.tsx`, `PriorityPicker.tsx`,
  `StagesTable.tsx`, `FunnelConfigDialog.tsx`, `ChannelsPanel.tsx`, `ManageChannelsDialog.tsx`
- Modify: `src/pages/crm/Crm.tsx` (los dos botones, solo para SUPERADMIN)

**Interfaces:**
- Consumes: servicio de catálogo (Task 7), `useCrmCatalogos`, `useCarteras().esSuperadmin`.
- Produces: `useCatalogoMutaciones()` → `{ crearEtapa, actualizarEtapa, borrarEtapa, reordenarEtapas,
  crearPrioridad, actualizarPrioridad, borrarPrioridad, reordenarPrioridades, crearCanal,
  actualizarCanal, borrarCanal, reordenarCanales }` (cada uno un `useMutation`);
  `FunnelConfigDialog()`, `ManageChannelsDialog()` (cada uno trae su botón disparador).

**Qué se copia de dónde:**
- `managementTolerance.ts` ← `$PRODUCTO/src/lib/managementTolerance.ts`, tal cual.
- `ManagementToleranceSelect.tsx` ← `$PRODUCTO/src/components/ManagementToleranceSelect.tsx`,
  tal cual con el import `'../lib/managementTolerance'`.
- `PriorityPicker.tsx` ← `$PRODUCTO/src/pages/clients/components/FunnelSection/FunnelEditor/PriorityPicker.tsx`:
  `import type { Priority } from '@/types/priorities.types'` → `import type { CrmPriority as Priority } from '../types'`.
  Y el color, que allá no se usa y acá es el de la etapa en toda la pantalla: en el disparador,
  `<span className="truncate">{selected.name}</span>` pasa a
  `<><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: selected.color }} /><span className="truncate">{selected.name}</span></>`,
  y en cada fila `<span className="truncate">{p.name}</span>` pasa a
  `<><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: p.color }} /><span className="truncate">{p.name}</span></>`.
  Nada más cambia.
- `StagesTable.tsx` ← `$PRODUCTO/src/pages/clients/components/FunnelSection/FunnelEditor/StagesTable.tsx`:
  `UnifiedStage` → `EtapaConPrioridad`; `Priority` → `CrmPriority`; se borra el import de
  `@/lib/unifiedStages` y `groupStagesByCross` se reemplaza por el reparto de abajo; `onUpdate`
  pierde el tercer argumento (`stage._type`: acá hay un solo funnel) y todas sus llamadas lo pierden;
  los imports de `ManagementToleranceSelect` y `PriorityPicker` pasan a `./…`. `InlineEditCell`,
  `InlineDeleteButton` y `LockedLabel` ya están en `src/components/ui`.
- `FunnelConfigDialog.tsx` ← `$PRODUCTO/src/pages/clients/components/FunnelSection/FunnelConfigDialog.tsx`
  + `FunnelEditor.tsx` fundidos: sin `organizationId`, sin etapas de propiedad.
- `ChannelsPanel.tsx` ← `$PRODUCTO/src/pages/ajustes/components/ChannelsPanel.tsx`: la query
  `lead_channels` → `useCrmCatalogos().canalesActivos`; `useLeadChannelMutations` →
  `useCatalogoMutaciones`; `LeadChannel` → `CrmChannel`; sin `onChannelCreated/Deleted`.
- `ManageChannelsDialog.tsx`: el del producto vive anidado en el asistente y por eso arma su propio
  velo con `modal={false}`; acá se abre desde la cabecera y es un `Dialog` común.

- [ ] **Step 1: Copias tal cual**

```bash
PRODUCTO=/mnt/c/Users/anton/Documents/programacion/propelia/propelia-frontend
cp $PRODUCTO/src/lib/managementTolerance.ts src/pages/crm/lib/
cp $PRODUCTO/src/components/ManagementToleranceSelect.tsx src/pages/crm/components/
cp $PRODUCTO/src/pages/clients/components/FunnelSection/FunnelEditor/PriorityPicker.tsx src/pages/crm/components/
cp $PRODUCTO/src/pages/clients/components/FunnelSection/FunnelEditor/StagesTable.tsx src/pages/crm/components/
cp $PRODUCTO/src/pages/ajustes/components/ChannelsPanel.tsx src/pages/crm/components/
sd "'@/lib/managementTolerance'" "'../lib/managementTolerance'" src/pages/crm/components/ManagementToleranceSelect.tsx
```
Después aplicar a mano las podas de `PriorityPicker`, `StagesTable` y `ChannelsPanel` descriptas arriba.

- [ ] **Step 2: El reparto de `StagesTable`** — reemplazar

```tsx
  const { sinCruce, conCruce, discarded: outOfFunnel } = groupStagesByCross(stages)
  const inFunnel = [...sinCruce, ...conCruce]
```
por

```tsx
  // Un solo funnel: en orden por posición, y los que están fuera (Descartado) en su caja aparte.
  const vivas = stages.filter(s => s.deleted_at == null).sort((a, b) => a.position - b.position)
  const inFunnel = vivas.filter(s => !s.is_out_of_funnel)
  const outOfFunnel = vivas.filter(s => s.is_out_of_funnel)
```
y la firma de `onUpdate` en `Props` pasa a
`onUpdate: (id: string, payload: { label?: string; priority_id?: string | null; management_tolerance_hours?: number | null }) => void`.
Verificar: `rg -n "_type|unifiedStages|groupStagesByCross|@/types" src/pages/crm/components/StagesTable.tsx` → nada.

- [ ] **Step 3: `src/pages/crm/hooks/useCatalogoMutaciones.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensajeDeError } from '../lib/errores'
import {
  actualizarCanal, actualizarEtapa, actualizarPrioridad, borrarCanal, borrarEtapa, borrarPrioridad,
  crearCanal, crearEtapa, crearPrioridad, reordenarCanales, reordenarEtapas, reordenarPrioridades,
} from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* El catálogo cambia poco y lo toca uno solo (SUPERADMIN): sin optimismo, se re-trae al terminar.
   Los leads no se invalidan: guardan ids, y el nombre y el color los resuelve el catálogo. */
export function useCatalogoMutaciones() {
  const qc = useQueryClient()
  const opciones = {
    onError: (e: unknown) => { toast.error(mensajeDeError(e, 'No se pudo guardar el cambio.')) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.catalogos }) },
  }
  return {
    crearEtapa: useMutation({ mutationFn: crearEtapa, ...opciones }),
    actualizarEtapa: useMutation({ mutationFn: (v: { id: string; payload: Parameters<typeof actualizarEtapa>[1] }) => actualizarEtapa(v.id, v.payload), ...opciones }),
    borrarEtapa: useMutation({ mutationFn: borrarEtapa, ...opciones }),
    reordenarEtapas: useMutation({ mutationFn: reordenarEtapas, ...opciones }),
    crearPrioridad: useMutation({ mutationFn: crearPrioridad, ...opciones }),
    actualizarPrioridad: useMutation({ mutationFn: (v: { id: string; payload: { name?: string; color?: string } }) => actualizarPrioridad(v.id, v.payload), ...opciones }),
    borrarPrioridad: useMutation({ mutationFn: borrarPrioridad, ...opciones }),
    reordenarPrioridades: useMutation({ mutationFn: reordenarPrioridades, ...opciones }),
    crearCanal: useMutation({ mutationFn: crearCanal, ...opciones }),
    actualizarCanal: useMutation({ mutationFn: (v: { id: string; payload: { label: string } }) => actualizarCanal(v.id, v.payload), ...opciones }),
    borrarCanal: useMutation({ mutationFn: borrarCanal, ...opciones }),
    reordenarCanales: useMutation({ mutationFn: reordenarCanales, ...opciones }),
  }
}
```

- [ ] **Step 4: `src/pages/crm/components/FunnelConfigDialog.tsx`**

```tsx
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useCatalogoMutaciones } from '../hooks/useCatalogoMutaciones'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { StagesTable } from './StagesTable'

// Colores para las prioridades nuevas, por turno: la pantalla no tiene selector de color (se
// cambia por MCP si hace falta) y una prioridad sin color no se distingue en el funnel.
const PALETA = ['#639922', '#EF9F27', '#E24B4A', '#B84300', '#3B7DD8', '#8E5BD0', '#2A9D8F', '#6B7280']

/* Copiado de propelia-frontend (FunnelConfigDialog + FunnelEditor, fundidos): acá hay un solo
   funnel y ninguna organización. Crear, renombrar, reordenar y borrar etapas con su prioridad y
   tolerancia; `allow_delete`/`allow_reorder`/`allow_rename` se respetan (Nuevo y Descartado no se
   borran). Solo lo monta la cabecera para un SUPERADMIN; la RLS lo exige igual. */
export function FunnelConfigDialog() {
  const { etapasPorId, prioridadesActivas, isLoading } = useCrmCatalogos()
  const m = useCatalogoMutaciones()
  const etapas = [...etapasPorId.values()]

  const crear = () => {
    const enFunnel = etapas.filter(e => e.deleted_at == null && !e.is_out_of_funnel)
    const nueva = Math.max(0, ...enFunnel.map(e => e.position)) + 1
    // Se corre +1 todo lo que está desde esa posición (Descartado incluido), para que la nueva
    // entre al final del funnel y antes de los de afuera, como en el producto.
    const correr = etapas.filter(e => e.deleted_at == null && e.position >= nueva).map(e => ({ id: e.id, position: e.position + 1 }))
    if (correr.length > 0) m.reordenarEtapas.mutate(correr)
    m.crearEtapa.mutate({
      label: 'Nueva etapa', value: 'CUSTOM', position: nueva, priority_id: prioridadesActivas[0]?.id ?? null,
      management_tolerance_hours: 24, is_out_of_funnel: false, allow_delete: true, allow_reorder: true, allow_rename: true,
    })
  }

  const crearPrioridad = async (): Promise<string | null> => {
    try {
      const creada = await m.crearPrioridad.mutateAsync({
        name: 'Nueva prioridad', color: PALETA[prioridadesActivas.length % PALETA.length], position: prioridadesActivas.length + 1,
      })
      return creada.id
    } catch {
      return null
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Fantasma: se toca una vez al mes; no compite con «Nuevo lead». */}
        <Button variant="ghost">
          <Icon icon={SlidersHorizontal} size="xs" />
          Funnel
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] p-4 sm:max-w-[1080px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Configuración del funnel</DialogTitle>
          <DialogDescription>Las etapas por las que pasa un lead, en orden, con su prioridad y su tiempo de gestión. Los cambios se guardan solos.</DialogDescription>
        </DialogHeader>
        <div className="ui-scale overflow-x-auto">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-secondary" />
          ) : (
            <StagesTable
              stages={etapas}
              priorities={prioridadesActivas}
              onUpdate={(id, payload) => m.actualizarEtapa.mutate({ id, payload })}
              onCreate={crear}
              onDelete={id => m.borrarEtapa.mutate(id)}
              onReorder={items => m.reordenarEtapas.mutate(items)}
              isDeletePending={m.borrarEtapa.isPending}
              onRenamePriority={(id, name) => m.actualizarPrioridad.mutate({ id, payload: { name } })}
              onDeletePriority={id => m.borrarPrioridad.mutate(id)}
              onCreatePriority={crearPrioridad}
              onReorderPriorities={items => m.reordenarPrioridades.mutate(items)}
              isPriorityDeletePending={m.borrarPrioridad.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: `ChannelsPanel.tsx`** — con las podas descriptas, la cabeza del componente queda:

```tsx
import { useRef, useState } from 'react'
import { LockIcon, PlusIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineDeleteButton } from '@/components/ui/inline-delete-button'
import { cn } from '@/lib/utils'
import { useCatalogoMutaciones } from '../hooks/useCatalogoMutaciones'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import type { CrmChannel } from '../types'

type DropTarget = { id: string; position: 'before' | 'after' } | null

/* Copiado de propelia-frontend (src/pages/ajustes/components/ChannelsPanel.tsx). La tabla de
   canales arranca vacía y se carga desde acá. */
export function ChannelsPanel() {
  const { canalesActivos: channels, isLoading } = useCrmCatalogos()
  const m = useCatalogoMutaciones()
  const [newLabel, setNewLabel] = useState('')
  const dragId = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-secondary" />

  const sorted = [...channels].sort((a, b) => a.position - b.position)

  const handleCreate = () => {
    const label = newLabel.trim()
    if (!label) return
    const last = sorted[sorted.length - 1]
    m.crearCanal.mutate({ label, position: last ? last.position + 1 : 1 })
    setNewLabel('')
  }
```
y en el resto del JSX: `mutations.reorder.mutate(…)` → `m.reordenarCanales.mutate(…)`;
`mutations.update.mutate({ id: channel.id, payload: { label } })` → `m.actualizarCanal.mutate({ id: channel.id, payload: { label } })`;
`mutations.delete.mutate(channel.id, { onSuccess: … })` → `m.borrarCanal.mutate(channel.id)`;
`mutations.delete.isPending` → `m.borrarCanal.isPending`; `(channel: LeadChannel)` → `(channel: CrmChannel)`.
Verificar: `rg -n "mutations\.|LeadChannel|lead_channels|@/service|@/hooks" src/pages/crm/components/ChannelsPanel.tsx` → nada.

- [ ] **Step 6: `ManageChannelsDialog.tsx`**

```tsx
import { Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { ChannelsPanel } from './ChannelsPanel'

/* El del producto se anida en el asistente de alta y por eso arma su velo a mano (modal={false});
   acá se abre desde la cabecera y es un Dialog común. */
export function ManageChannelsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={Radio} size="xs" />
          Canales
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Canales de origen</DialogTitle>
          <DialogDescription>Por dónde llegó cada inmobiliaria. Arrastrá para reordenar.</DialogDescription>
        </DialogHeader>
        <ChannelsPanel />
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Los botones en la cabecera** — en `Crm.tsx`:

```tsx
import { FunnelConfigDialog } from './components/FunnelConfigDialog'
import { ManageChannelsDialog } from './components/ManageChannelsDialog'
import { useCarteras } from './hooks/useCarteras'
```
dentro de `Crm()`: `const { esSuperadmin } = useCarteras()`; y entre `<AgentFilterButton />` y el
botón «Nuevo lead»:

```tsx
        {/* Solo SUPERADMIN (la RLS lo exige igual): un SDR que renombra una etapa desarma el
            funnel de todos. En el teléfono no: se configura una vez al mes, desde el escritorio. */}
        {esSuperadmin && (
          <div className="hidden md:contents">
            <FunnelConfigDialog />
            <ManageChannelsDialog />
          </div>
        )}
```

- [ ] **Step 8: Typecheck y restos**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
rg -n "organizationId|organization_id|lead_properties|propertyStages|PropertyFunnel" src/pages/crm
```
Expected: `TSC OK`; el `rg` no encuentra nada.

- [ ] **Step 9: Commit**

```bash
git add src/pages/crm
git commit -m "feat(crm): configuración del funnel y de los canales para SUPERADMIN"
```

---

### Task 13: Equipo — la página, sus números y la matriz de visibilidad

**Files:**
- Modify: `src/components/nav.ts`, `src/components/nav.test.ts`, `src/App.tsx`
- Create: `src/pages/equipo/Equipo.tsx`, `src/pages/equipo/lib/estadisticasPorCartera.ts`,
  `src/pages/equipo/lib/estadisticasPorCartera.test.ts`, `src/pages/equipo/components/TablaEquipo.tsx`,
  `src/pages/equipo/components/VisibilityMatrix.tsx`

**Interfaces:**
- Consumes: `useCarteras`, `useCrmLeads`, `useTareasPendientes`, `useReunionesDelMes`, `useCrmCatalogos`,
  `useCrmRealtime`, `enlaceAlCrm`, `setAcceso`, `etapaDelLead`, `gestionDeLead`, `estaVencida`, `esDescartado`.
- Produces:
  - `NAV` con `/equipo` entre `/crm` y `/caja`.
  - `estadisticasPorCartera(input: { carteras: Usuario[]; leads: CrmLeadRow[]; tareasPendientes: CrmTask[];
    reunionesDelMes: CrmMeeting[]; etapas: ReadonlyMap<string, EtapaConPrioridad>; hoy: string; now: number }): FilaEquipo[]`
    con `FilaEquipo = { usuario: Usuario; leadsActivos: number; porEtapa: TramoEtapa[]; gestionesVencidas: number;
    tareasVencidas: number; reunionesMes: number }` y `TramoEtapa = { etapaId: string | null; label: string; color: string; cantidad: number }`.

**Qué se copia de dónde:** `VisibilityMatrix.tsx` ← `$PRODUCTO/src/pages/equipo/components/VisibilityMatrix.tsx`
con `useDataAccess` → `useCarteras()` (mismas filas: usuarios activos y `crm_data_access`) y
`useSetDataAccess` → un `useMutation` sobre `setAcceso`; `displayName`/`initials` → `nombre` y
`AvatarUsuario`; sin el bloque comentado del cartel «en preparación» (acá el permiso SÍ muerde).

**Nota de la spec:** la entrada de `NAV` pide el ícono `Users`, pero `Users` ya es el del CRM.
Se usa `UsersRound` para que las dos entradas no se confundan en la barra plegada.

- [ ] **Step 1: Test que falla — `src/components/nav.test.ts`**: cambiar el caso de `NAV` por

```ts
describe('NAV', () => {
  it('son las cinco páginas, en este orden', () => {
    expect(NAV.map(n => n.path)).toEqual(['/roadmap', '/backlog', '/crm', '/equipo', '/caja'])
  })
})
```

- [ ] **Step 2: `src/components/nav.ts`** — import `UsersRound` de lucide-react y agregar, entre
  `crm` y `caja`:

```ts
  { id: 'equipo', icon: UsersRound, label: 'Equipo', path: '/equipo' },
```

- [ ] **Step 3: Tests que fallan — `src/pages/equipo/lib/estadisticasPorCartera.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, CrmMeeting, CrmTask, EtapaConPrioridad, Usuario } from '@/pages/crm/types'
import { estadisticasPorCartera } from './estadisticasPorCartera'

const NOW = new Date(2026, 8, 30, 12).getTime()
const HOY = '2026-09-30'
const u = (id: string): Usuario => ({ id, email: '', nombre: id, iniciales: 'XX', color: '#000', rol: 'SDR', activo: true })
const etapa = (id: string, position: number, over: Partial<EtapaConPrioridad> = {}): EtapaConPrioridad => ({
  id, label: id, value: id, position, priority_id: null, is_out_of_funnel: false, allow_delete: true, allow_reorder: true,
  allow_rename: true, management_tolerance_hours: 24, created_at: '', updated_at: '', deleted_at: null, priority: null, ...over,
})
const ETAPAS = new Map([
  ['nuevo', etapa('nuevo', 1, { priority: { id: 'p', name: 'Verde', color: '#0f0', position: 1, management_tolerance_hours: 24, show_in_filters: true, created_at: '', updated_at: '', deleted_at: null } })],
  ['vieja', etapa('vieja', 2, { deleted_at: '2026-09-01' })],
  ['desc', etapa('desc', 3, { value: 'DISCARDED', is_out_of_funnel: true, management_tolerance_hours: null })],
])
const lead = (id: string, assigned: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: id, assigned_to: assigned, funnel_stage_id: 'nuevo', channel_id: null, discard_reason: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: '', updated_at: '', deleted_at: null, client: null, ...over,
})
const tarea = (id: string, assigned: string, due: string): CrmTask => ({
  id, lead_id: null, title: '', due_date: due, planned_for: null, assigned_to: assigned, completed: false,
  completed_at: null, recurrence: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
})
const reunion = (id: string, assigned: string, status: CrmMeeting['status']): CrmMeeting => ({
  id, lead_id: null, assigned_to: assigned, starts_at: '', ends_at: '', status, title: null, description: null,
  cancel_reason: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
})

describe('estadisticasPorCartera', () => {
  const [ana, beto] = estadisticasPorCartera({
    carteras: [u('ana'), u('beto')],
    leads: [
      lead('a1', 'ana'),
      lead('a2', 'ana', { gestion_has_events: false }),         // gestión vencida
      lead('a3', 'ana', { funnel_stage_id: null }),             // Review Focus 2: sin etapa
      lead('a4', 'ana', { funnel_stage_id: 'vieja' }),          // etapa borrada: se sigue leyendo
      lead('a5', 'ana', { funnel_stage_id: 'desc' }),           // descartado: no es activo
    ],
    tareasPendientes: [tarea('t1', 'ana', '2026-09-29'), tarea('t2', 'ana', HOY), tarea('t3', 'beto', '2026-09-01')],
    reunionesDelMes: [reunion('r1', 'ana', 'scheduled'), reunion('r2', 'ana', 'completed'), reunion('r3', 'ana', 'cancelled')],
    etapas: ETAPAS,
    hoy: HOY,
    now: NOW,
  })

  it('una fila por cartera, en el orden dado', () => {
    expect([ana.usuario.id, beto.usuario.id]).toEqual(['ana', 'beto'])
  })
  it('activos sin los descartados', () => expect(ana.leadsActivos).toBe(4))
  it('por etapa en orden de funnel, sin etapa al final y en gris', () => {
    expect(ana.porEtapa.map(t => [t.label, t.cantidad])).toEqual([['nuevo', 2], ['vieja', 1], ['Sin etapa', 1]])
    expect(ana.porEtapa[0].color).toBe('#0f0')
  })
  // Solo a2 (sin eventos): sin etapa no hay plazo, así que a3 está «Gestionado» (Review Focus 2),
  // y a1/a4 tienen una gestión de hoy.
  it('gestiones vencidas', () => expect(ana.gestionesVencidas).toBe(1))
  it('tareas vencidas: la de hoy no cuenta', () => {
    expect(ana.tareasVencidas).toBe(1)
    expect(beto.tareasVencidas).toBe(1)
  })
  it('reuniones del mes sin las canceladas', () => expect(ana.reunionesMes).toBe(2))
  it('una cartera sin nada da ceros, no revienta', () => {
    expect(beto).toMatchObject({ leadsActivos: 0, porEtapa: [], gestionesVencidas: 0, reunionesMes: 0 })
  })
})
```

- [ ] **Step 4: Implementar `src/pages/equipo/lib/estadisticasPorCartera.ts`**

```ts
import { etapaDelLead } from '@/pages/crm/lib/effectiveStage'
import { gestionDeLead } from '@/pages/crm/lib/gestionStatus'
import { estaVencida } from '@/pages/crm/lib/tareas'
import type { CrmLeadRow, CrmMeeting, CrmTask, EtapaConPrioridad, Usuario } from '@/pages/crm/types'

export type TramoEtapa = { etapaId: string | null; label: string; color: string; cantidad: number }
export type FilaEquipo = {
  usuario: Usuario
  leadsActivos: number
  porEtapa: TramoEtapa[]
  gestionesVencidas: number
  tareasVencidas: number
  reunionesMes: number
}

/**
 * Los números de Equipo › Tabla, en el cliente y con las mismas funciones puras del CRM: así el
 * número de una celda y lo que muestra el CRM al tocarla salen de la misma regla. La RLS ya
 * recortó los datos de entrada: no puede aparecer un número de una cartera ajena.
 *
 * «Activo» = no borrado y no descartado (fuera del funnel). Las gestiones vencidas se cuentan
 * sobre los activos: un descartado no es trabajo pendiente (el CRM tampoco lo muestra por defecto).
 */
export function estadisticasPorCartera(input: {
  carteras: Usuario[]
  leads: CrmLeadRow[]
  tareasPendientes: CrmTask[]
  reunionesDelMes: CrmMeeting[]
  etapas: ReadonlyMap<string, EtapaConPrioridad>
  hoy: string
  now: number
}): FilaEquipo[] {
  const { carteras, leads, tareasPendientes, reunionesDelMes, etapas, hoy, now } = input
  return carteras.map(usuario => {
    const activos = leads.filter(l => l.assigned_to === usuario.id && l.deleted_at == null
      && etapaDelLead(l, etapas)?.is_out_of_funnel !== true)

    const porId = new Map<string | null, TramoEtapa & { position: number }>()
    for (const l of activos) {
      const e = etapaDelLead(l, etapas)
      const clave = e?.id ?? null
      const tramo = porId.get(clave) ?? {
        etapaId: clave,
        label: e?.label ?? 'Sin etapa',
        color: e ? e.priority?.color ?? 'var(--fg-faint)' : 'var(--line-strong)',
        cantidad: 0,
        // Sin etapa va al final de la barra.
        position: e?.position ?? Number.MAX_SAFE_INTEGER,
      }
      tramo.cantidad++
      porId.set(clave, tramo)
    }

    return {
      usuario,
      leadsActivos: activos.length,
      porEtapa: [...porId.values()].sort((a, b) => a.position - b.position)
        .map(({ etapaId, label, color, cantidad }) => ({ etapaId, label, color, cantidad })),
      gestionesVencidas: activos.filter(l =>
        gestionDeLead(l, etapaDelLead(l, etapas)?.management_tolerance_hours, now).variant === 'red').length,
      tareasVencidas: tareasPendientes.filter(t => t.assigned_to === usuario.id && estaVencida(t, hoy)).length,
      reunionesMes: reunionesDelMes.filter(r => r.assigned_to === usuario.id && r.deleted_at == null && r.status !== 'cancelled').length,
    }
  })
}
```

- [ ] **Step 5: `src/pages/equipo/components/TablaEquipo.tsx`**

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { enlaceAlCrm } from '@/pages/crm/lib/leadFilterParams'
import type { FilaEquipo } from '../lib/estadisticasPorCartera'

const ROL: Record<string, string> = { SUPERADMIN: 'Superadmin', SDR: 'SDR' }

/* Un renglón por cartera visible. Tocar el renglón lleva al CRM con esa cartera; tocar un número,
   al CRM ya filtrado a eso. Los enlaces salen de `enlaceAlCrm` y NUNCA se escriben a mano: en la
   URL `gestion` es la lista de EXCLUIDOS, y `?gestion=pendiente` mostraría justo lo contrario. */
function Numero({ valor, to, alerta = false }: { valor: number; to?: string; alerta?: boolean }) {
  const clase = alerta && valor > 0 ? 'font-semibold text-danger' : 'text-foreground'
  if (!to || valor === 0) return <span className={`tabular-nums ${clase}`}>{valor}</span>
  return (
    <Link to={to} onClick={e => e.stopPropagation()} className={`tabular-nums underline-offset-2 hover:underline ${clase}`}>
      {valor}
    </Link>
  )
}

function BarraEtapas({ fila }: { fila: FilaEquipo }) {
  if (fila.leadsActivos === 0) return <span className="text-[12px] text-(--fg-faint)">—</span>
  return (
    <div className="flex h-2.5 w-40 overflow-hidden rounded-full bg-(--surface-3)"
      title={fila.porEtapa.map(t => `${t.label}: ${t.cantidad}`).join(' · ')}>
      {fila.porEtapa.map(t => (
        <span key={t.etapaId ?? 'sin'} style={{ width: `${(t.cantidad / fila.leadsActivos) * 100}%`, background: t.color }} />
      ))}
    </div>
  )
}

export function TablaEquipo({ filas }: { filas: FilaEquipo[] }) {
  const navigate = useNavigate()
  const th = 'whitespace-nowrap bg-(--surface-2) px-4 py-[7px] text-left text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2) shadow-[inset_0_-1px_0_var(--line-strong)]'
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Cartera</th><th className={th}>Rol</th><th className={th}>Leads activos</th>
            <th className={th}>Por etapa</th><th className={th}>Gestiones vencidas</th>
            <th className={th}>Tareas vencidas</th><th className={th}>Reuniones este mes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const owners = [f.usuario.id]
            return (
              <tr key={f.usuario.id} onClick={() => navigate(enlaceAlCrm({ owners }))}
                className="cursor-pointer [border-bottom:1px_solid_var(--line-soft)] hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarUsuario usuario={f.usuario} />
                    <span className="text-[14px] font-medium">{f.usuario.nombre}</span>
                    {!f.usuario.activo && <span className="text-[12px] text-(--fg-muted)">(inactivo)</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[13px] text-(--fg-2)">{ROL[f.usuario.rol] ?? f.usuario.rol}</td>
                <td className="px-4 py-3"><Numero valor={f.leadsActivos} to={enlaceAlCrm({ owners })} /></td>
                <td className="px-4 py-3"><BarraEtapas fila={f} /></td>
                <td className="px-4 py-3"><Numero valor={f.gestionesVencidas} alerta to={enlaceAlCrm({ owners, gestion: 'pendiente' })} /></td>
                <td className="px-4 py-3"><Numero valor={f.tareasVencidas} alerta to={enlaceAlCrm({ owners, overdueOnly: true })} /></td>
                {/* Sin enlace: la agenda de reuniones está fuera de alcance (spec §8). */}
                <td className="px-4 py-3"><Numero valor={f.reunionesMes} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

Nota: «Tareas vencidas» cuenta TAREAS (incluidas las sueltas, sin lead) y el enlace lleva a los
LEADS con alguna tarea vencida: el número puede no coincidir con la cantidad de renglones del CRM.
Es a propósito — la pregunta de Equipo es cuánto trabajo atrasado hay; la del CRM, en qué leads.

- [ ] **Step 6: `src/pages/equipo/components/VisibilityMatrix.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import type { NivelAcceso } from '@/pages/crm/lib/permisos'
import { setAcceso } from '@/pages/crm/service/crm.service'

/* Copiado de propelia-frontend (src/pages/equipo/components/VisibilityMatrix.tsx) sobre
   `crm_data_access`. Filas = quién mira, columnas = a quién, celda = nada / ve / ve y edita. A
   diferencia del producto, acá el permiso SÍ muerde: lo aplica la RLS. Radix Select no admite ''
   como valor, así que «nada» viaja como 'none' y se vuelve null en el borde de la mutación. */
const NONE = 'none'
type CellValue = typeof NONE | NivelAcceso
const OPTIONS: Array<{ value: CellValue; label: string }> = [
  { value: NONE, label: 'Nada' }, { value: 'read', label: 'Ver' }, { value: 'write', label: 'Ver y editar' },
]

export function VisibilityMatrix() {
  const { usuarios, accesos, isLoading } = useCarteras()
  const qc = useQueryClient()
  const set = useMutation({
    mutationFn: (v: { viewerId: string; subjectId: string; access: NivelAcceso | null }) => setAcceso(v.viewerId, v.subjectId, v.access),
    onError: e => toast.error(mensajeDeError(e)),
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.accesos }) },
  })
  // Solo activos: un inactivo no puede nada (es_usuario), darle permisos no cambiaría nada.
  const activos = usuarios.filter(u => u.activo)
  const nivel = (viewer: string, subject: string): CellValue =>
    (accesos.find(a => a.viewer_id === viewer && a.subject_id === subject)?.access as NivelAcceso | undefined) ?? NONE

  if (isLoading) return <div className="h-48 animate-pulse rounded-lg bg-secondary" />
  if (activos.length < 2) return <p className="text-sm text-(--fg-muted)">Hace falta más de una persona para configurar visibilidad.</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-(--brand-soft)">
            <TableRow>
              <TableHead className="whitespace-nowrap">Ve la cartera de</TableHead>
              {activos.map(s => (
                <TableHead key={s.id} className="whitespace-nowrap text-center">
                  <span className="flex items-center justify-center gap-1.5"><AvatarUsuario usuario={s} />{s.nombre}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activos.map(v => (
              <TableRow key={v.id}>
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2.5"><AvatarUsuario usuario={v} /><span className="text-sm font-medium">{v.nombre}</span></div>
                </TableCell>
                {activos.map(s => v.id === s.id ? (
                  // La propia no se concede: ya es suya (y la tabla lo prohíbe con un check).
                  <TableCell key={s.id} className="text-center text-(--fg-muted)">—</TableCell>
                ) : v.rol === 'SUPERADMIN' ? (
                  // Un SUPERADMIN ve y edita todo por su rol: una fila acá no le cambiaría nada.
                  <TableCell key={s.id} className="text-center text-[12px] text-(--fg-muted)">todo</TableCell>
                ) : (
                  <TableCell key={s.id}>
                    <Select
                      value={nivel(v.id, s.id)}
                      disabled={set.isPending}
                      onValueChange={next => set.mutate({ viewerId: v.id, subjectId: s.id, access: next === NONE ? null : next as NivelAcceso })}
                    >
                      <SelectTrigger size="sm" className="w-full min-w-32 text-xs" aria-label={`Qué ve ${v.nombre} de ${s.nombre}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-(--fg-muted)">
        No es transitiva: si A ve a B y B ve a C, A no ve a C. «Ver y editar» incluye ver. Quitar un
        acceso lo corta al instante: la base deja de devolverle esos leads.
      </p>
    </div>
  )
}
```
(Verificar que `SelectTrigger` acepte `size="sm"` en `src/components/ui/select.tsx`: es la misma
copia del producto, así que sí; si no, sacar el prop.)

- [ ] **Step 7: `src/pages/equipo/Equipo.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { localTodayIso } from '@/lib/calendarDate'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { useCrmCatalogos } from '@/pages/crm/hooks/useCrmCatalogos'
import { useCrmLeads, useReunionesDelMes, useTareasPendientes } from '@/pages/crm/hooks/useCrmLeads'
import { useCrmRealtime } from '@/pages/crm/hooks/useCrmRealtime'
import { TablaEquipo } from './components/TablaEquipo'
import { VisibilityMatrix } from './components/VisibilityMatrix'
import { estadisticasPorCartera } from './lib/estadisticasPorCartera'

type Pestaña = 'tabla' | 'visibilidad'

/* Equipo: los números por cartera y quién ve a quién. Comparte la cache con el CRM (mismas keys):
   entrar acá después del CRM no pide nada de nuevo. Sin alta de miembros: `users` sigue por MCP. */
export function Equipo() {
  useCrmRealtime()
  const [pestaña, setPestaña] = useState<Pestaña>('tabla')
  const { visibles, esSuperadmin } = useCarteras()
  const { etapasPorId } = useCrmCatalogos()
  const leadsQ = useCrmLeads()
  const tareasQ = useTareasPendientes()
  const reunionesQ = useReunionesDelMes()

  const filas = useMemo(() => estadisticasPorCartera({
    carteras: visibles,
    leads: leadsQ.data ?? [],
    tareasPendientes: tareasQ.data ?? [],
    reunionesDelMes: reunionesQ.data ?? [],
    etapas: etapasPorId,
    hoy: localTodayIso(),
    now: Date.now(),
  }), [visibles, leadsQ.data, tareasQ.data, reunionesQ.data, etapasPorId])

  const cargando = leadsQ.isLoading || tareasQ.isLoading || reunionesQ.isLoading

  return (
    <div className="ui-scale-md flex flex-col gap-3 p-4 max-md:p-2">
      <header className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">Equipo</h1>
        {/* La matriz la ve solo un SUPERADMIN: es quien puede cambiarla (la RLS lo exige). */}
        {esSuperadmin && (
          <div role="tablist" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
            {(['tabla', 'visibilidad'] as const).map(p => (
              <button key={p} type="button" role="tab" aria-selected={pestaña === p} onClick={() => setPestaña(p)}
                className={cn('h-8 cursor-pointer rounded-md px-3 text-[12.5px]', pestaña === p ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
                {p === 'tabla' ? 'Tabla' : 'Visibilidad'}
              </button>
            ))}
          </div>
        )}
      </header>
      {pestaña === 'visibilidad' && esSuperadmin ? (
        <VisibilityMatrix />
      ) : cargando ? (
        <div className="h-48 animate-pulse rounded-lg bg-secondary" />
      ) : leadsQ.error && !leadsQ.data ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-foreground">No pudimos cargar los números.</p>
          <button type="button" className="text-sm underline" onClick={() => void leadsQ.refetch()}>Reintentar</button>
        </div>
      ) : (
        <TablaEquipo filas={filas} />
      )}
    </div>
  )
}
```

- [ ] **Step 8: La ruta** — en `src/App.tsx`, `import { Equipo } from '@/pages/equipo/Equipo'` y
  debajo de `<Route path="/crm" element={<Crm />} />`:

```tsx
              <Route path="/equipo" element={<Equipo />} />
```

- [ ] **Step 9: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 10: Commit**

```bash
git add src/components/nav.ts src/components/nav.test.ts src/App.tsx src/pages/equipo
git commit -m "feat(equipo): números por cartera y matriz de visibilidad"
```

---

### Task 14: `CLAUDE.md` — sección «El CRM»

**Files:**
- Modify: `CLAUDE.md` (sección nueva, justo después del bloque «El frontend nuevo (React) — leer
  primero» y antes de `**El tablero vanilla vive en \`legacy/\`**`)

- [ ] **Step 1: Agregar la sección**

```markdown
## El CRM (y Equipo) — `/crm` y `/equipo`

Desde el 30/9/2026 (rama `crm-pantalla`). Diseño en
`docs/superpowers/specs/2026-09-30-crm-pantalla-design.md`; plan en
`docs/superpowers/plans/2026-09-30-crm-pantalla.md`.

- **Permisos por cartera, en la base.** Cada lead es de una cartera (`assigned_to`); ver o editar
  la de otro es una fila de `crm_data_access` (`read`/`write`, plana, no transitiva). Todas las
  policies de las `crm_*` llaman a `crm_puede(owner, nivel)` / `crm_puede_lead(lead, nivel)` /
  `crm_puede_cliente(cliente, nivel)`, que exigen `es_usuario()`. Un `SUPERADMIN` ve y edita todo y
  es el único que toca el catálogo (etapas, prioridades, canales) y `crm_data_access`. **Esto
  cambió lo del 29/9** («cualquiera ve y edita todo el CRM»; «`rol` no restringe nada»).
- **`src/pages/crm/lib/permisos.ts` es el espejo en pantalla de `crm_puede()`**, no la seguridad:
  sirve para no ofrecer un botón que la base va a rechazar. Si cambia la regla en `schema.sql`,
  cambia ahí (misma relación que `accesoDe()` con `es_usuario()`).
- **Las pruebas de la RLS** están en `supabase/tests/crm-permisos.sql`: se corren enteras con el
  MCP `execute_sql`, crean sus usuarios adentro de una transacción y terminan en `rollback`. Tienen
  que devolver `crm-permisos: OK`.
- **El alta es una RPC** (`crm_create_lead_with_client`, `security definer`): reutiliza el cliente
  por teléfono/email aunque sea de otra cartera y crea la tarea «Asesorar cliente» con la fecha
  que manda el front (el «hoy» local). Sus errores son claves (`crm_…`) que traduce
  `lib/errores.ts`.
- **La lista se trae entera** (la RLS ya recortó) y filtros, pestañas y contadores salen de
  funciones puras en `lib/`. Todo filtro vive en la URL (`leadFilterParams.ts`); **`gestion` es la
  lista de estados EXCLUIDOS**, como en el producto: los enlaces se arman con `enlaceAlCrm()`,
  nunca a mano. `?owners=` son las carteras mirando y `?lead=` el lead abierto en el dialog.
- **La gestión la calcula la base** (`crm_leads.gestion_*`, `crm_gestion_refresh()`); el front la
  compara contra el vencimiento en la zona de quien mira (`gestionDeLead`). El front nunca escribe
  `gestion_*` ni los historiales.
- **El catálogo se borra con soft delete**: un lead en una etapa borrada la sigue leyendo por
  nombre (`catalogoDeEtapas` trae también las borradas); los menús ofrecen solo las vivas.
- **Qué se copió del producto** (`propelia-frontend/src/pages/leads`, podado de lo inmobiliario):
  `gestionStatus`, `calendarDeadline`, `discardStage`, `leadFilters`, `leadFilterParams`,
  `computeLeadListCounters`, `reassignCollisions`, `leadCells`, `LeadRowActions`, `LeadTasksPanel`,
  `DockedActivityChat`, `ClientFields`, `ReassignLeadsDialog`, `AgentFilterButton`,
  `BulkActionBar`, el funnel (`StagesTable`, `PriorityPicker`), `ChannelsPanel` y la
  `VisibilityMatrix` de Equipo. **Nuevo**: `permisos.ts`, `effectiveStage.ts` (acá es resolver por
  id), `systemComment.ts` (el del producto es el parser de Idealista), el servicio, los hooks,
  `CrmLeadList`, `LeadDialog`, `MeetingsPanel`, `ActividadLead`, `NewLeadDialog` y
  `estadisticasPorCartera`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: sección del CRM y Equipo en CLAUDE.md"
```

---

### Task 15: Verificación con el usuario

**Files:** ninguno (salvo arreglos que salgan de acá, cada uno con su commit `fix(crm): …`).

- [ ] **Step 1: Chequeos que se corren desde WSL**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql supabase/tests/crm-permisos.sql
git status --short
```
Expected: `TSC OK`; dos `✓`; árbol limpio.

- [ ] **Step 2: Las pruebas de la base otra vez** (con el esquema final aplicado): `execute_sql`
  con `supabase/tests/crm-permisos.sql`. Expected: `crm-permisos: OK`.

- [ ] **Step 3: PEDIRLE AL USUARIO que corra los tests** en PowerShell, en
  `C:\Users\anton\Documents\programacion\propelia\propelia-roadmap`:

```powershell
npx vitest run
```
Expected: todo en verde. Los archivos nuevos de este plan son:
`src/lib/calendarDate.test.ts`, `src/components/nav.test.ts` (modificado),
`src/pages/crm/lib/{calendarDeadline,gestionStatus,effectiveStage,discardStage,systemComment,clientData,leadFilters,leadFilterParams,tareas,computeLeadListCounters,estadoDeLista,permisos,reassignCollisions,errores,actividad,reuniones}.test.ts`,
`src/pages/equipo/lib/estadisticasPorCartera.test.ts`. Esperar su respuesta; si algo falla,
arreglarlo (TDD: el test manda, salvo que el test contradiga la spec — en ese caso preguntar).

- [ ] **Step 4: PEDIRLE AL USUARIO el checklist manual** (`npm run dev` en PowerShell,
  `http://localhost:4100`), que es el criterio de terminado de la spec §9:

- [ ] Como SUPERADMIN: «Nuevo lead» con un cliente nuevo → se crea, se abre solo, tiene la tarea «Asesorar cliente» para hoy.
- [ ] «Nuevo lead» con el teléfono de un cliente existente → avisa que lo reutilizó.
- [ ] El mismo cliente con el mismo responsable otra vez → «Ese cliente ya tiene un lead con ese responsable.» adentro del dialog.
- [ ] En el dialog: cambiar etapa y canal, editar empresa/teléfono/notas (guarda al salir del campo), marcar gestión, posponerla, agregar y completar tareas, agendar/completar/cancelar (con motivo) reuniones, comentar.
- [ ] ↑/↓ y los chevrones recorren la lista; clic afuera NO cierra; Escape y «Volver al panel» sí; recargar con `?lead=<id>` lo abre.
- [ ] Otra sesión (ventana privada, Lorenzo) ve cada cambio sin recargar (realtime).
- [ ] Reasignar un lead desde el dialog y varios desde la selección múltiple; uno que choca se avisa y no se mueve; queda el comentario «Lead reasignado de … a …».
- [ ] Descartar con motivo → desaparece de la lista; «Incluir descartados» lo trae; la actividad dice el motivo.
- [ ] Funnel: crear, renombrar, reordenar y borrar una etapa; Nuevo y Descartado no se borran. Canales: crear y reordenar.
- [ ] Equipo › Tabla: los números por cartera; tocar «Gestiones vencidas» lleva al CRM con solo las pendientes de esa cartera; tocar el renglón, a esa cartera.
- [ ] Equipo › Visibilidad: darle a un SDR `Ver` sobre una cartera → el SDR (otra sesión) la ve y no la puede editar (acciones apagadas); pasarla a `Nada` → deja de verla sin recargar.
- [ ] El SDR sin accesos: sin selector de carteras, sin botones Funnel/Canales, sin pestaña Visibilidad; lista vacía dice «Todavía no tenés leads».
- [ ] DevTools → Offline y recargar el CRM → «No pudimos cargar los leads.» con «Reintentar», no «Todavía no tenés leads».
- [ ] A 390px: tarjetas en vez de tabla, el dialog a pantalla completa, la barra de pestañas con Equipo.

- [ ] **Step 5: NO mergear.** Avisarle al usuario que la rama `crm-pantalla` está lista para su
  revisión y que el merge a `main` lo decide él.

