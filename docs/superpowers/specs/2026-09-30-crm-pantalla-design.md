# Frontend nuevo en React — sub-proyecto 2: el CRM (y Equipo)

Escrito el 30/9/2026. Rama `crm-pantalla`, que sale de `main`, en su propio worktree.

## 0. Para retomar en frío

- **Estado**: diseño aprobado por el usuario, sección por sección. Falta el plan
  (`docs/superpowers/plans/2026-09-30-crm-pantalla.md`).
- **Qué reemplaza**: `2026-09-29-crm-pantalla-contexto.md` sigue valiendo para el modelo de
  datos y el relevamiento del producto, pero **sus preguntas de la sección 8 están contestadas
  acá**, y dos cosas que dice quedaron viejas:
  - *dónde vive el código*: es React (`src/pages/crm/`), ver la spec de la cáscara;
  - *el detalle del lead*: el producto ya no lo despliega en acordeón, lo abre en un `Dialog`
    (ver §3.3).
- **Qué cambia de lo decidido el 29/9**: «cualquier usuario activo ve y edita todo el CRM» y
  «`rol` todavía no restringe nada» **dejan de valer para el CRM**. Ahora hay carteras con
  permisos (§2). Y el funnel, los canales y las prioridades los edita solo un `SUPERADMIN`.

### Decisiones tomadas con el usuario (no reabrir sin motivo)

1. **Se reconstruye chico, no se copia entero.** `/leads` del producto son ~19.600 líneas
   (`LeadAccordion.tsx` 5.645, `LeadList.tsx` 2.013), la mitad inmobiliarias y con maquinaria
   de escala (virtualización, paginado keyset, RPCs de listado) que acá sobra: son decenas de
   leads. Se copian tal cual la lógica pura y los componentes chicos que no dependen de lo
   inmobiliario; el resto se escribe de nuevo sobre las `crm_*`, con el mismo aspecto y flujo.
2. **Los leads son de una cartera** (`assigned_to`) **y la visibilidad entre carteras es un
   permiso**, copiado del modelo `user_data_access` del producto.
3. **El permiso se aplica en la base (RLS), no solo en pantalla.** En el producto la
   visibilidad es solo un filtro de la pantalla — lo admite su propio código
   (`src/service/user_data_access.service.ts:5-11`: «hoy esta tabla NO gatea el acceso») —.
   Acá existe el rol `SDR` y un permiso sin cerradura no es un permiso.
4. **El listado se trae entero al cliente y se filtra en JS.** El usuario pidió primero RPCs
   como el producto; se verificó que allá `list_leads_page` y `count_leads_buckets` son
   `SECURITY INVOKER`, no aplican ningún permiso y existen solo por volumen. Con la RLS
   cortando, `select` ya devuelve solo lo que cada uno puede ver.
5. **Equipo entra en este sub-proyecto**: sin él, los permisos no tienen pantalla para
   configurarse.
6. **El lead se abre en un `Dialog` casi a pantalla completa**, como hoy en el producto.
7. **Alta con dialog + RPC transaccional**, igual que `create_lead_with_client`.
8. **Filtros, contadores, reasignación, tareas, reuniones, canales y funnel**: como el
   producto, sin lo inmobiliario (§3.4–§3.6).

## 1. Qué es y para qué

Lorenzo y Antonio (y los SDR que entren) siguen a las inmobiliarias que le compran a Propelia
con la misma pantalla con la que cada inmobiliaria sigue a sus compradores en el producto.
**Éxito** = cargar un lead, gestionarlo (etapa, gestiones, tareas, reuniones, comentarios)
sin salir del dialog, repartirlo entre carteras, y que un SDR vea solo lo suyo y lo que le
dieron.

## 2. La base: permisos y SQL nuevo

Todo va a `supabase/schema.sql` como cambio **idempotente** (`create table if not exists`,
`create or replace`, `drop policy if exists` + `create policy`) y se aplica en la base nueva
(`itqwxnmuxuiiydsueazb`) con el MCP **previa confirmación explícita del usuario**: es la base
en producción. Después se regeneran los tipos (`src/types/database.types.ts`).

**Hoy no le cambia nada a nadie**: Lorenzo y Antonio son `SUPERADMIN` y siguen viendo y
editando todo. La restricción muerde recién con el primer `SDR`.

### 2.1 `crm_data_access`

Copia de `user_data_access`:

| columna | tipo | notas |
|---|---|---|
| `id` | uuid pk | |
| `viewer_id` | uuid → `users` | quién mira |
| `subject_id` | uuid → `users` | la cartera que mira |
| `access` | text, `check in ('read','write')` | `write` implica `read` |
| `created_at`, `updated_at` | timestamptz | `updated_at` por trigger |

`check (viewer_id <> subject_id)` (la cartera propia no se concede: ya es tuya) y único
`(viewer_id, subject_id)`. **Plana y no transitiva**: que A vea a B y B vea a C no hace que A
vea a C, igual que en el producto. Sin soft delete: sacar un acceso es borrar la fila.

### 2.2 Una sola función de permiso

- `crm_puede(owner uuid, nivel text) returns boolean` — `security definer`, `stable`,
  `search_path = public`. Verdadero si **cualquiera**:
  - `owner = auth.uid()`;
  - quien llama es `SUPERADMIN` y está activo;
  - hay una fila en `crm_data_access` con `viewer_id = auth.uid()`, `subject_id = owner` y
    `access = 'write'`, o `access = 'read'` cuando `nivel = 'read'`.

  Siempre exige además `es_usuario()`: un inactivo no puede nada.
- `crm_puede_lead(lead_id uuid, nivel text)` — lo mismo a través de `crm_leads.assigned_to`.

**Todas las policies llaman a estas dos**: la regla vive en un lugar, como `es_usuario()`.
Son `security definer` porque leen `users` y `crm_data_access`, y con `invoker` quedarían
atadas a las policies de esas mismas tablas.

### 2.3 Policies (reemplazan las `*_equipo` y `*_lectura` actuales)

| tabla | leer | escribir |
|---|---|---|
| `crm_leads` | `crm_puede(assigned_to,'read')` | `using crm_puede(assigned_to,'write')` y `with check crm_puede(assigned_to,'write')`: **reasignar exige `write` sobre la cartera vieja y la nueva** |
| `crm_tasks` | con lead: `crm_puede_lead(lead_id,'read')`; sin lead: `crm_puede(assigned_to,'read')` | ídem con `'write'` |
| `crm_comments`, `crm_management_events`, `crm_meetings` | `crm_puede_lead(lead_id,'read')` | ídem con `'write'` |
| `crm_stage_history`, `crm_assignment_history` | `crm_puede_lead(lead_id,'read')` | nadie: los insertan triggers `security definer` |
| `crm_clients` | si existe un lead de ese cliente que puedo leer, **o** `created_by = auth.uid()` | lo mismo con `'write'`, o `created_by = auth.uid()` |
| `crm_priorities`, `crm_funnel_stages`, `crm_channels` | `es_usuario()` | **solo `SUPERADMIN`** |
| `crm_data_access` | `viewer_id = auth.uid()` o `SUPERADMIN` | solo `SUPERADMIN` |

- **`crm_meetings.lead_id` es nullable** en el esquema: una reunión sin lead se lee y escribe
  por su `assigned_to`, igual que una tarea sin lead.
- **Por qué `created_by` en clientes**: el alta crea primero el cliente y después el lead; y
  un cliente cuyo único lead se reasignó a otra cartera deja de verse, que es lo correcto.
- **Catálogo solo `SUPERADMIN`**: un SDR que renombra o borra una etapa desarma el funnel de
  todos. Cambia lo decidido el 29/9 («los usuarios editan el funnel»); aprobado el 30/9.

### 2.4 RPC `crm_create_lead_with_client`

Copia de `create_lead_with_client` del producto (versión endurecida,
`20260913151338_harden_create_lead_with_client.sql`), sin organización ni tipo de lead.

- **Parámetros**: datos del cliente (`p_first_name`, `p_last_name`, `p_company_name`,
  `p_email`, `p_phone`), `p_assigned_to`, `p_channel_id`, `p_funnel_stage_id` (por defecto la
  etapa `NEW`), `p_initial_task_due_date date`. Devuelve `{ lead_id, client_id,
  client_reused }`.
- **`security definer`**, no `invoker`: para reutilizar el cliente tiene que encontrarlo por
  teléfono o email **aunque sea de una cartera que quien llama no ve**. Con `invoker`, la RLS
  lo esconde, el lookup no lo encuentra, el insert choca contra el índice único y el alta
  falla. Por eso chequea a mano, al principio: `es_usuario()` y
  `crm_puede(p_assigned_to,'write')`; si no, `raise` con un código propio.
