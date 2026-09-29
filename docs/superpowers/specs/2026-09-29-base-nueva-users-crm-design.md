# Base nueva: `users`, roadmap reasignado y esquema del CRM — diseño (sub-proyecto A)

**Fecha:** 29/9/2026 · **Estado:** diseño aprobado por secciones, spec pendiente de revisión.

## Objetivo

Mudar el tablero a un proyecto Supabase propio, en otra cuenta, y aprovechar la mudanza para:

1. **Reemplazar la identidad a mano por una tabla `users`** con rol. Hoy el acceso sale de
   `app_miembros` (por email) y la identidad de `APP_CONFIG.personas` (escrita en el HTML).
2. **Asignar las tareas a usuarios reales**: los datos guardan `'Loro'`, `'Toni'`, `'Luis'`
   como texto y pasan a guardar el uuid de `users`.
3. **Crear el esquema de un CRM interno** (`crm_*`): Propelia siguiendo a SUS clientes (las
   inmobiliarias), con el mismo modelo que el producto usa para los compradores.

**Hecho cuando**: la base nueva anda, el tablero apunta a ella con los tres usuarios y todas
sus tareas bien asignadas, y las tablas `crm_*` existen, vacías y con sus siembras.

## Fuera de alcance

- **La pantalla del CRM** (réplica de `/leads` de `propelia-frontend`). Es el sub-proyecto B,
  con su propia spec, sobre esta base.
- **RPCs de alta y listado del CRM** (`create_lead_with_client`, `reassign_leads`,
  `list_leads_page`, `count_leads_buckets`). Las decide B según lo que pida la pantalla: con
  decenas de leads y no miles, puede alcanzar con leer todo y filtrar en el cliente.
- **Tocar el proyecto viejo** (`propelia`). Queda activo e intacto; se limpia más adelante.
- **Datos del CRM del producto.** Son los compradores de cada inmobiliaria, no clientes de
  Propelia. Las `crm_*` nacen vacías.

## Contexto que condiciona el diseño

- **Otra cuenta de Supabase**: el MCP ve una cuenta por vez. Extracción e inyección van en
  sesiones distintas y todo lo que la inyección necesita vive en `migracion/` (ver
  `migracion/PASOS.md`, que es el checklist).
- **El origen sigue vivo**: los datos extraídos (29/9/2026 17:28 UTC) envejecen. Se
  re-extraen justo antes de inyectar, con `migracion/generar-datos.py`.
- **`supabase/schema.sql` es el único esquema** desde el 29/9/2026 (se borró la cadena
  v2…v8). Este diseño lo extiende; no hay archivos de migración aparte.
- **Referencia del producto**: `migracion/fuente-crm-producto.sql` (tablas, triggers y
  funciones del CRM de `propelia-frontend`, extraídos del catálogo en vivo).

## Nombres

| flujo | prefijo | ejemplo |
|---|---|---|
| Compartido | ninguno | `users`, `es_usuario()` |
| Roadmap | `roadmap_` | `roadmap_tareas` (sin cambios) |
| CRM | `crm_` | `crm_leads`, `crm_clients` |

---

## 1. `users` y acceso

