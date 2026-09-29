# Sub-proyecto B — la pantalla del CRM: contexto para quien lo haga

**Para qué es este archivo**: arrancar en frío. Quien lo lea (una sesión nueva o un agente) no
estuvo en la conversación donde se decidió todo lo de abajo. Acá está lo decidido, lo que existe
y lo que falta decidir. **No es la spec**: la spec de B la escribís vos, después de cerrar con el
usuario las preguntas del final.

Escrito el 29/9/2026, al cerrar el sub-proyecto A.

---

## 1. Qué es B, en una frase

Una vista nueva del tablero, **«CRM»** en la barra lateral, que replica la página de
compradores (`/leads`) de `propelia-frontend` para que Propelia siga a **sus propios clientes**
(las inmobiliarias que le compran el software) con el mismo modelo que el producto usa para los
compradores de cada inmobiliaria.

Los usuarios son tres: Lorenzo, Antonio y Luis. Son los mismos del tablero y entran con la misma
cuenta.

## 2. Cómo trabajar (no negociable)

- **Rama**: `crm-pantalla`, que **sale de `mudanza-base`**, no de `main`. Todo B depende de A (la
  tabla `users`, las `crm_*`) y A todavía no está en `main`: se mergea el día de la mudanza de
  base. Si A cambia durante la inyección, traer el cambio con `git rebase mudanza-base`.
- **Worktree propio** (`superpowers:using-git-worktrees`): A todavía puede recibir arreglos
  mientras B avanza, y los dos tocan `app.js`, `app.css` e `index.html`.
- **Proceso**: `superpowers:brainstorming` con el usuario → spec en
  `docs/superpowers/specs/2026-XX-XX-crm-pantalla-design.md` → `superpowers:writing-plans` →
  ejecución. **El usuario aprueba el diseño antes de que se escriba código.** Las preguntas de
  la sección 8 son suyas, no del agente.
- **Nunca `npm install`** desde WSL: el repo también se usa desde Windows y rompe los binarios
  nativos. No hay build ni bundler: JS plano con `<script src>`.
- **Nunca correr un build** después de cambiar código (regla del usuario).
- **Herramientas de shell**: `rg`, `fd`, `bat`, `eza`, `sd`. Nada de grep/find/cat/ls/sed.
- **Commits**: convencionales y **sin** línea de co-autoría ni atribución a IA.
- **Idioma**: el usuario escribe en castellano rioplatense; el código, los comentarios y el
  CLAUDE.md del repo están en castellano. Seguir ese estilo (comentarios que explican el
  *porqué*, largos si hace falta: mirá cómo está escrito `app.js`).
- **Finales de línea**: `supabase-sync.js` es **CRLF** (el único). Si se edita por script, hay
  que preservarlos, o el diff muestra el archivo entero cambiado.

## 3. Qué hay que leer, en este orden

1. `CLAUDE.md` (raíz): convenciones del repo. Es largo; como mínimo leé «Arquitectura»,
   «Identidad y acceso: la tabla `users`», «Vistas», «El tablero es una lista», «La barra
   lateral» y «Loading states & optimistic updates».
2. `docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md`: el diseño de A. La
   sección 3 define las `crm_*`.
3. `supabase/schema.sql`: la sección final «CRM interno» es el esquema real.
4. `migracion/fuente-crm-producto.sql`: las tablas, triggers y funciones del CRM del producto
   (referencia; las `crm_*` salen de ahí).
5. `migracion/PASOS.md`: en qué estado está la mudanza de base.
6. El front del producto (repo hermano, solo lectura):
   `../propelia-frontend/src/pages/leads/` (ver sección 5).

## 4. Qué existe ya (sub-proyecto A)

### La base (`supabase/schema.sql`, rama `mudanza-base`)

- **`users`** (sin prefijo): `id` (→ `auth.users`), `email`, `nombre`, `iniciales`, `color`,
  `rol` (enum `user_role`, hoy solo `SUPERADMIN`), `caja`, `activo`. Tener fila activa es tener
  acceso (`es_usuario()`). Baja = `activo = false`, nunca `delete`.