- **En una transacción**:
  1. exige teléfono o email (sin ninguno no hay con qué deduplicar);
  2. busca el cliente activo por `lower(email)` o `phone`; si hay, lo reutiliza; si no, lo
     crea;
  3. si ese cliente ya tiene un lead activo con `p_assigned_to`, `raise` (es el único
     `(client_id, assigned_to)`, dicho con un mensaje que la pantalla sabe traducir);
  4. crea el lead;
  5. crea la tarea **«Asesorar cliente»** del lead, asignada al responsable, que vence
     `p_initial_task_due_date`. La fecha la manda el front porque «hoy» es el de la zona de
     quien carga y no el UTC del servidor — igual que el producto.
- `revoke execute … from public, anon`; `grant execute … to authenticated`.

### 2.5 Realtime

Se suma `crm_data_access` a `supabase_realtime`: si te dan o te sacan acceso, la pantalla se
entera. Las demás tablas ya están publicadas. Realtime aplica la RLS a `postgres_changes`, así
que a cada uno le llegan solo los eventos de lo que ve.

## 3. El front del CRM

### 3.1 Estructura

La del producto, para que el código de allá se reconozca acá:

```
src/pages/crm/
├─ Crm.tsx                  cabecera (carteras, funnel, canales, + Nuevo lead) + CrmLeadList
├─ lib/                     PURO, con test (vitest, sin base)
│  ├─ gestionStatus.ts (+ calendarDeadline.ts)   copiados tal cual
│  ├─ effectiveStage.ts, discardStage.ts          copiados
│  ├─ leadFilters.ts                              copiado y podado
│  ├─ leadFilterParams.ts                         copiado (filtros ⇄ URL)
│  ├─ computeLeadListCounters.ts                  copiado y podado
│  ├─ reassignCollisions.ts                       copiado
│  ├─ systemComment.ts                            copiado
│  └─ permisos.ts                                 NUEVO
├─ service/crm.service.ts   todas las queries y mutaciones contra crm_*
├─ hooks/
│  ├─ useCrmLeads.ts        leads + cliente embebido
│  ├─ useCrmCatalogos.ts    etapas, prioridades, canales
│  ├─ useVisibleAgents.ts   copiado; lee crm_data_access
│  └─ useCrmRealtime.ts     un canal; invalida las queries de lo que cambió
└─ components/
   ├─ CrmLeadList.tsx       buscador, pestañas, chips, renglones, selección múltiple
   ├─ LeadDialog.tsx        el dialog (§3.3)
   ├─ ClientFields, LeadTasksPanel, DockedActivityChat, LeadRowActions,
   │  ReassignLeadsDialog, AgentFilterButton, BulkActionBar,
   │  FunnelConfigDialog, ManageChannelsDialog     copiados y adaptados a crm_*
   ├─ MeetingsPanel.tsx     NUEVO: el producto usa visits con calendario, no sirve
   └─ NewLeadDialog.tsx     versión chica de NewLeadWizard, contra la RPC
```

- **Lo que se poda de lo copiado**: todo lo de propiedades, cruces, compraventa, alquiler,
  briefing, zonas, matching, IA, Idealista, `lead_type`, `organization_id` y el
  `SuggestionTray`.
- **Dependencias de afuera de `leads/`** (`useTasks`, `TaskDueDatePicker`, `lib/calendarDate`,
  `OwnerAvatar`, `displayName`, …): se copian **solo las que se usen**, podadas, a
  `src/components` y `src/lib`. No se trae el árbol entero.
- **`permisos.ts`** (`carterasVisibles()`, `puedeEscribir(owner)`) es el espejo en pantalla de
  `crm_puede()`: sirve para no mostrarle a un SDR un botón que la base le va a rechazar. **No
  es la seguridad**, que vive en la base. Misma relación que `accesoDe()` con `es_usuario()`.

### 3.2 Flujo de datos

- **Lectura**: TanStack Query trae una vez `crm_leads` activos con `client:crm_clients(*)`, los
  catálogos y `users`. Filtros, pestañas y contadores salen de funciones puras sobre ese array
  (`useMemo`). El detalle del lead (tareas, comentarios, gestiones, reuniones, historiales) se
  pide **al abrir el dialog**, como `getLeadDetail` en el producto.