```sql
create type public.user_role as enum ('SUPERADMIN');

create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  nombre     text not null,
  iniciales  text not null,
  color      text not null,
  rol        public.user_role not null default 'SUPERADMIN',
  caja       boolean not null default false,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- **`es_usuario()`** — `language sql stable security definer`, `search_path = public`:
  `exists (select 1 from users where id = auth.uid() and activo)`. Reemplaza a
  `es_miembro('propelia')` en **todas** las policies: roadmap, CRM y `storage.objects`.
- **`app_miembros` y `es_miembro()` no existen en la base nueva.** El acceso queda atado al
  id de la cuenta, no al email.
- **RLS de `users`**: `select` para `es_usuario()` (todo el equipo se ve: avatares, menús,
  firma del chat). **Sin policies de escritura**: altas, cambios y roles se hacen con el MCP o
  el service role. Nadie se sube de rol desde la consola del navegador.
- **Baja = `activo = false`, nunca `delete`.** Las `crm_*` apuntan a `users.id` con FK
  `on delete restrict`, y el JSON del roadmap guarda uuids: borrar dejaría ambos huérfanos.
- **`caja` es un booleano y no un rol**: quién pone plata y qué permisos tiene una cuenta son
  preguntas distintas.
- **El rol todavía no restringe nada.** Un rol nuevo es `alter type user_role add value …`;
  la primera regla por rol es una policy, sin migrar datos.
- `users` lleva el trigger `set_updated_at()` como el resto.

## 2. Reasignar `Loro` / `Toni` / `Luis` a uuids

Archivo nuevo: `migracion/04-reasignar-usuarios.sql`. Corre **después** de los datos y de
cargar las filas de `users`.

**Relevamiento del 29/9/2026** — solo aparecen esos tres valores:

| campo | ocurrencias |
|---|---|
| `roadmap_tareas.pend[]` | Toni 93 · Loro 62 · Luis 5 |
| `roadmap_tareas.resp` | Toni 86 · Loro 59 · Luis 3 · vacío 11 |
| `chat[].autor` | Toni 14 · Loro 14 |
| `subtareas[].resp` | Toni 1 · vacío 12 |
| avisos en `expl` (`autor`, `vistoPor`) | Loro 11 · Toni 1 |
| avisos en `expl` (`para[]`) | Toni 9 · Loro 1 |
| `roadmap_caja.cuenta` | Toni 2 · Loro 1 |
| `roadmap_caja.carga[]` | vacío en las tres filas |

(Se vuelve a contar al re-extraer: la verificación compara contra el conteo de ESE momento.)

**Reglas del script**:

- **El mapeo no lleva uuids escritos**: `Loro → lorenzopiattifadda@gmail.com`,
  `Toni → antonio.piattifadda@gmail.com`, `Luis → rubioluis13@gmail.com`, resueltos contra
  `users` por email. Si falta alguno, `raise exception` **antes** de tocar una fila.
- **Una sola transacción.** O se reasigna todo o nada.
- **Idempotente**: solo cambia valores que siguen siendo una de las tres claves.
- **Campos**: `pend[]`, `resp`, `chat[].autor`, `subtareas[].resp`,
  `subtareas[].chat[].autor`, `roadmap_caja.cuenta`, `roadmap_caja.carga[]`, y en las filas
  cuyo `expl` empieza con `<!--b-->`: `autor`, `vistoPor` y los elementos de `para[]` de los
  avisos. `''` queda `''`.
- **Los avisos se reemplazan por clave, no con un `replace` suelto sobre `expl`**: solo
  `"autor":"Loro"`, `"vistoPor":"Loro"` y los elementos dentro de `"para":[…]`. En JSON válido
  esas formas no pueden aparecer dentro de un texto (las comillas van escapadas), así que un
  «Loro» escrito en una explicación no se toca.
- **Verificación** (al final del archivo, como consultas): cero apariciones de las tres
  claves en todos los campos de arriba, y conteo por uuid igual al conteo por clave previo.

**Consecuencias asumidas**:
- `02-datos-*` ya no incluye `app_miembros` (regenerado el 29/9/2026).
- Filtros viejos en `localStorage` con `'Toni'` dejan de encontrar tareas hasta volver a
  elegirlos. Un clic por persona; no se migran.
- La marca `tablero-vistas` de `localStorage` es por id de TAREA, no de persona: no se ve
  afectada.

## 3. Esquema del CRM (`crm_*`)

Columnas con los **nombres del producto** (para que B replique la pantalla sin traducir),
**sin** `organization_id` y sin nada inmobiliario (propiedades, cruces, briefing, zonas,
matching, IA, portales, calendario). Fuente: `migracion/fuente-crm-producto.sql`.

**Comunes a todas**: `id uuid default gen_random_uuid()`, `created_at`, `updated_at` con
`set_updated_at()`, `deleted_at` (soft delete), `created_by uuid default auth.uid()` donde el
producto lo tiene. FK a `users` con `on delete restrict`.

### Catálogos

**`crm_priorities`** — `name`, `color`, `position`, `management_tolerance_hours int default
24`, `show_in_filters bool default true`. Siembra (las del producto):

| name | color | position | tolerancia (h) |
|---|---|---|---|
| Verde | `#639922` | 1 | 24 |
| Amarillo | `#EF9F27` | 2 | 168 |
| Rojo | `#E24B4A` | 3 | 336 |
| Oportunidad | `#B84300` | 4 | 24 |

**`crm_funnel_stages`** — `label`, `value`, `position`, `priority_id` → `crm_priorities`,
`is_out_of_funnel`, `allow_delete`, `allow_reorder`, `allow_rename`,
`management_tolerance_hours`. Sin `requires_matching`. Siembra:

| label | value | position | priority | out | delete | reorder | rename |
|---|---|---|---|---|---|---|---|
| Nuevo | `NEW` | 1 | Verde (24 h) | no | no | no | sí |
| Descartado | `DISCARDED` | 2 | — | sí | no | no | no |