- **`crm_*`**, con nombres de columna **copiados del producto** (a propósito: la pantalla se
  replica sin traducir), sin `organization_id` y sin nada inmobiliario:

| tabla | para qué | notas |
|---|---|---|
| `crm_priorities` | prioridades con color y tolerancia de gestión en horas | sembradas: Verde, Amarillo, Rojo, Oportunidad |
| `crm_funnel_stages` | etapas del funnel | sembradas: **Nuevo** (`NEW`) y **Descartado** (`DISCARDED`, `is_out_of_funnel`), ninguna se puede borrar. El resto lo crean desde la configuración del funnel |
| `crm_channels` | canal de entrada | **vacía**; la cargan ellos |
| `crm_clients` | la persona / inmobiliaria | como `clients` del producto **+ `company_name`**. Únicos parciales por `lower(email)` y `phone` |
| `crm_leads` | la oportunidad | `client_id`, `assigned_to` → `users`, `funnel_stage_id`, `channel_id`, `discard_reason`, `last_important_event_at`, `last_opened_at`, `gestion_reference_at`, `gestion_postponed`, `gestion_has_events`. Único `(client_id, assigned_to)` activo |
| `crm_meetings` | reuniones / demos (las `visits` del producto) | `status`: `scheduled` / `completed` / `cancelled`. Sin calendario |
| `crm_tasks` | tareas | `lead_id` **nullable**, `due_date`, `planned_for`, `recurrence`, `assigned_to` |
| `crm_comments` | comentarios del lead | `comment_type` `MANUAL` / `SYSTEM`, soft delete |
| `crm_management_events` | gestiones | `action` `MANUAL` / `POSTPONED`, `effective_at` |
| `crm_stage_history`, `crm_assignment_history` | historiales | **los escriben triggers, nunca el front** |

- **Gestión**: `crm_gestion_refresh()` (por trigger) mantiene `gestion_reference_at` /
  `gestion_postponed` / `gestion_has_events` en el lead a partir de sus eventos. Es la
  `lead_gestion_reference()` del producto **sin** la parte de cruces con propiedades (acá no
  hay), por eso no existe `gestion_reopened_by_system`.
- **Todas** las `crm_*` tienen soft delete (`deleted_at`), `updated_at` por trigger, RLS
  `es_usuario()`. Realtime en leads, tareas, comentarios, gestiones y reuniones.
- **No hay RPCs** de alta ni de listado. Es a propósito: se decide en B (sección 8).

### El front (rama `mudanza-base`)

- SPA estática: `index.html` (config y cáscara) → `order-math.js`, `equipo.js`,
  `supabase-sync.js`, `app.js`. CSS en `app.css`.
- **`equipo.js`**: `personasDesdeUsuarios()`, `elegibles()` y `destinatariosActivos()`. Son
  funciones puras con test en `scripts/test-equipo.cjs`. **Ese es el patrón para lógica pura
  testeable**: un archivo cargable en navegador y en Node, con su test en `scripts/`
  (`node scripts/test-*.cjs`).
- **`supabase-sync.js`** expone `RoadmapSync` (carga, guardado, realtime, adjuntos). Su
  `TABLAS` ya incluye `usuarios`. Sus `const` de nivel superior son globales: no repetir
  nombres en `app.js`.
- **`app.js`** (~5300 líneas):
  - Vistas en `VISTAS` (`app.js:76`), cada una con `id`, `label`, `ico` y marcas (`caja`,
    `backlog`). El ruteo está en `render()` (`:601`).
  - Las personas están en `PERSONAS` / `PERSONAS_CAJA`, que se llenan al entrar
    (`cargarEquipo()`); el que entró es `YO`.
  - Menú genérico de elegir: `abrirMenu(anclaje, tipo, t, alElegir, titulo)` (`:3600`).
  - Lista de renglones reutilizable: `LISTAS`, `engancharLista()` (`:3473`), `filaTareaHTML()`.
    La pintan el backlog y el tablero.
  - Página de un documento: `renderPagina()` (`:4385`), con bloques tipo Notion.
  - Patrón de guardado: optimista + `conEstadoDeCarga()` + indicador global. Ver CLAUDE.md,
    «Loading states».