- **Escritura**: mutaciones optimistas (`onMutate` → `setQueryData`; `onError` → rollback y
  toast de `sonner`). Es el «optimista + revertir + aviso» del tablero, dicho en Query.
- **Realtime**: `useCrmRealtime` abre un canal para las tablas publicadas e invalida la query
  que corresponde. Un eco de lo propio re-trae lo mismo que la mutación ya puso; no pisa nada
  porque los campos de texto guardan al salir (blur), como en el producto.
- **Historiales y gestión los escribe la base** (triggers). El front nunca inserta en
  `crm_stage_history`, `crm_assignment_history` ni escribe `gestion_*`.

### 3.3 El dialog del lead

Copia del patrón actual del producto (`LeadList.tsx:1767`):

- Se abre desde el renglón; el lead abierto vive en `?lead=<id>`, así que un enlace abre ese
  lead ya abierto.
- 94vw × 92vh; a pantalla completa abajo de 768px.
- **No se cierra clickeando afuera** (adentro se edita con guardado al blur): se sale con
  Escape o «Volver al panel».
- Cabecera: «Volver al panel», lead anterior/siguiente (chevrones y ↑/↓ del teclado, con las
  mismas excepciones del producto), las acciones del renglón (`LeadRowActions`) y las
  pestañas.
- **Pestañas: Cliente | Tareas | Reuniones.**
  - *Cliente*: `ClientFields` (empresa, nombre, teléfono, email, teléfonos alternativos,
    notas) + etapa, canal y responsable.
  - *Tareas*: `LeadTasksPanel`.
  - *Reuniones*: `MeetingsPanel` — listado con agendar, completar y cancelar (con motivo).
- **Actividad acoplada** (`DockedActivityChat`): comentarios `MANUAL`, eventos `SYSTEM` y las
  gestiones (marcar gestión, posponer).

### 3.4 Lista, filtros y contadores

- Renglones como los del producto (`leadCells`): empresa y contacto, etapa con el color de su
  prioridad, estado de gestión, responsable, última actividad. En el teléfono, tarjetas.
- **Filtros, todos en la URL** (`leadFilterParams`): buscador (empresa, contacto, teléfono,
  email), **carteras** (`AgentFilterButton`, solo si podés ver a otros; nunca vacío), etapa,
  **prioridad** (la de la etapa: `crm_leads` no tiene prioridad propia, cuelga de
  `crm_funnel_stages.priority_id`), estado de gestión (pendiente / al día / postergada),
  tareas vencidas e «incluir descartados».
- **Contadores** de pestañas y chips (`computeLeadListCounters`) sobre lo que la RLS dejó ver.

### 3.5 Alta, reasignación y descarte

- **Alta**: `NewLeadDialog` (empresa, contacto, teléfono, email, canal, responsable = yo por
  defecto, entre las carteras donde tengo `write`) → `crm_create_lead_with_client`. Si reutilizó
  un cliente, lo avisa.
- **Reasignar**: de a uno (renglón o dialog) y en lote (selección múltiple + `BulkActionBar` +
  `ReassignLeadsDialog`). Solo se ofrecen carteras con `write`; `reassignCollisions` avisa antes
  de chocar con el único cliente+responsable. Deja un comentario `SYSTEM` (`systemComment`),
  como `reassign_leads`. El historial lo escribe el trigger.
- **Descartar**: a la etapa `DISCARDED` con motivo (`discard_reason`), como `discardStage`.

### 3.6 Configuración

- `FunnelConfigDialog`: crear, renombrar, reordenar y borrar etapas, con su prioridad y
  tolerancia. Respeta `allow_delete`/`allow_reorder`/`allow_rename`: Nuevo y Descartado no se
  borran.
- `ManageChannelsDialog`: la tabla arranca vacía y se carga desde ahí.
- Los dos solo se muestran a un `SUPERADMIN` (la base igual lo exige).

## 4. Equipo

- **Entrada nueva en `NAV`** (`src/components/nav.ts`): `/equipo`, ícono `Users`. La leen la
  barra lateral y la del teléfono.