El resto lo crean ellos desde la configuración del funnel (sub-proyecto B).

**`crm_channels`** — `label`, `position`, `allow_delete bool default true`. **Sin siembra.**

### Entidades

**`crm_clients`** — `first_name`, `last_name`, **`company_name`** (la única columna nueva:
son inmobiliarias), `email`, `phone`, `alternative_phone_1`, `alternative_phone_1_note`,
`alternative_phone_2`, `alternative_phone_2_note`, `notes`, `created_by`. Índices únicos
parciales del producto, sin la organización: `lower(email)` y `phone` entre los no borrados y
no vacíos.

**`crm_leads`** — `client_id` → `crm_clients` (`on delete cascade`), `assigned_to` → `users`
(not null), `funnel_stage_id` → `crm_funnel_stages` (`on delete set null`), `channel_id` →
`crm_channels` (`on delete set null`), `discard_reason`, `created_via text not null default
'manual'`, `last_important_event_at timestamptz not null default now()`, `last_opened_at`,
`gestion_reference_at`, `gestion_postponed bool default false`, `gestion_has_events bool
default false`, `created_by`. Índice único `(client_id, assigned_to)` entre los no borrados
(el del producto, sin `lead_type`). Índice `gestion_reference_at desc nulls last`.
**Sin** `gestion_reopened_by_system`: ver «Gestión».

**`crm_meetings`** (las `visits` del producto) — `lead_id` → `crm_leads`, `assigned_to` →
`users`, `starts_at`, `ends_at` (`check ends_at > starts_at`), `status` (`scheduled` |
`completed` | `cancelled`, default `scheduled`), `title`, `description`, `cancel_reason`,
`created_by`. Sin nada de sincronización con calendario ni invitados.

**`crm_tasks`** — `lead_id` → `crm_leads` (**nullable**: una tarea puede no ser de un lead,
como en el producto), `title`, `due_date`, `planned_for`, `assigned_to` → `users` (not null,
default `auth.uid()`), `completed`, `completed_at`, `recurrence` (`daily` | `weekdays` |
`weekly` | `biweekly` | `monthly`), `created_by`. **`lead_id` directo** en lugar del par
`entity_type`/`entity_id`: acá solo hay leads, y un par polimórfico no admite FK.

**`crm_comments`** — `lead_id` → `crm_leads` (`on delete cascade`), `description` (not
null), `long_description`, `comment_type` (`MANUAL` | `SYSTEM`, default `MANUAL`),
`created_by`.

**`crm_management_events`** — `lead_id` → `crm_leads` (`on delete cascade`), `action`
(enum `crm_management_action`: `MANUAL` | `POSTPONED`), `effective_at timestamptz default
now()`, `note`, `created_by`. Índice `(lead_id, effective_at desc)`.

### Historiales (los escriben triggers, nunca el front)

- **`crm_stage_history`** — `lead_id`, `from_stage_id`, `to_stage_id`, `changed_by`,
  `changed_at`. Trigger `after insert or update` en `crm_leads`: al insertar con etapa, y al
  cambiar `funnel_stage_id` a una no nula. `changed_by = auth.uid()`.
- **`crm_assignment_history`** — `lead_id`, `from_user_id`, `to_user_id`, `changed_by`,
  `changed_at`. Trigger `after update of assigned_to` cuando cambia. `security definer`,
  como en el producto.
- `changed_by` es **nullable**: lo que se hace desde el MCP o el service role no tiene
  `auth.uid()`.

### Gestión

En el producto, `lead_gestion_reference()` calcula de cuándo cuenta la gestión de un lead a
partir de (a) sus eventos de gestión y (b) los cambios de etapa que hizo el SISTEMA sobre sus
cruces con propiedades. Sin propiedades, (b) no existe. Queda:

- **`crm_gestion_refresh(lead_id)`** — `security definer`. Toma el evento no borrado de mayor
  `effective_at` (desempate por `created_at desc`) y escribe en el lead:
  - `gestion_reference_at` = ese `effective_at`, o `created_at` del lead si no hay eventos;
  - `gestion_postponed` = la acción ganadora es `POSTPONED`;
  - `gestion_has_events` = hay al menos un evento.

  Solo escribe si algo cambió (`is distinct from`), para no disparar realtime de más.
- **Triggers**: `after insert or update or delete` en `crm_management_events` (con el caso
  del `lead_id` que cambia, como el producto) y `after insert` en `crm_leads`.
- **`gestion_reopened_by_system` no se crea**: sin cruces sería siempre `false`, y una
  columna que no puede valer otra cosa es un dato que miente.

### RLS y realtime