- **Diseño visual**: la barra lateral, las clases `pg*` (páginas y renglones), `bk*` (lista),
  `cj*` (caja), pills y avatares `.av.mini`. B tiene que parecer parte del mismo tablero, no
  una app pegada.

## 5. Qué es `/leads` en el producto (relevado el 29/9/2026)

Repo: `../propelia-frontend`, React + Vite + TS + TanStack Query + shadcn. Ruta `/leads` →
`src/pages/leads/Leads.tsx`. **No es un kanban**: es una **lista acordeón virtualizada**, y el
detalle del lead se despliega en el lugar (sin cambiar de ruta).

- **Cabecera**: filtro por agente (`AgentFilterButton`), configuración del funnel
  (`FunnelConfigDialog`, en `src/pages/clients/components/FunnelSection`), alta
  (`NewLeadWizard`) y el toggle Venta/Alquiler (`LeadPanelToggle`, **no aplica**).
- **Lista**: `LeadList.tsx` (buscador, pestañas, contadores); cada renglón es
  `LeadAccordion.tsx` (~2000 líneas, el detalle inline). Móvil: `LeadCardList`. Acciones por
  renglón: `LeadRowActions` (cambio de etapa, descarte). En lote: `BulkActionBar`,
  `ReassignLeadsDialog`.
- **Filtros**: `LeadFiltersV9.tsx`, `LeadFilterPopover`. Chips de prioridad, estado de
  «gestión», etapa, tareas vencidas (+ propiedad, cruce y compraventa, que **no aplican**).
- **Detalle del lead**: `ClientFields` (datos del cliente), `LeadTasksPanel`,
  `DockedActivityChat` (comentarios / actividad), `ManageChannelsDialog`, `EditLeadDialog`,
  visitas (→ reuniones). **No aplican**: `BriefingDetail`, `LeadPropertyCard`, zonas, matching,
  sugerencias de IA.
- **Lógica pura del producto que vale copiar** (en `src/pages/leads/lib`):
  - `gestionStatus.ts`: cómo se calcula «gestión pendiente / al día / postergada» con la
    tolerancia de la prioridad. **Ojo**: la base ya guarda `gestion_reference_at`; la
    comparación contra la tolerancia es de pantalla.
  - `leadFilters.ts` y `leadFilterParams.ts`: los filtros.
  - `effectiveStage.ts` y `discardStage.ts`: descarte con motivo.
- **Datos**:
  - el producto lista con las RPCs `list_leads_page` (paginado keyset, 50 por página) y
    `count_leads_buckets` (contadores);
  - usa `reassign_leads` para reasignar, que además deja un comentario `SYSTEM`;
  - y `create_lead_with_client` para dar de alta: crea cliente y lead juntos, reutiliza el
    cliente si coincide teléfono o email, y crea la tarea inicial «Asesorar cliente».
- **Tests del producto como documentación ejecutable**: `src/tests/db-*.test.ts`
  (`db-lead-management-events`, `create-lead-with-client*`, …).

## 6. Lo que ya está decidido (no reabrir sin motivo)

- Prefijo `crm_`; `users` compartido; sin `organization_id`; sin nada inmobiliario.
- Modelo «espejo del producto»: client = la persona/inmobiliaria, lead = la oportunidad con
  su funnel.
- Alcance de datos, «opción 2»: núcleo más reuniones, sin sincronizar con el calendario.
- Funnel: arranca con Nuevo y Descartado, y **los usuarios lo editan desde la pantalla**. La
  configuración del funnel es parte de B.
- Acceso: cualquier usuario activo ve y edita todo el CRM. `rol` todavía no restringe nada.
- Historiales y gestión: los calcula la base, no el front.

## 7. Restricciones técnicas que condicionan el diseño