- **Pestaña Tabla**: un renglón por cartera visible (la propia + las concedidas; un
  `SUPERADMIN`, todas). Columnas: avatar y nombre, rol, **leads activos**, **por etapa**
  (barrita apilada con el color de la prioridad de cada etapa), **gestiones vencidas**,
  **tareas vencidas**, **reuniones este mes**.
  - Todo se calcula **en el cliente** con las mismas funciones puras del CRM, sobre los leads de
    `useCrmLeads` + una query de tareas pendientes + una de reuniones del mes. La RLS ya
    recortó: no puede aparecer un número de una cartera ajena.
  - Tocar el renglón lleva a `/crm?owners=<id>`; tocar un número, al CRM ya filtrado a eso
    (p. ej. solo las gestiones pendientes de esa cartera). Los enlaces se arman con
    `leadFilterParams` y no a mano: en el producto `gestion` es la lista de estados
    **excluidos**, y un `?gestion=pendiente` escrito a mano mostraría justo lo contrario.
- **Pestaña Visibilidad**: `VisibilityMatrix` del producto, copiada. Filas = quién mira,
  columnas = a quién, celda = `—` / `lee` / `edita`. **Solo la ve un `SUPERADMIN`.**
- Sin alta de miembros (las altas de `users` siguen por MCP), sin Idealista ni propiedades.

## 5. Errores

- Mutación que falla: rollback + toast con el motivo.
- Rechazo de RLS (`42501` / fila no devuelta en un update): «No tenés permiso sobre esa
  cartera», no el error crudo.
- Errores de la RPC de alta traducidos («Ese cliente ya tiene un lead con ese responsable»,
  «Falta teléfono o email»).
- **Un error de red no vacía la lista**: se muestra el error con «Reintentar», misma regla que
  `accesoDe()` («un error de red NO es sin acceso»).

## 6. Pruebas

- **TDD estricto en `lib/`** (vitest, sin base): filtros, parámetros de URL, contadores,
  gestión, `permisos.ts`, colisiones de reasignación, texto de comentarios `SYSTEM`. Los tests
  del producto de esas piezas se traen como punto de partida.
- **El SQL se prueba contra la base de verdad sin dejar rastro**: cada caso en una transacción
  con `set local role authenticated` y `set local request.jwt.claims` de un usuario, terminada
  en `rollback`. Casos mínimos:
  - un `SDR` sin accesos ve solo su cartera y no puede escribir en otra;
  - con `read` ve pero no escribe; con `write` escribe;
  - reasignar exige `write` en la cartera vieja y la nueva;
  - un `SDR` no puede tocar el catálogo ni `crm_data_access`;
  - la RPC reutiliza un cliente ajeno por teléfono/email, rechaza el duplicado
    cliente+responsable, crea la tarea «Asesorar cliente» y rechaza a quien no tiene `write`
    sobre `p_assigned_to`;
  - un usuario inactivo no puede nada.

  Los casos quedan escritos en `supabase/tests/crm-permisos.sql` para volver a correrlos.
- `vitest run` y `tsc` los corre el usuario desde Windows; desde WSL solo
  `node node_modules/typescript/bin/tsc -b`. **Nunca build.**

## 7. Entrega

- Rama `crm-pantalla` desde `main`, en su propio worktree.
- Orden: **SQL** (schema.sql → confirmación del usuario → aplicar con MCP → tipos regenerados
  → pruebas de §6) → **`lib/` con TDD** → **CRM** → **Equipo** → **CLAUDE.md** (sección «El CRM»
  corta: permisos por cartera, dónde vive cada cosa, qué se copió del producto).
- Si hace falta `npm install` de alguna dependencia nueva, se le pide al usuario desde Windows.

## 8. Fuera de alcance (YAGNI)

Objetivos y metas, vista de agenda o calendario, lista global de tareas del CRM, importar
leads, integración con email o WhatsApp, marca de leído por usuario (`useLeadReadTracker`),
sugerencias de IA, virtualización y paginado, alta de miembros desde Equipo.

## 9. Criterio de terminado

- Un `SUPERADMIN` carga un lead (con cliente nuevo y con uno existente), lo abre, cambia
  etapa, marca y pospone gestiones, agrega tareas, reuniones y comentarios, lo reasigna de a
  uno y en lote, y lo descarta con motivo; todo se ve en la otra sesión por realtime.
- Configura el funnel y los canales.
- En Equipo ve los números por cartera, y desde un número llega al CRM ya filtrado.
- Da a un `SDR` acceso `read` a una cartera: el `SDR` la ve y no la puede editar; se lo saca y
  deja de verla.
- Las pruebas de §6 pasan; `vitest run` y `tsc` pasan.