- Todas las `crm_*`: `for all using (es_usuario()) with check (es_usuario())`.
- **Historiales**: solo `select` para `es_usuario()`. Los insertan triggers `security
  definer`.
- **Realtime**: `crm_leads`, `crm_tasks`, `crm_comments`, `crm_management_events`,
  `crm_meetings`. Los catálogos no: cambian poco y B los recarga.

## 4. El front del tablero lee `users`

- **`supabase-sync.js`** — sale `esMiembro()`. Entra `RoadmapSync.cargarUsuarios()`:
  `select id,email,nombre,iniciales,color,caja,activo from users`. `TABLAS` gana `usuarios`.
  `faltantesDeEsquema()` suma la comprobación de `users`.
- **`app.js`**:
  - `PERSONAS` y `PERSONAS_CAJA` siguen siendo los mismos arrays, pero se **llenan en
    `arrancar()`**, antes del primer `render()`, con la función pura
    `personasDesdeUsuarios(filas)` → `{id, nombre, ini, color, email, caja, activo}`. Los ~30
    lugares que los leen no cambian.
  - `ANCHO_AVATARES` deja de ser una constante del arranque del script: se calcula después
    de llenar `PERSONAS`.
  - **`YO` sale de `users` por `id = auth.uid()`**, no por email. Sin fila → «Sin acceso».
    Se borra el aviso «tu cuenta no está asociada a una persona»: ese caso ya no existe.
  - **Inactivos**: están en `PERSONAS` (una tarea vieja sigue pintando nombre y color) pero
    **no se ofrecen para elegir**: responsables (`chipsPend`, `tPend`, menú `pend`),
    `pedirResponsable()`, «cargar a» y destinatarios de avisos.
  - `PERSONAS_CAJA` conserva el fallback: si nadie tiene `caja`, son todos.
- **`index.html`** — salen `personas` y `proyecto` de `APP_CONFIG`, con el comentario
  «ANTONIO: tocá el email acá».
- **`CLAUDE.md`** — se reescribe «Identidad vs. membresía» (ya no son dos cosas) y se
  actualizan las menciones a `APP_CONFIG.personas`. `PENDIENTES-BACKEND.md` pasa a explicar
  el alta de un usuario: cuenta en Auth + fila en `users`.

## 5. Inyección

El checklist operativo es `migracion/PASOS.md`. Resumen y las dos reglas que lo sostienen:

1. Congelar el tablero y re-extraer los datos (MCP en `propelia`).
2. Reconectar el MCP a la cuenta nueva.
3. `supabase/schema.sql` → `02-datos-*` → cuentas en Auth → filas en `users` →
   `04-reasignar-usuarios.sql` → verificación.
4. `03-copiar-storage.mjs` (78 archivos).
5. Deploy del front y prueba de humo.

- **Vuelta atrás gratis hasta el deploy**: base y front viejos no se tocan.
- **Deploy en un solo commit** (URL/key nuevas + front con `users`): cada mitad sola no anda.

## Pruebas

- **`personasDesdeUsuarios()`** (TDD, `scripts/test-personas.cjs`, como
  `test-calcular-orden.cjs`): conserva el orden; mapea `iniciales → ini`; el fallback «nadie
  tiene caja → todos»; los inactivos están en la lista para pintar pero no en la de elegir.
- **Reasignación**: las consultas de verificación del propio script (cero claves viejas,
  conteos por uuid iguales a los previos).
- **Esquema del CRM**, desde el MCP en la base nueva: insertar un cliente y un lead en
  `Nuevo`, moverlo a `Descartado`, reasignarlo y cargarle un evento `POSTPONED` a futuro.
  Esperado: una fila más en `crm_stage_history` por cada cambio de etapa, una en
  `crm_assignment_history`, y `gestion_postponed = true` con `gestion_reference_at` en la
  fecha del evento. Borrar el evento (soft) devuelve la referencia a `created_at`.
- **Humo del tablero** después del deploy: login de los tres, responsables correctos, una
  captura firmada, un mensaje de chat, un gasto en la caja.

## Riesgos

| riesgo | mitigación |
|---|---|
| Se edita el tablero viejo después de la extracción | re-extraer justo antes; congelar |
| Un «Loro» en el texto libre de una explicación | reemplazo por clave JSON, no `replace` suelto |
| Falta una cuenta al reasignar | el script aborta antes de tocar filas |
| Front nuevo contra base vieja (o al revés) | un solo commit; deploy después de verificar |
| Operaciones por MCP sin `auth.uid()` | `changed_by` / `created_by` nullables; `assigned_to` se pasa explícito |