- **No hay base contra la cual probar** hasta que se haga la inyección (`migracion/PASOS.md`).
  Hasta entonces:
  - la lógica pura se prueba con `node` (patrón `equipo.js`);
  - el SQL nuevo (si hace falta alguna RPC) se valida con
    `/tmp/venv-sql/bin/python migracion/validar-sql.py <archivo>`; si el venv no existe, las
    instrucciones están en el propio script;
  - la prueba de punta a punta queda para después de la inyección.
- **El esquema de A no se cambia desde B sin avisar**: si B necesita una columna o una RPC, se
  agrega a `supabase/schema.sql` como cambio idempotente (`add column if not exists`,
  `create or replace`), se anota en la spec de B y se avisa al usuario. Si la inyección ya se
  hizo, además se aplica en la base nueva.
- **Volumen**: decenas de leads, no miles. Probablemente alcance con traer todo y filtrar en el
  cliente, como hace hoy el tablero con sus tareas. Hay que confirmarlo (sección 8).
- **`app.js` ya tiene ~5300 líneas.** La regla del repo es «la lógica en `.js`, los estilos en
  `.css`, nunca en el HTML»; no obliga a que sea un solo archivo. Ver la pregunta 1.

## 8. Preguntas abiertas: las decide el usuario en el brainstorming

Preguntarlas **de a una**, con opciones y una recomendación. Las marcadas con ★ cambian la
arquitectura y van primero.

1. ★ **¿Dónde vive el código?** Opción recomendada: archivos propios (`crm.js`,
   `crm-sync.js`, `crm.css`) cargados desde `index.html`, reutilizando `abrirMenu`, la lista de
   renglones y el patrón de guardado. La alternativa es meterlo todo en `app.js` / `app.css`.
   Tradeoff: separar deja un archivo enorme como está y acota lo que toca B, pero obliga a
   exponer lo que se comparte.
2. ★ **¿Listado con RPCs o en el cliente?** Recomendado: en el cliente (traer todo, filtrar en
   JS) por el volumen. Las RPCs del producto son para miles de filas.
3. ★ **¿El detalle se despliega en el renglón (como el producto) o se entra a una página (como
   las tareas del tablero)?** El tablero eligió «se entra» por una razón que vale leer en
   CLAUDE.md, «La tarea como página».
4. **Alta de un lead**: ¿un formulario como `NewLeadWizard` (cliente y lead juntos, reutilizando
   el cliente si coincide el teléfono o el email) o una fila que nace en la lista y se completa
   después, como las tareas? ¿Hace falta una RPC `crm_create_lead_with_client` para que sea
   atómico?
5. **Filtros y contadores**: ¿cuáles de los del producto? (Candidatos: agente, etapa,
   prioridad, estado de gestión, tareas vencidas.)
6. **Reasignar**: ¿de a uno desde el renglón, en lote, o las dos? ¿Deja comentario `SYSTEM`
   como `reassign_leads`?
7. **Tareas del CRM**: ¿se ven solo adentro del lead o también en una lista propia? ¿Se
   mezclan con las del tablero (`roadmap_tareas`) en algún lado? Recomendado: no mezclarlas.
8. **Reuniones**: ¿solo un listado dentro del lead, o también una vista de agenda?
9. **Canales**: la tabla está vacía. ¿Cuáles cargar de entrada, o los crean desde
   `ManageChannelsDialog`?
10. **Qué NO entra en la primera versión** (YAGNI): proponer un recorte explícito.

## 9. Cómo arrancar (para pegarle a un agente o a una sesión nueva)

> Vas a hacer el sub-proyecto B del repo `propelia-roadmap`: la pantalla del CRM. Leé primero
> `docs/superpowers/specs/2026-09-29-crm-pantalla-contexto.md` entero y los archivos que
> nombra en su sección 3. Trabajá en un worktree con la rama `crm-pantalla` que sale de
> `mudanza-base`. Seguí `superpowers:brainstorming`: las preguntas de la sección 8 son del
> usuario, de a una y con recomendación. No escribas código hasta que el usuario apruebe la
> spec. Después, `superpowers:writing-plans` y la ejecución que el usuario elija. Respetá la
> sección 2 al pie de la letra.
