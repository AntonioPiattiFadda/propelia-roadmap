# Convenciones del proyecto

## El frontend nuevo (React) — leer primero

**Desde el 29/9/2026 la raíz del repo es un proyecto Vite + React** (rama `frontend-react`
hasta que se mergee). Tres páginas en la barra lateral: Roadmap, CRM y Caja. Diseño en
`docs/superpowers/specs/2026-09-29-frontend-react-cascara-design.md`.

- **Stack y design system copiados de `propelia-frontend`**: React 19, Vite, TS, Tailwind v4,
  shadcn/Radix, TanStack Query, sonner, lucide. `src/components/ui` y `src/index.css` son
  copias del producto: si hay que cambiarlos, primero preguntarse si el cambio va en el producto.
- **`npm install`, `vitest` y `npm run dev` se corren desde Windows**, nunca desde WSL. El
  typecheck sí anda desde WSL: `node node_modules/typescript/bin/tsc -b`.
- **Acceso**: `accesoDe()` en `src/lib/acceso.ts` es la misma regla que `es_usuario()` en la
  base — fila activa en `users` o no pasás. Un error de red NO es «sin acceso».
- **Páginas por rol** (6/10/2026): `SUPERADMIN` entra a todo; `SDR` a `/crm` y, desde el 21/10/2026,
  a `/agenda` y `/ajustes` (ahí solo ve «Integraciones»). Lo que solo ve un SUPERADMIN lleva el badge
  SA del producto (`SuperadminBadge`, `soloSuperadmin()` en `nav.ts`) en la barra lateral. La regla es
  `NAV[].roles` en `src/components/nav.ts` (`navDe`, `puedeEntrar`, `inicioDe`): de ahí leen la
  barra lateral, la de pestañas y el guard `RequireRol` (`pages/auth/guards.tsx`), que devuelve a
  la primera página permitida. **Es solo el front**: la RLS de las `roadmap_*`, el bucket y el
  iframe `legacy/` siguen abiertos a cualquier `es_usuario()` — un SDR los lee por la API.
  Los `hijos` llevan sus propios `roles` (`navDe` los recorta) y `puedeEntrar` valida contra la
  entrada **más específica** que calce, no contra el padre. El redirect de `/backlog` va afuera
  de `RequireRol`: adentro, el guard lo rebotaría al inicio antes de redirigir.
- **«Caja vista Loro»** (25/10/2026, por pedido): hijo de Caja en la barra lateral que abre
  `/caja?vista=meses` en **otra pestaña** (`search` y `nuevaPestana` de `NavItem`, `hrefDe`). Es la
  Caja como planilla: un bloque por mes del más viejo al más nuevo, fijos mensuales arriba y
  variables abajo, cada renglón con quién pagó («Pagó X» o «Sin pagar»), y arriba un «Resumen de gastos de …» por persona
  (`lib/porMes.ts`, `CajaPorMes.tsx`). **Sin filtros**: ni fechas, ni tipo, ni «+ Pendientes», ni
  el resumen de cuatro cajas de la lista. Muestra todo el historial hasta fin de este mes (más
  allá sumaría como pendientes los fijos que todavía no llegaron).
  Esta pestaña no es la de una caja «para Loro»: muestra lo mismo para cualquier SUPERADMIN.
- **«Claude Toni · extra empresa»** (25/10/2026, por pedido): una caja chica a la derecha de la
  lista de gastos, en las dos vistas de la Caja (en el teléfono, debajo), con lo que Toni le
  transfiere a Lorenzo todos los meses por Claude: **siempre 55 €** (`MONTO_CLAUDE_TONI`), sin
  monto por mes. Un renglón por mes, **el más viejo arriba** (por pedido), desde `DESDE_CLAUDE_TONI`
  (`'2026-10'`, se cambia ahí) hasta un año después de este mes (`MESES_POR_DELANTE`), más
  cualquier pagado que caiga afuera (`mesesClaudeToni`,
  `lib/claudeToni.ts`), escrito corto, «Oct 26» (`mesCorto`); cada uno con un tilde **sin rótulo** (el `aria-label` dice «Pagado …») y
  **sin resumen de deuda** arriba, las dos cosas por pedido. Un mes pagado lleva debajo una nota
  libre de cuándo o cómo se pagó («¿Cuándo se pagó?», `conNota`), que se guarda al salir del campo
  o con Enter; desmarcar el mes se lleva su nota. Todo es optimista y vuelve atrás si no se guarda.
  **Es plata entre ellos y no de la empresa**: no toca `expenses`, los totales, el resumen ni
  `porMes.ts`, y no tiene que ver con la etiqueta «Claude Suscription». **Sin migración**: vive en
  `roadmap_notas`, fila `caja-claude-toni` (`useClaudeToni`), igual que las notas de la Caja;
  `texto` es un JSON `{"2026-10":{"nota":"transferencia 3/10"}}` (clave presente = pagado) y se
  lee a la defensiva (`leerPagados`: vacío o roto es ninguno pagado, y la forma vieja
  `["2026-09"]`, que llegó a escribirse unas horas, se lee como pagado sin nota).
- **Un gasto cargado se edita** (25/10/2026, por pedido): el lápiz de la fila, en la lista y en la vista
  por mes, abre `EditarGastoDialog`: monto, fecha, período (fijo), notas (variable) y quién pagó (si
  está pagado). Etiqueta, tipo y estado no: un pendiente se paga con «Pagar». Reglas en
  `validarEdicion` (`lib/formularios.ts`), mismas que el alta. Sin migración.
- **Variables**: `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`).

## Migraciones — SIEMPRE con el CLI

Desde el 6/10/2026 (patrón copiado de `propelia-frontend` y `ms-frontend`). El proyecto es
`Propelia` (`itqwxnmuxuiiydsueazb`) y **no hay staging**: lo que se aplica, se aplica en producción.
Trabajan dos personas, así que **toda migración queda como archivo en `supabase/migrations/` y
se commitea**. Una aplicada por fuera del CLI no deja rastro en el repo y el otro no puede saber
qué cambió.

```bash
supabase migration new <nombre>   # crea supabase/migrations/<timestamp>_<nombre>.sql
# escribir el SQL en ese archivo (y el mismo cambio en supabase/schema.sql)
supabase migration list           # local y remoto tienen que coincidir antes de aplicar
supabase db push                  # aplica al remoto y lo registra
```

- **Claude crea las migraciones, nunca las aplica.** `supabase db push` lo corre siempre la
  persona, a mano, desde su terminal (`! supabase db push` en esta sesión).
- **Prohibido** `mcp__supabase__apply_migration` o cualquier camino que aplique DDL directo al
  remoto. `mcp__supabase__execute_sql` **sí**, pero **solo para leer**: inspeccionar el esquema,
  `pg_policies`, `pg_proc`, verificar que una migración quedó corrida, correr
  `supabase/tests/crm-permisos.sql` (que termina en `rollback`).
- **Quién hace qué** — se mira `git config user.email` del repo, **no** el `userEmail` de la
  sesión de Claude Code, que puede mostrar el de otra persona:
  - **Lorenzo** (`lorenzopiattifadda@gmail.com`): crea la migración y la commitea en su rama,
    **pero no la aplica**. No se le propone `db push` ni se le pasa el comando. Al terminar se le
    recuerda que la aplica Antonio después de revisarla y mergearla.
  - **Antonio** (`antonio.piattifadda@gmail.com`): revisa, mergea y aplica con `supabase db push`.
    Si el archivo tiene un timestamp anterior a la última migración ya aplicada, se **renombra con
    un timestamp nuevo** antes de aplicar (el contenido no cambia, solo el nombre).
- **`supabase/schema.sql` sigue siendo la foto entera** para levantar un proyecto vacío. Las
  migraciones son la historia sobre el proyecto que ya existe: todo cambio va en los dos lados.
- **Las funciones se migran con `create or replace function` completo**, nunca un fragmento: el
  archivo es el registro que va a leer el otro.
- **Las cuatro primeras** (`schema_inicial`, `rol_sdr`, `crm_permisos_por_cartera` y su `_fix_1`)
  se aplicaron por MCP antes de esta regla: están en la base y no tenían archivo. Se bajaron con
  `supabase migration fetch --linked`. No se tocan.
- Nada de `db pull`, `db reset` ni `migration repair` sobre producción.
- **Deploy**: Vercel. **Netlify publica `legacy/`** mientras el Roadmap nuevo no esté portado:
  Base directory = `legacy`, Publish directory = `legacy`, Build command vacío. Con el Base
  en la raíz, Netlify haría `npm install` de todo Vite/TS en cada deploy del tablero viejo.
- **El backlog es un subgrupo del Roadmap** (5/10/2026): vive en `/roadmap/backlog`. **Desde el
  23/10/2026 (por pedido) no está en la barra lateral**: la ruta sigue andando por URL y entra con
  los roles del roadmap. `/backlog` redirige, para no romper favoritos.
- **`/roadmap` y `/roadmap/backlog` son el tablero vanilla en un iframe** (29/9/2026), mientras el port
  no esté hecho. `servirLegacy()` en `vite.config.ts` sirve `legacy/` bajo `/legacy/` en dev y
  lo copia a `dist/legacy/` en el build, sin `scripts/` ni su `package.json`: la carpeta no se
  mueve y Netlify sigue igual. La URL es `/legacy/index.html?embed=1&vista=estado|backlog`
  (`urlDelLegacy()`); con `embed=1` el vanilla le da prioridad a la vista de la URL y esconde
  su navegación entre vistas (`html.embed`). La sesión se comparte sola: mismo origen, mismo
  `localStorage`, siempre que el `.env` apunte al mismo proyecto que `legacy/supabase-sync.js`.
- **`legacy/package.json`** (`{ "type": "commonjs" }`) existe porque la raíz es ESM y los `.js`
  del vanilla exportan con `module.exports` para sus tests de node: sin él, `module` es
  undefined y la guarda de export no corre.

## Google Calendar y la Agenda — `/agenda` y `/ajustes?tab=integraciones`

Desde el 21/10/2026, copiado **igual** de `propelia-frontend` (por pedido). Lo que allá son visitas
acá son las reuniones del CRM (`crm_meetings`, las demos incluidas). Migración
`20261021151726_crm_google_calendar`.

- **La conexión es de cada uno**: «Conectar» en Ajustes → `calendar-oauth-start` (URL de Google con
  `state` firmado) → `calendar-oauth-callback` (canjea, cifra los tokens con `TOKEN_ENCRYPTION_KEY`
  y guarda `calendar_connections`, una fila por persona) → vuelve a `/ajustes?tab=integraciones`.
  El front lee solo columnas sin tokens (grants por columna). Desconectar borra la fila.
- **Cada reunión va sola al Google de su responsable** (`calendar-sync`): nace con
  `sync_status = 'pending'`, el front la empuja fire-and-forget al guardarla y el cron
  `calendar-sync-sweep` (cada 5 min) levanta lo que quedó. Sin Google conectado queda `disabled`.
  Editar o cancelar pasa por `buildMeetingUpdatePatch` (re-encola y bumpea `ics_sequence`);
  **marcarla hecha no** (`markMeetingOutcome`), igual que en el producto. La demo invita por Google
  al «mail de la invitación» (`guest_emails`).
- **Y vuelve**: `calendar-webhook` recibe los avisos del watch de Google (renovado a diario por
  `calendar-watch-renewal`) y mover, renombrar o borrar el evento cambia la reunión. Reconoce solo
  los eventos con `propelia_crm_meeting_id`, **no** `propelia_visit_id`: la misma cuenta de Google
  puede estar conectada al producto y acá, y cada sistema toca solo lo suyo.
- **La Agenda** es la del producto: semana con tus reuniones y el resto de tu Google (solo lectura),
  click en la grilla agenda, click en una reunión la edita. `?leadId=&title=` agenda atado a un lead.
- **El color de la última reunión** se recuerda en `users.last_meeting_color_id` por la RPC
  `crm_set_last_meeting_color` (el front no escribe `users`).
- **Secrets** de las edge functions: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `TOKEN_ENCRYPTION_KEY` (32 bytes en base64), `GOOGLE_CALENDAR_ALLOWED_REDIRECT_ORIGINS` (CSV de
  orígenes; vacío = solo `http://localhost:4100`) y `APP_BASE_URL` (sin él, el evento va sin link al
  lead). En la consola de Google, el cliente OAuth tiene que tener como redirect
  `https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/calendar-oauth-callback`.
- **«Agendar demo» se agenda en la ventana de «Registrar actividad» del CRM** (23/10/2026, por
  pedido; del 22/10 abría la Agenda en otra pestaña): es una pastilla más del registro. Elegida, la
  ventana se ensancha y muestra el formulario de la reunión de la Agenda (`MeetingFormContent` con
  `demo`), del responsable del lead, con la inmobiliaria y **siempre `lorenzopiattifadda@gmail.com`
  (sin punto) e `info@propelia.es`** (`INVITADOS_DE_TODA_DEMO`, 23/10/2026; espejo en
  `_shared/leadNotifications/supabaseAdapters.ts`, que los cuenta como equipo para que el aviso nunca
  les vaya a ellos) como invitados (`invitadosDeLaDemo`, `lib/reuniones.ts`). Nace con una
  **descripción para el cliente** (`DESCRIPCION_DE_DEMO`: va al evento de Google y la ve el invitado)
  y el **recordatorio a 10 minutos** (`RECORDATORIO_DE_DEMO`). Pasar de una llamada o nota a «Agendar
  demo» **no pierde lo escrito**: con quién, «¿Es decisor?», decisor apuntado, texto y etapa pasan al registro de la
  demo (`registroDeDemoDesdeLaActividad`; Descartado no). El
  horario se escribe a mano o con **«Seleccionar día y hora»**, que abre la semana de la Agenda
  encima de todo (`SelectorDeHorario`, mismos datos que la página por `useSemanaDeAgenda`): tocar un
  hueco vuelve al formulario con ese día y hora (`horarioDelSlot`: conserva la duración cargada).
  **La demo se agenda en hora de España** (26/10/2026, por pedido): las 10:00 elegidas son las 10:00
  de Madrid, esté quien agenda donde esté (`instanteDelFormulario`, `lib/horaDeEspana.ts`, sobre
  `momentoDeLaTarea`). El formulario lo dice debajo del horario («Hora de España · 05:00 en tu hora»,
  `horaEnTuZona`; en España no agrega nada) y el «Ocupado» también va en hora de allá. El selector
  dibuja la semana del reloj de España (`horaDeEspana` en `useSemanaDeAgenda` y `WeekGrid`): los
  eventos se reescriben sin zona con `eventosEnHoraDeEspana`, así la grilla no sabe de zonas. **Solo
  la demo**: la página /agenda y editar una reunión siguen en la hora de cada uno.
  Con `demo` el formulario suma el **«Email del cliente»** arriba de los invitados (cambiarlo cambia
  ese invitado; si la inmobiliaria no tenía email, se le guarda) y una **columna «Registro de
  actividad»** (`RegistroDeDemoPanel` + `useRegistroDeDemo`). **Desde el 23/10/2026 (por pedido) va a
  la izquierda** (en el teléfono, arriba) y con **el orden y el diseño del registro de la llamada**,
  con los mismos renglones (`FilasDelRegistro.tsx`, que usan los dos): «Quién asiste» (doble clic abre
  la ficha), «¿Es decisor?» (mismas reglas: `decisorSabido`, `campoDelNuevoDecisor`; obligatoria
  cuando se pregunta), el texto, el «Decisor» apuntado y «El lead queda en» (obligatoria, sin
  Descartado). Sin «Teléfono contacto»: en una demo no se marcó ningún número. **Es para el equipo,
  no llega al cliente ni al evento de Google**. Con la reunión guardada deja en el lead un comentario con meta `tipo: 'demo'` (con
  quién, `decisorApuntado` y el id de la `reunion`), carga al perfil a los escritos a mano y al
  decisor, y mueve la etapa. La actividad pinta registro y reunión como **un renglón** con el día y
  la hora de la reunión de hoy (`lineaDeTiempo`). La Agenda ya no lee `demo=1`; `?leadId=&title=`
  sigue andando. **Guardada la demo, `DemoAgendadaDialog` ofrece «Avisar por WhatsApp»** (23/10/2026,
  por pedido): abre el chat con `+34 675 24 91 46` (`WHATSAPP_AVISO_DE_DEMO`) y un mensaje festivo con
  inmobiliaria, día y hora **de España**, responsable, quién la agendó, invitación, asistentes, decisor,
  etapa y notas (`mensajeDeDemoAgendada`, `lib/avisoDeDemo.ts`). No manda nada solo: lo envía quien agenda.
- **La demo se cancela desde su renglón de la actividad del lead** (23/10/2026, por pedido): un
  ícono de calendario tachado, mientras la reunión esté `scheduled` y con permiso de escritura, abre
  `CancelarDemoDialog`: motivo opcional y **«El lead queda en» obligatorio y vacío**, como al
  registrar. Cancela con `cancelarReunion` (re-encola: borra el evento de Google y dispara el aviso
  «Demo cancelada») y recién después mueve la etapa (Descartado abre su dialog de siempre). El
  renglón queda con «Cancelada · motivo» arriba (`ItemActividad.reunion`, `lineaDeTiempo`).
- **Avisos a leads** (21/10/2026, copiado de `propelia-frontend`, migración
  `20261021155052_lead_notifications`): Ajustes → «Avisos a leads» (solo SUPERADMIN, el «admin de la
  org» de allá) prende por evento y vía: Demo agendada / reprogramada / cancelada; recordatorios y
  reseña «Próximamente»; **solo email** disponible, SMS y WhatsApp cableados y apagados
  (`AVAILABLE_CHANNELS` en `_shared/leadNotifications/channels.ts` y su espejo en
  `src/pages/ajustes/lib/leadNotifications.ts`). Sin fila = apagado: arranca todo apagado. Outbox:
  los triggers de `crm_meetings` (toda reunión con lead) encolan en `lead_notification_events` y
  `lead-notifications-dispatch` manda cada minuto (cron con anon key; allá es un secreto de Vault).
  Reprogramada y cancelada salen solo si la agendada ya había salido. El mail va al **mail de la
  invitación** (el primer invitado que no es del equipo; Lorenzo nunca) y si no, al de la
  inmobiliaria; firma y `reply_to` como las plantillas de «Mensajes» (`remitenteDe`). Los íconos del
  mail se leen del bucket público `email-assets/v2` del producto (`EMAIL_ASSETS_BASE_URL` lo pisa).
  Sin grupo «Propiedad»: acá no hay inmuebles. Estos envíos **no** van a `crm_emails` (no avisan rebotes).
  **Los mails se iteran en `docs/avisosALeads/`** (copia de `docs/leadNotifications/` del producto):
  `index.html` es el visor; los `*-preview.html` se editan a mano y, aceptado el cambio, se pasa a
  `templates/demoScheduledEmail.ts`; `npm run avisos:generar` reescribe los `*-generated.html` con el
  template real (`--previews` además pisa los previews). Los tres «Próximamente» son borradores que
  arma `generar.ts`, todavía sin handler.
  **Diseño elegido: tema `acento`** (21/10/2026, por pedido; `LeadEmailTheme` en `leadEmailLayout.ts`,
  `'neutro'` es el del producto): logo de Propelia, borde de arriba azul `#0147FE` y burbujas de la
  cabecera en azul, tarjeta y pie teñidos. Los íconos y las burbujas azules (`header-corner-brand.png`)
  viven en `public/email/avisos/` y se sirven en `{APP_BASE_URL}/email/avisos` (`emailAssetsBaseUrl`,
  `_shared/leadNotifications/assets.ts`): sin `APP_BASE_URL` caen al bucket del producto, donde las
  burbujas azules no existen. Los tres avisos de demo nacen prendidos por email (migración
  `20261021183824_lead_notifications_demos_activos`).
- **Lo que no sigue a Google**: la baja de un miembro (`crm_dar_de_baja_miembro`) le pasa las
  reuniones futuras al sucesor pero no las re-encola; el evento queda en el calendario del que se va.
- Código en `src/pages/agenda/` (libs puras con sus tests, copiados del producto) y
  `supabase/functions/_shared/{googleCalendar,webhookSync,googleOAuth,googleTokens,oauthState,tokenCrypto}.ts`.

## Onboarding de clientes — `/onboarding` (a construir)

Desde el 26/10/2026 el alta de clientes nuevos se muda de `propelia-frontend` (`/onboarding-admin`)
acá: arranca desde el lead que firmó y el lead queda atado a su organización en Propelia
(`crm_leads.propelia_organization_id`, sin FK). **Todo está en `docs/onboarding/`** (empezar por
el `README.md`): el flow de 7 pasos, el modelo de datos, el contrato del puente y una copia del
código actual en `referencia/`.

- Lo que es del producto (orgs, import de la cartera, mails simulados, links de pago) pasa **sólo**
  por la edge function `propelia-bridge` (`docs/onboarding/PUENTE.md`). El front nunca usa la URL
  ni las keys del producto.
- El puente está hecho: `supabase/functions/propelia-bridge/` (tests con `deno test` ahí adentro)
  reenvía a `roadmap-bridge` del producto si quien llama es SUPERADMIN activo. Deploy y secretos
  en `PUENTE.md` › Deploy; mientras no esté deployado, se mockea con los ejemplos de ese archivo.

## Clientes y su onboarding — `/clientes`

Desde el 26/10/2026 (por pedido). Diseño en `docs/onboarding/clientes.html` (el mock) y el resto de
`docs/onboarding/`; migración `20261026184212_clientes_onboarding`, que **la aplica Antonio**.

- **`crm_leads.lead_type`** (`LEAD` / `ONBOARDING` / `CLIENT`) dice qué es el lead, aparte de la
  etapa. Un lead pasa a `ONBOARDING` **solo**, cuando el comercial lo mueve a una etapa con
  `starts_onboarding` (columna «Onboarding» de la configuración del funnel; desde el 27/10/2026,
  por pedido, marcadas «En prueba mes gratis», «Contratado 1er mes» y «Contratado», desde la pantalla): el trigger `crm_leads_lead_type` lo pasa y `crm_leads_crear_onboarding` le crea su
  `client_onboardings` con el responsable del cliente del CRM. **Marcar una etapa «Onboarding» también
  pasa los leads que ya estaban en ella** (trigger `crm_funnel_stages_arranca_onboarding`, migración
  `20261027152708_onboarding_etapa_marcada_arrastra_leads`, que **la aplica Antonio**): antes solo
  contaba entrar, y un lead movido antes de marcar la etapa no llegaba nunca. Solo desde `LEAD`: un `CLIENT` que
  vuelve a pasar por la etapa no reabre nada. **El front nunca escribe `lead_type`**: el trigger
  rechaza el cambio a mano (`crm_lead_type_solo_rpc`), y `client_onboarding_completar` lo pasa a
  `CLIENT`. Pruebas en `supabase/tests/clientes-onboarding.sql` (como `crm-permisos.sql`).
- **La página** (solo SUPERADMIN: `NAV` y gate adentro, como Demos) lista los `ONBOARDING` y abre
  cada alta en un dialog con `?lead=<id>`. Siete pasos (`lib/pasos.ts`, en el código como en el
  producto; en la base solo las tareas hechas); **los pasos 4 a 7 están en «Próximamente»** y no
  cuentan para el avance ni para «Marcar completo». **Dos pestañas** (27/10/2026, por pedido,
  `?tab=mias`): «Sin asignar» (nadie lleva el alta, de cualquier cartera del CRM) y «Asignadas a
  mí»; «Tomar» la pasa de una a otra. Tomar escribe solo `client_onboardings.assigned_to`: el lead
  no cambia de responsable y sigue en la lista del CRM de quien lo pasó a la etapa. Cada tarea lleva sus acciones al lado: copiar y
  abrir WhatsApp (plantillas de `onboarding_message_templates`), copiar el enlace de alta, importar, etc.
- **El equipo lo carga el cliente** (ver el punto de la página pública, abajo; hasta el 27/10/2026
  era un Excel): sin contraseña (es `nombre.apellido`, con el año si no llega a 6, `contrasenaInicial`
  en `lib/equipo.ts`). Importar crea la org y las cuentas por el puente y
  después `client_onboarding_importar_equipo` guarda el equipo, deja `propelia_organization_id` y
  tilda las dos tareas. **«Enviar mails» de accesos no se tilda a mano**: pide confirmar «Verifiqué
  que todas las cuentas entran correctamente» y manda uno por persona por `send-email` con `acceso`
  (solo SUPERADMIN, siempre al email de la cuenta): HTML con la marca armado en el servidor por
  `renderEmailDeAcceso` (`_shared/plantillasEmail.ts`), con usuario y contraseña cada uno en su caja
  para copiar y el aviso de que es temporal y se cambia al terminar el onboarding. Sin «Darse de
  baja»: es de servicio. «Ver cómo les llega» lo muestra en el diálogo; `docs/onboarding/mail-de-acceso.html`
  es una copia generada con datos de ejemplo. Va a `crm_emails` con `plantilla = 'acceso'`, así los
  rebotes se avisan como los demás. Con todos enviados, además completa la tarea del CRM «Revisar e
  importar el equipo de …» del lead (`completarTareasDeRevisarEquipo`, por prefijo del título;
  27/10/2026, por pedido).
  **Un mail de accesos que no llega se avisa y deja tarea** (27/10/2026, por pedido): cada envío va
  con el `leadId`, así que un rebote (o «no se pudo enviar» / «no se envió») se ve debajo del renglón
  de la tarea en /clientes, en el lead y en la campana, y el trigger `crm_emails_acceso_no_llego`
  (migración `20261027154657_onboarding_mail_de_acceso_no_llego`, que **la aplica Antonio**) crea en
  el lead la tarea del CRM «Revisar el mail de acceso que no llegó a …», con alarma en 5 minutos,
  para quien lleva el alta (o el responsable del lead). Los envíos de antes van sin lead: no la crean.
  Con alguno que no llegó, debajo aparece además el tilde «Enviar mensaje al cliente para que corrija
  los mails que están mal» (`TAREA_CORREGIR_MAILS`, `contacto.corregir-mails`, a mano).
  **Un solo WhatsApp avisa todo** (28/10/2026, por pedido, migración
  `20261028115945_onboarding_mensajes_de_accesos`, que **la aplica Antonio**): al lado de «Enviar
  mails», `accesos_enviados` (cada uno recibió usuario y contraseña temporal, mirar spam) y, si algún
  mail no llegó, pegado debajo `corregir_mails`, con `{mails}` = un renglón por mail que no llegó y el
  nombre de quien es (`listaDeMailsQueNoLlegaron`, `lib/mensajes.ts`), pidiendo el email bien escrito
  por WhatsApp. El renglón de corregir no tiene WhatsApp propio. Sin la migración corrida, los
  botones quedan apagados («Falta la plantilla en la base»).
  **«Ver cuentas y contraseñas» dice quién probaste y quién entró** (28/10/2026, por pedido):
  columna «Probé», un tilde a mano por cuenta (`tareaCuentaProbada` = `contacto.probada.<miembro>` en
  `client_onboarding_tasks`, sin migración, fuera de `PASOS`), y columna «Entró», con la fecha del
  primer login que trae `get_organization` del puente (`first_sign_in_at`/`last_sign_in_at`, ver
  `PUENTE.md`; hace falta deployar `roadmap-bridge` en el producto). Ojo: probar una cuenta es entrar
  con ella, así que cuenta como su primer login. No está en `PASOS`: no cuenta para el avance ni para «Marcar completo».
- **El Excel de usuarios se reemplaza por una página pública** (27/10/2026, por pedido; mock en
  `docs/onboarding/alta-publica.html`, migración `20261027133921_onboarding_alta_publica`, que **la
  aplica Antonio**). La página va en **propelia-frontend** (`crm.propelia.es/alta/<token>`) y los
  datos acá, atados al lead por su `client_onboardings`: el cliente confirma nombre y web
  (`company_name`/`website`, no pisan `crm_clients`) y carga a su equipo en
  `client_onboarding_members`, con **un** responsable que es Administrador. Sin sesión: la llave es
  `client_onboardings.public_token` y la puerta, la edge function `onboarding-alta`
  (`verify_jwt = false`), que corre `onboarding_alta_leer` / `onboarding_alta_enviar` con el
  service_role (nadie más puede). Enviar cierra el enlace (`submitted_at`) y tilda
  `contacto.excel-recibido`; **no crea cuentas**: «Importar» sigue en `/clientes`, que lo lee
  de la base (`ImportarUsuariosPanel`) y se habilita con `submitted_at`. El WhatsApp
  `contacto_inicial` lleva `{link}` = `linkDeAlta(public_token)` (migración
  `20261027134956_onboarding_mensaje_con_link_de_alta`) y la tarea, un botón que copia el enlace.
  «Recibir el equipo» dice cuándo lo envió y, mientras no se importó, lo reabre (`reabrirAlta`: borra
  `submitted_at` y destilda). Los `task_id` siguen siendo los del Excel (`excel-recibido`) para no
  destildar nada. **La web que cargó el cliente va con la org** (28/10/2026, por pedido):
  «Importar» la muestra editable al lado del nombre (`normalizarWeb`, `lib/equipo.ts`, la regla de
  Ajustes › Marca) y `create_org_with_users` la guarda en `organization_settings.website` del
  producto; si eso falla, la org se crea igual y el toast lo avisa. La página es `src/pages/alta/` de propelia-frontend. **Al enviarla avisa**
  (trigger `client_onboardings_alta_recibida`, migración `20261027144517_onboarding_alta_recibida_tarea`):
  una tarea del CRM en el lead, «Revisar e importar el equipo de …», para quien tomó el alta (o, si
  nadie, el responsable del lead), con hora dentro de 5 minutos para que suene ya la alarma. No la
  crea si la etapa no deja agendar tareas ni si ya hay una igual pendiente.
  **«Quiero editar»** (en la pantalla final de la página): el cliente reabre lo enviado él solo por
  `onboarding_alta_reabrir` (acción `reabrir` de `onboarding-alta`, migración
  `20261027150225_onboarding_alta_reabrir`), igual que «Reabrir» de /clientes, salvo que el lead ya
  tenga org en Propelia: ahí contesta `alta_ya_importada` y la página avisa que ya se crearon las cuentas.
- **Comentarios del lead al costado del alta** (28/10/2026, por pedido): una tercera columna del
  dialog (`ComentariosDelLead`; en pantallas angostas, abajo) lista las notas a mano del lead y deja
  escribir una (Enter comenta, Shift+Enter otra línea). Es una nota `MANUAL` sin meta en
  `crm_comments`, la misma de la actividad del CRM: ahí se ve, se edita y se borra. Sin migración.
- **Todo lo del producto va por el puente de verdad** desde el 27/10/2026 (`PUENTE_SIMULADO = false`
  en `service/puente.ts`): `create_org_with_users` (paso 1) se sumó a `propelia-bridge` y a
  `roadmap-bridge`, contrato en `docs/onboarding/PUENTE.md`. En true responde con los ejemplos de
  ese archivo sin salir del navegador (no crea nada y los mails de accesos no salen). El lead de
  prueba del paso 3 solo anda contra la org `propelia-demo` (`not_demo_org` en las demás), y el
  link de pago pide un superadmin de Propelia con tu mismo email.

## El CRM (y Equipo) — `/crm` y `/equipo`

Desde el 30/9/2026 (rama `crm-pantalla`). Diseño en
`docs/superpowers/specs/2026-09-30-crm-pantalla-design.md`; plan en
`docs/superpowers/plans/2026-09-30-crm-pantalla.md`.

- **Permisos por cartera, en la base.** Cada lead es de una cartera (`assigned_to`); ver o editar
  la de otro es una fila de `crm_data_access` (`read`/`write`, plana, no transitiva). Todas las
  policies de las `crm_*` llaman a `crm_puede(owner, nivel)` / `crm_puede_lead(lead, nivel)` /
  `crm_puede_cliente(cliente, nivel)`, que exigen `es_usuario()`. Un `SUPERADMIN` ve y edita todo y
  es el único que toca el catálogo (etapas y canales) y `crm_data_access`. **Esto
  cambió lo del 29/9** («cualquiera ve y edita todo el CRM»; «`rol` no restringe nada»).
- **`src/pages/crm/lib/permisos.ts` es el espejo en pantalla de `crm_puede()`**, no la seguridad:
  sirve para no ofrecer un botón que la base va a rechazar. Si cambia la regla en `schema.sql`,
  cambia ahí (misma relación que `accesoDe()` con `es_usuario()`).
- **Las pruebas de la RLS** están en `supabase/tests/crm-permisos.sql`: se corren enteras con el
  MCP `execute_sql`, crean sus usuarios adentro de una transacción y terminan en `rollback`. Tienen
  que devolver `crm-permisos: OK`.
- **El alta es una RPC** (`crm_create_lead_with_client`, `security definer`): reutiliza el cliente
  por teléfono/email aunque sea de otra cartera, y crea la tarea «Asesorar cliente» del
  responsable con vencimiento `p_initial_task_due_date` (el «hoy» local de quien carga), como el
  producto. Se sacó el 10/10/2026 y volvió el 12/10 antes de aplicarse. Sus errores son claves (`crm_…`) que traduce
  `src/pages/crm/lib/errores.ts`.
- **La lista se trae entera** (la RLS ya recortó) y filtros, pestañas y contadores salen de
  funciones puras en `lib/`. Todo filtro vive en la URL (`leadFilterParams.ts`): los enlaces se
  arman con `enlaceAlCrm()`, nunca a mano. `?owners=` son las carteras mirando y `?lead=` el lead
  abierto en el dialog. El front nunca escribe `gestion_*` ni los historiales.
  Si el lead abierto se va de la lista (se descartó), las flechas ↑/↓ siguen desde donde estaba
  (`vecinosEnRecorrido`, `lib/recorrido.ts`, 17/10/2026): antes se apagaban.
- **La lista no se mueve debajo de quien la trabaja** (23/10/2026, por pedido): un lead que deja de
  coincidir con los filtros porque se lo tocó (descartado, otra etapa u otro responsable, una tarea
  que lo saca de «Pendiente agendar tarea») se queda, con sus datos nuevos y donde lo pone el orden,
  hasta que se cambian los filtros o se recarga. `fijarLista` (`lib/listaFija.ts`) guarda en un ref
  los ids vistos por clave de filtros (`claveDeFiltros`: toda la URL menos `?lead=`, así abrir y
  pasar de lead no la cambia; cambiar orden o vista sí). Lo nuevo que coincide aparece; lo que ya no
  devuelve la base se va. Los contadores de los chips siguen saliendo de los datos reales; el «N
  leads» de la tabla y el total del dialog cuentan lo que se ve. En columnas con «Estado» filtrado,
  el que pasa a una etapa no elegida se va igual: no hay columna donde dibujarlo.
- **Sin prioridades ni gestión en el front desde el 10/10/2026** (se sacaron para rediseñarlas de
  cero): ni el color de prioridad de la etapa, ni el catálogo `crm_priorities`, ni las columnas de
  prioridad y tiempo de gestión del funnel, ni Pendiente/Gestionado/Pospuesto, ni «Posponer», ni
  «Gestiones vencidas» en Equipo. Los `?gestion=` y `?excluded=` de un enlace viejo se ignoran. **La
  base no se tocó**: `crm_priorities`, `crm_funnel_stages.priority_id`/`management_tolerance_hours`,
  `crm_leads.gestion_*`, `crm_management_events` y `crm_gestion_refresh()` siguen ahí. La Actividad
  del lead sigue pintando los eventos de gestión viejos (`lib/actividad.ts`).
- **Si un contacto es decisor vive en el contacto** (12/10/2026): `contact_is_decision_maker` y
  `alternative_phone_{1,2}_is_decision_maker` en `crm_clients` (null = no se sabe), con su Sí/No al
  lado del rol en el perfil. La llamada pregunta «¿Es decisor?» solo mientras el perfil no lo sepa
  (`decisorSabido`); contestar «Sí» con **un solo** contacto elegido lo marca (`campoDelNuevoDecisor`).
  «No» no se guarda solo, y con varios elegidos no se sabe cuál decide. Reglas en `lib/clientData.ts`.
  **El decisor también se apunta** (17/10/2026, por pedido): debajo del texto del registro (salvo en el
  contacto fallido) hay un campo opcional «Decisor» para el nombre que dio el doorkeeper. Al registrar
  queda en el perfil marcado como decisor (`conDecisorApuntado`: si ya es contacto lo marca, si no lo
  carga en el primer casillero libre) y no se fija como contactado. El campo desaparece en cuanto el
  perfil tiene a alguien marcado como decisor (`tieneDecisor`).
- **La llamada con el decisor lo fija en el perfil** (17/10/2026): reemplazó al cartel «Decisor
  contactado» (16/10). El contacto queda marcado como decisor (y se crea si se escribió a mano) y
  se fija (`decisoresDeLaLlamada()`, `lib/clientData.ts`; el fijado es de cada navegador). Con varios
  elegidos solo se fijan los que el perfil ya da por decisores. **Desde el 20/10/2026 todo contacto
  que pasa a decisor se fija solo**, por el camino que sea (el Sí del perfil, uno cargado nuevo o
  una actividad): `decisoresQueSeMarcaron()` compara la foto anterior de `lead.client` con la nueva.
  Solo el paso a «sí»: el que ya era decisor al abrir no se refija, así desfijarlo a mano dura. La etiqueta «Contactado» del
  contacto sigue saliendo de `decisorContactado()` (`lib/actividad.ts`). El 16/10/2026 salió del perfil el bloque del motivo de descarte
  (`discard_reason`/`recontact_at` siguen en la base y en el `DescartarLeadDialog`), y también la
  cruz de «cerrar sin guardar» del encabezado: la salida es «Guardar y cerrar».
- **El teléfono de Google Maps es «Teléfono oficina»** (16/10/2026): el contacto cuyo número
  coincide en dígitos con `google_maps_phone` y no tiene nombre se rotula así, sin rol ni decisor
  (`esTelefonoDeOficina`), y no cuenta como persona en «con quién» (`contactosConDecisor`). Con un
  nombre escrito vuelve a ser alguien.
- **La llamada pregunta a qué teléfono y con quién, por separado** (16/10/2026): no siempre
  coinciden. «Teléfono contacto» (fue «Llamaste a»; desde el 17/10/2026 va debajo de «Hablaste
  con») sale de `telefonosDelCliente()` (cada contacto, la oficina y el de Google si no está en
  ninguno) y lo piden la llamada y el contacto fallido, vacío y obligatorio **siempre**, aunque el
  perfil no tenga teléfonos (se escribe con el «+»). Lo escrito a mano —número o persona— es una
  pastilla que se elige como las demás y se saca con su ✕: llevaba un «+» y tocarla la borraba,
  y se la apretaba creyendo que agregaba. Se guarda en la meta como `telefono: {numero, etiqueta}`; las viejas no lo traen.
  Desde el 17/10/2026 el número también se escribe a mano (uno, haya o no cargados) y al registrar
  se carga en el perfil: en el contacto con quien se habló si no tiene número, si no en el primer
  casillero libre (`casilleroDelTelefonoNuevo`). Sin lugar, queda solo en la actividad.
  Desde el 17/10/2026 las dos filas ofrecen **primero** el último número marcado y la última gente
  con quien se habló (`ultimoContacto`, `primeroLosUltimos` en `lib/actividad.ts`): solo ordenan,
  no eligen — siguen arrancando vacías. Y cada contacto fallido dice qué intento seguido es
  («Contacto fallido 2/10», `intento` en `lineaDeTiempo`, `INTENTOS_DE_CONTACTO`): la racha la
  corta solo una llamada contestada, y pasado el diez sigue contando («11/10»), no frena nada.
- **Doble clic en una persona del registro abre su ficha** (20/10/2026, por pedido): en las
  pastillas de «Hablaste con» / «Quién asiste», para cargarle teléfono o email sin salir de la
  actividad. Es la misma ventanita del lápiz del perfil (`onAbrirContacto` → `setContactoEnEditor`).
  Sin control nuevo a la vista: solo el `title`. Los dos clics prenden y apagan la pastilla.
- **Con quién también se escribe a mano** (16/10/2026): si no está entre los contactos, se tipea
  en el renglón de «Hablaste con» y al registrar se carga solo en el perfil, sin teléfono: el
  principal si está vacío del todo, si no el primer alternativo libre (`patchDeContactosNuevos`).
  Si es el único elegido y decide, entra como decisor. Sin casillero libre queda solo en la
  actividad, con aviso. Ese mismo día la pastilla «Tarea» salió del registro de actividad (por
  pedido): las tareas se crean desde su lista del perfil.
- **Registrar una actividad obliga a elegir la etapa** (12/10/2026): «El lead queda en» arranca
  **vacío** y registrar sin elegir lo marca en rojo y no registra, para que avanzar al lead no
  dependa de acordarse. Hubo unas horas una etapa sugerida precargada (`etapaSugerida()`) y se sacó
  por pedido: precargada, se confirmaba sin leerla. El contacto fallido no pide ni mueve nada.
  La etapa se escribe recién con la actividad guardada. Reemplazó al toast «¿Pasar a …?».
  El formulario es la misma ventana flotante y no modal que «Nueva tarea» (`VentanaFlotante`):
  mientras se registra se puede usar el resto de la pantalla.
- **Guía de la llamada y datos de la demo** (16/10/2026; la demo se mudó a la Agenda el 22/10/2026,
  ver la sección de Google Calendar, y lo de abajo sobre la demo es historia): «Llamada» y «Agendar demo» muestran una
  guía (qué no olvidarse) colgada del borde izquierdo de la ventana: plegada es una pestaña que
  asoma y abierta sale de la ventana como panel al costado (`lateral` de `VentanaFlotante`). Nace
  plegada cada vez. Es texto fijo de `lib/guiaDeLlamada.ts` y no guarda nada. La demo pide el mail de la invitación (precargado con el de la
  inmobiliaria), quién asiste (las mismas pastillas de contacto) y notas opcionales. Como
  `crm_meetings` no tiene columnas para eso, van a `description` (`descripcionDeDemo()`,
  `lib/reuniones.ts`): **sin migración, a propósito**. El título queda siempre «Demo». Si la
  inmobiliaria no tenía email, se le guarda el escrito; si falla, la demo queda igual.
- **Playbook en la cabecera** (16/10/2026): botón «Playbook» (`PlaybookDialog`) para todos. Los dos
  PDF de fábrica viven en `public/playbook/` y van con el deploy (**URL pública**, sin login); los
  que se suben van al bucket `roadmap-adjuntos` bajo `playbook/`, firmados al listar. Sin
  migración: el bucket y su RLS ya estaban. Subir, cualquiera; borrar, solo SUPERADMIN (solo el front).
- **Lo registrado a mano se puede borrar** (12/10/2026): nota, llamada y contacto fallido llevan
  un tacho al pasar el mouse. Es soft delete de `crm_comments` (la RLS ya deja: write sobre el
  lead), sin confirmar y con «Deshacer» en el aviso. Lo del sistema (etapa, responsable, tareas,
  demos) no se borra desde la actividad. Borrar no deshace la etapa elegida al registrar.
- **Una tarea puede tener hora y suena 5 minutos antes** (17/10/2026, por pedido): `crm_tasks.due_time`
  (`time` sin zona; null = todo el día; **desde el 17/10/2026 es hora de España**, `Europe/Madrid`:
  se elige en un desplegable de 15 en 15 de 07:00 a 23:00 que muestra al lado la hora de Venezuela,
  o se escribe a mano al lado (la escrita entra al desplegable, `opcionesConLaEscrita`), y la alarma convierte esa hora a la zona de cada navegador — `opcionesDeHora`, `horaEnVenezuela`
  y `momentoDeLaTarea` en `lib/alarmas.ts`), migración
  `20261017130259_crm_tasks_due_time`. Se elige en «Nueva tarea», opcional, y se ve al lado del día
  («Hoy 10:30», `rotuloConHora`). La alarma es `useAlarmasDeTareas`, montada en `AppLayout` para
  quien puede entrar a `/crm`: mira el reloj cada 20 s y avisa con `Notification` (si hay permiso;
  se pide al guardar una tarea con hora) y siempre con un toast que abre el lead. Solo las tuyas
  (`assigned_to`). **Suena solo con la app abierta en alguna pestaña**, aunque esté de fondo: sin
  push, sin service worker y sin cron, a propósito. Lo que ya sonó se guarda por navegador
  (`crm-alarmas-avisadas`, con día y hora en la clave: reagendar vuelve a armarla) y pasada una
  hora de la tarea ya no suena (`MINUTOS_DE_VIGENCIA`): abrir el CRM a la tarde no dispara las de
  la mañana. Las reglas son puras, en `lib/alarmas.ts`. Sin la migración corrida, la tarea sin hora
  se crea igual (no manda la columna) y la que tiene hora contesta `FALTA_MIGRACION`.
- **Los descartados se ven eligiendo «Descartado» en el filtro «Estado»** (16/10/2026): por
  defecto no aparecen. Reemplazó al chip «Incluir descartados»; un `?includeDiscarded=` viejo se
  ignora. La búsqueda, «Para recontactar» y los objetivos los siguen trayendo solos.
- **«Pendiente agendar tarea»** (20/10/2026, por pedido): chip siempre visible, `?agendar=1`.
  Deja los leads en una etapa de «Seguimiento» (`management_type = 'por_tarea'`) sin ninguna tarea
  pendiente (`esPendienteAgendar`, `lib/leadFilters.ts`). Con alguno, el chip va en rojo sutil.
  Al lado, **«Tareas vencidas»** (23/10/2026, por pedido): chip siempre visible, `?hoy=1`. Deja los
  leads con alguna tarea pendiente **para hoy o vencida** (`idsConTareasParaHoy`, `lib/tareas.ts`;
  la de hoy entra, al revés que `estaVencida`), sin descartados. Mismo rojo sutil con alguno. No
  confundir con el subchip «Vencidas» de «Tareas» (`?overdue=1`), que no cuenta las de hoy.
- **«¿Se puede agendar tarea?» por etapa** (23/10/2026, por pedido, migración
  `20261023160156_crm_funnel_stages_allows_tasks`): columna «Tareas» (Sí/No) de la configuración del
  funnel, `crm_funnel_stages.allows_tasks` (default true). Con No, a un lead en esa etapa no se le
  crea ninguna tarea; las que ya tiene se siguen editando, tildando y borrando. **La regla es el
  trigger `crm_tasks_etapa_permite`** (before insert, clave `crm_etapa_sin_tareas`);
  `permiteAgendarTarea` (`lib/gestionDeEtapa.ts`) es el espejo: el perfil esconde «Añadir tarea» y
  dice por qué. El alta (`crm_create_lead_with_client`) saltea la tarea inicial «Asesorar cliente»
  en esas etapas, y «Pendiente agendar tarea» no las cuenta.
- **«¿Se ve en el Dashboard?» por etapa** (23/10/2026, por pedido, migración
  `20261023164216_crm_funnel_stages_show_in_dashboard`, que **la aplica Antonio**): columna
  «Dashboard» (Sí/No) de la configuración del funnel, `crm_funnel_stages.show_in_dashboard`
  (default **false**: no aparece ninguna hasta elegirla). **Los leads de esas etapas SON los
  «Leads importantes» del Dashboard** (por pedido, el mismo día: hubo unas horas una caja aparte «Por
  etapa» y se juntó): `leadsImportantes` (`lib/resumen.ts`) trae los de estrella **o** de etapa
  marcada, en una sola lista y con el mismo orden. Una etapa borrada no cuenta aunque esté marcada.
  Solo de pantalla, sin trigger. Sin la migración, `show_in_dashboard` llega undefined (va opcional en
  `CrmStage`), no se ve ninguna y marcar contesta `FALTA_MIGRACION`.
- **Una tarea pendiente se edita** (20/10/2026, por pedido): el lápiz de la fila (con permiso de
  escritura) abre la misma ventana de «Nueva tarea», titulada «Editar tarea» y precargada con
  título, día y hora. Se manda solo lo que cambió (`cambiosDeTarea`, `lib/tareas.ts`): `due_time`
  va solo si cambió (sacarle la hora la manda en null, que si la tenía la columna existe) y sin día
  la hora se cae, como al crearla.
- **El texto de una actividad escrita a mano se edita** (20/10/2026, por pedido): nota, llamada y
  contacto fallido llevan un lápiz al lado del tacho, que abre la ventana flotante «Editar
  actividad». **Solo el texto** (`actualizarComentario`): la meta —con quién, teléfono, resultado— y
  la etapa no se tocan. Vaciada, la llamada vuelve a su texto de fábrica y la nota no se guarda
  (`textoEditado`, `lib/actividad.ts`). **No queda marca de «editado»**: `crm_comments` no tiene
  `updated_at` y no se migra por esto.
- **El último lead en el que se entró se resalta apenas en la lista** (20/10/2026, por pedido):
  fondo `bg-primary/5` y el riel de la izquierda en la marca, en la tabla y en las tarjetas del
  teléfono (no en columnas). Lo anota `CrmLeadList` al cambiar el `?lead=`, venga de donde venga, y
  es **por navegador** (`localStorage`, clave `crm-ultimo-lead`, con try/catch): es «por dónde iba
  yo», no un dato del equipo.
- **Página «Demos» y aviso de demo nueva** (20/10/2026, por pedido): `/demos`, solo SUPERADMIN
  (`NAV` y gate `esSuperadmin` adentro, como Ajustes). Una tabla con todas las `crm_meetings`
  (próximas / pasadas, `agruparReuniones`); invitación, asistentes y notas salen de
  `datosDeLaDemo()` (`lib/reuniones.ts`): del registro de actividad de la demo desde el 22/10/2026,
  y de `description` (`leerDescripcionDeDemo()`) en las de antes. **Sin migración**: un SUPERADMIN ya lee todas
  por `crm_puede` y la tabla ya estaba en realtime. El aviso es `useAvisosDeDemos` en `AppLayout`
  (toast con «Abrir lead» + notificación del navegador si hay permiso, que se pide desde la página):
  a todo SUPERADMIN salvo a quien la agendó. La marca es por navegador (`crm-demos-avisadas-hasta`,
  el `created_at` más nuevo ya mirado; `demosParaAvisar`, `pages/demos/lib/demos.ts`): la primera
  vez no avisa nada, y lo agendado con la app cerrada avisa al abrirla. Sin push, como las alarmas.
- **«Objetivos semanales»** (17/10/2026; fue «Objetivos hoy»): el contador de la cabecera y su filtro
  `?objetivo=` cuentan desde el lunes (`startOfWeekIso`) y vuelven a cero al terminar el domingo.
  El diálogo sigue mostrando hoy, semana y mes. «No respondidas» es la primera columna.
- **Las etapas que había el 27/10/2026 están fijas** (por pedido, migración
  `20261027131725_crm_funnel_stages_bloqueadas`, que **la aplica Antonio**): `allow_rename`,
  `allow_reorder` y `allow_delete` en false, así la configuración del funnel las muestra con candado.
  Gestión, Tareas, Dashboard y Onboarding se siguen eligiendo, y una etapa nueva nace editable.
  Sin trigger: es el front el que respeta las banderas.
- **El catálogo se borra con soft delete**: un lead en una etapa borrada la sigue leyendo por
  nombre (`catalogoDeEtapas` trae también las borradas); los menús ofrecen solo las vivas.
  Las vivas van por `position`, salvo Descartado, que va siempre última (`etapasVivas`, 17/10/2026):
  las etapas creadas después le quedaban debajo en los menús y en el filtro «Estado».
- **Lo que trae la importación desde Excel vive en `crm_clients`** (6/10/2026): `import_batch`
  (el lote, ej. `BCN-S01`), `batch_activated_on` («Activada para el SDR»), `selection_reason`
  (`inmovilla`/`new`/`small`: con qué ángulo abre la llamada el SDR), el origen de cada teléfono
  (`phone_source`, `alternative_phone_{1,2}_source`: `agency_web`/`legal_notice`/`google_maps`/
  `company_registry`), `google_maps_phone` e `idealista_phone`. Los valores de los `check` están
  repetidos en `MOTIVOS_DE_SELECCION` y `ORIGENES_DE_TELEFONO` (`lib/inmobiliaria.ts`): si se
  agrega uno, va en los dos lados. Sin `unique` a propósito. Entraron a la base con el resto
  de los datos de la inmobiliaria en la migración `20261006123359_crm_clients_inmobiliaria`;
  `FALTA_MIGRACION` sigue en `errores.ts` para la próxima columna que llegue antes que su
  migración. Se ven en la pestaña de la inmobiliaria; el origen, al lado de cada teléfono.
  - **`idealista_phone` es último recurso**: es un redirector de Idealista y a la agencia le entra
    como un cliente interesado en un piso, no como una llamada comercial. **No es un contacto**
    (12/10/2026, por pedido): vive en «Datos de la inmobiliaria» con el aviso escrito (no en un
    tooltip), y el perfil ya no lo copia a un alternativo como hace con el de Google Maps. Los que
    se copiaron antes se quitan solos al abrir el lead (16/10/2026, `copiasDelTelefonoDeIdealista`),
    salvo que ese contacto ya tenga rol, notas o decisor cargado: ahí es alguien y se deja. **Nunca es el número por defecto**. Hoy
    ninguna pantalla elige un «teléfono principal» con respaldo (la lista muestra `phone` y nada
    más); si alguna vez lo hace, va en una función pura de `lib/` con tests y el de Idealista entra
    solo si `phone`, los alternativos y `google_maps_phone` están vacíos.
- **Importar un lote del Excel** (7/10/2026): botón «Importar lote» de la cabecera, solo
  SUPERADMIN. Formato BCN-S01, columnas por nombre; si el archivo tiene un error, no entra nada.
  La RPC `crm_importar_lote` corre primero en simulacro (hace todo y lo deshace) para el preview.
  Diseño y reglas en `docs/superpowers/specs/2026-10-07-crm-importar-lote-design.md`.
  - **Una inmobiliaria no se repite**: una ficha de Idealista es un cliente (único por
    `crm_url_clave(idealista_url)`) y un cliente tiene **un** lead, sea de quien sea
    (`crm_leads (client_id)` único; antes era uno por comercial). Vale también para el alta a mano.
  - Repetida = misma ficha: no se crea nada; si trae contactos nuevos, se agregan al final de
    `sdr_advice` («NUEVOS CONTACTOS»). Ficha nueva que comparte teléfono, email o nombre: se crea
    con «POSIBLE REPETIDA» arriba del consejo. Sin historial: el SDR edita esos bloques.
  - `sdr_research` va a `sdr_advice`; `phone` y los alternativos no se cargan (ya están en el
    research); `current_crm` es una etiqueta de `crm_software` (`current_crm_id`).
- **Envío de emails** (16/10/2026, copiado de `send-email` de `propelia-frontend`, ver su
  `docs/emailSystem.md`): Resend, con la API key como secret `RESEND_API_KEY` de las edge
  functions. `supabase/functions/_shared/email.ts` es el único código que habla con Resend y el
  remitente es **siempre `info@propelia.es`**, fijo en el servidor (nunca lo elige quien llama).
  La edge function `send-email` es la puerta desde el front y exige SUPERADMIN activo (en el
  producto alcanzaba con sesión). Hoy la usa solo «Email de prueba» de la cabecera del CRM
  (`TestEmailDialog`). Los envíos automáticos del CRM van a llamar a `_shared/email.ts`
  desde el servidor, no a `send-email`. Tests: `deno test` en `_shared/` y `send-email/`.
  **Plantillas HTML** (18/10/2026): la pestaña Email de «Mensajes» del lead (`EmailConPlantilla`)
  manda «Presentación con vídeo» y «Mail puntual», con el texto precargado y editable para ese
  envío (no se guarda). Viven en `supabase/functions/_shared/plantillasEmail.ts`, **un solo archivo
  para las dos puntas**: el front lo importa para la vista previa y `send-email` para armar el HTML.
  El front manda solo `{plantilla, campos}` (texto, todo escapado) y por eso la puede usar cualquier
  usuario activo, SDR incluido; el texto libre sigue siendo de SUPERADMIN. **La firma y los datos de
  contacto son de quien manda** (`remitenteDe`): el servidor los lee de la base, nunca del front.
  Sale siempre desde `info@propelia.es`; **desde el 19/10/2026** el email que se muestra (firma,
  pie, «Darse de baja») y el `reply_to` son `users.email` **solo si es de @propelia.es** — si no
  (los gmail de Lorenzo y Antonio) van `info@propelia.es` y sin `reply_to`. `firma_email` ya no se
  lee. El teléfono es `users.phone` y, si falta, `firma_telefono`. Nombre y cargo siguen saliendo
  de `firma_nombre` (o `nombre`) y `firma_cargo` (migración `20261018203253_users_firma_de_email`),
  que se cargan por SQL. Las imágenes (`mail-header.png`,
  `mail-video.png`, `lockup_h.png`; versión blanca desde el 18/10/2026) del mail que sale están en `propelia-landing/assets/` →
  `propelia.es/assets/`; la vista previa usa las copias de `public/email/`.
  `URL_VIDEO` es `crm.propelia.es/presentacion`, una página pública de `propelia-frontend` que
  reproduce el mp4 del bucket **público** `publico` de este proyecto (migración
  `20261018210226_bucket_publico`). **Desde el 20/10/2026 el vídeo se reemplaza desde `/ajustes`**
  (pestaña «Vídeo presentación por mail», página entera solo SUPERADMIN: `NAV` y gate
  `esSuperadmin` adentro). Reemplazar es **pisar `videos/propelia-presentacion-v8.mp4`** (upsert,
  caché de 60 s), el nombre que la página de propelia-frontend tiene escrito: así no se toca
  aquel repo. El anterior no se guarda. Escriben la service role y un SUPERADMIN, solo bajo
  `videos/` (migración `20261020171103_video_presentacion_superadmin`, policies `publico_videos_*`).
  El botón de los dos mails («Contáctame» en el puntual, «Reservar 20 minutos» en el del vídeo,
  que pide una demo) arranca con el WhatsApp de quien manda y un mensaje en la voz del lead
  (`mensajeDeWhatsapp`: «¡Hola Propelia! Soy Ana, de …»); se rearma con «Nombre» mientras no se
  edite a mano (`whatsappDe`, `predeterminadosPara`). Sin teléfono es un `mailto:` a su email.
  El botón acepta `http(s)://` o `mailto:`. **Desde el 23/10/2026, después de mandar** (el email ya
  aceptado por Resend, o el WhatsApp recién abierto) un `AsentarEnvioDialog` modal pregunta
  «¿Registrar la actividad?»; «Registrar» deja una nota a mano sin meta (`textoDelEnvio`,
  `lib/envioDeMensaje.ts`), que se edita y se borra como cualquier nota. «No» no deja nada.
  **El «Mail puntual» lleva adjuntos** (20/10/2026, por pedido): `adjuntos: true` en su plantilla;
  `send-email` rechaza archivos en la que no lo diga. Cualquier usuario activo, SDR incluido; mismo
  tope de 10MB que el texto libre. Valen para ese envío y no salen en la vista previa.
  **El último enviado es la plantilla** (21/10/2026, por pedido, migración
  `20261021121051_crm_email_plantillas`): al mandar, `send-email` guarda el texto en
  `crm_email_plantillas` (una fila por plantilla, **del equipo**, escribe solo la service role) y el
  diálogo arranca desde ahí; «Restablecer» vuelve a eso. No se guardan el nombre del lead ni el
  botón armado solo (WhatsApp/`mailto:`); un enlace escrito a mano sí (`plantillaGuardable`,
  `conGuardada`). El texto de fábrica de `plantillasEmail.ts` queda solo para la primera vez o
  sin la migración corrida.
- **El WhatsApp de «Mensajes»** (23/10/2026, por pedido): es un enlace con el texto escrito, **nunca un
  archivo** (el vídeo nativo pediría la API de WhatsApp Business). En el ordenador abre
  `web.whatsapp.com/send` directo y en el móvil `wa.me` (`enlaceDeWhatsapp(…, { web })`, `esMovil`):
  la redirección de `wa.me` rompía los emojis. Variables `{nombre}`, `{empresa}`, `{remitente}` (el nombre
  de `remitenteDe`, el de la firma del mail) y `{video}`, que apunta a **`public/video.html`** (`/video`,
  rewrite en `vercel.json` antes del de la SPA) con el dominio donde está abierto el CRM: una página
  estática con las etiquetas Open Graph de las que WhatsApp arma la miniatura (la imagen es
  `propelia.es/assets/mail-video.png`) y que reproduce el mismo mp4 del bucket `publico`.
  `crm.propelia.es/presentacion` (la del mail) es una SPA sin esas etiquetas y no da vista previa.
- **Los emails que no llegan se avisan** (20/10/2026, migración `20261020171333_crm_emails`):
  `send-email` escribe cada envío en `crm_emails` con el id de Resend (y el lead, si quien manda lo
  lee; el de prueba va sin lead), y la edge function `resend-webhook` le cambia el estado cuando
  Resend avisa (`delivered`, `bounced`, `failed`, `suppressed`, `complained`…). La puerta del
  webhook es la firma svix (secret `RESEND_WEBHOOK_SECRET`, `verify_jwt = false` en `config.toml`)
  y el estado solo avanza (`crm_email_evento()`): los eventos llegan desordenados. Escribe solo la
  service role. **En el pie del mail**, al lado de «Enviar email», una pastilla dice «Enviando…» y
  después lo que va contando Resend (`estadoDelEnvio`; pregunta cada 4 s hasta entregado o no
  llegó, además del realtime). Lo que no llegó se avisa en tres lados: un **toast** con «Abrir
  lead» (y notificación del navegador si ya hay permiso), una vez por navegador y esté donde esté
  (`useAvisosDeEmails`, montado en `AppLayout` como las alarmas; fuera del CRM pregunta cada 30 s);
  la **campana** de la cabecera del CRM (`CampanaDeEmails`, siempre a la vista, número rojo con lo
  tuyo sin ver; tocar uno abre el lead y lo marca visto con `crm_email_visto`), y el **cartel del
  lead** debajo de «Mensajes» (todos, plegado de entrada, y si la dirección sigue en el perfil lo
  dice). Cada línea del cartel lleva **«Listo»** (con «Deshacer»): es el mismo `seen_at`, así que
  marcarlo apaga también la campana de quien lo mandó; la línea queda gris y con todas en gris el
  cartel deja de ser rojo. Lo marca quien lo mandó o quien escribe el lead (`crm_email_visto(id,
  visto)`, migración `20261020174926_crm_emails_listo`, que agregó `seen_by`).
  Reglas en `lib/emails.ts`. Ojo: después de un rebote duro
  Resend suprime la dirección y no le vuelve a mandar («No se envió») hasta sacarla a mano de su
  lista de supresión.
- **«Ver como»** (23/10/2026, por pedido): botón de la cabecera del CRM (`VerComoButton`,
  `components/VerComo.tsx`) que abre en **otra ventana** `/crm?como=<id>` (`COMO_PARAM`,
  `enlaceAlCrm({ como })`). Lista a los activos cuya cartera ves, sin vos (`puedeVerComo`,
  `lib/permisos.ts`; «solo ver» si es read). **Es solo del front y no es un login**: la sesión es
  la misma (el `localStorage` de Supabase lo comparten todas las pestañas, así que un login de
  verdad pisaría la tuya), lo que se escribe sale con tu `created_by` y la RLS recorta con **tus**
  permisos —hacerse pasar por otro de verdad sería un agujero—. `useVerComo` da `perspectivaId`,
  el «yo» de pantalla: la cartera de entrada (`useVisibleAgents`), el responsable por defecto de
  «Nuevo lead» (si podés escribirle), los objetivos semanales, el «es mío» de la lista y la
  campana de emails. `puedeEscribir`, `visibles` y `conEscritura` siguen siendo los tuyos, y lo
  montado en `AppLayout` (alarmas, toasts de emails y demos) también. Un `?como=` que no vale
  (vos, desconocido, inactivo o alguien que no ves: `comoValido`) se ignora. Arriba va el cartel
  `CartelVerComo` («Viendo el CRM como …», Podés editar / Solo lectura, «Cerrar» = `window.close()`
  y si no se puede, `/crm`) y la pestaña se titula «Como … ·». El selector de carteras se esconde.
  Todo lo que escribe la URL adentro del CRM parte de la actual, así que el `?como=` se queda.
- **Leads importantes y el resumen de `/crm`** (23/10/2026, por pedido): la lista lleva una columna
  con una estrella (`EstrellaImportante`, después del riel; en el teléfono, al lado del `⋯`) que marca
  `crm_leads.importante`. **Solo SUPERADMIN la ve y la toca** (`puedeMarcarImportante`,
  `lib/permisos.ts`): un SDR no ve ni la columna. En la base lo corta el trigger
  `crm_leads_importante_solo_superadmin` (la RLS deja escribir a cualquiera con write sobre la cartera),
  con su caso 10 en `crm-permisos.sql`. La marca es **del equipo**: lo que marca uno lo ven todos los
  SUPERADMIN. Migración `20261023135323_crm_leads_importante`, que **la aplica Antonio**; sin ella la
  lista anda (lee `*`, `importante` es opcional en `CrmLead`) y marcar contesta `FALTA_MIGRACION`.
  **Un SUPERADMIN que entra a `/crm` pelado ve primero el «Dashboard»** (`ResumenCrm`; «resumen» en el código): los importantes de
  todas las carteras (vencidos arriba, descartados al final, `leadsImportantes`), **en columnas desde
  el 26/10/2026, por pedido**: Inmobiliaria, Decisor (`nombresDeDecisores`: los contactos marcados
  como decisores), Estado y Tarea agendada («No hay tarea» si no tiene ninguna pendiente). Sin
  responsable a la vista. **Va en rojo** (fondo y riel) el que no tiene tarea y el que tiene la
  próxima para hoy o vencida (`tocaHoyOVencida`, `lib/tareas.ts`, la misma regla de «Tareas
  vencidas»), salvo el descartado, que no se sigue. y la agenda de hoy y los 6 días siguientes por día (`reunionesPorDia`; «Mías» por
  defecto, «Todas» las del equipo). **La agenda suma todo tu Google Calendar** (23/10/2026, por
  pedido): `eventosDeGoogleSueltos` saca los eventos que ya son una reunión del CRM (por
  `external_event_id`) y pasa los de todo el día a la medianoche local. Es solo **tu** Google (la
  conexión es de cada uno), en «Mías» y en «Todas», y no se toca: se edita en Google o en la Agenda.
  **«Mías» también trae la reunión de otro que está en tu Google** (26/10/2026: una demo que agendó
  una compañera y te invitó), con `reunionesMias`: sin eso no salía en ningún lado, porque no era
  tuya por `assigned_to` y `eventosDeGoogleSueltos` la sacaba de tu Google por ser ya del CRM.
  **Lo que te invitaron y todavía no aceptaste se ve igual, con «Pendiente aceptar»** (26/10/2026,
  por pedido): `mapGoogleEventsToAgenda` (edge `calendar-sync`, acción `agenda`) marca `sinAceptar`
  cuando tu lugar en `attendees` (`self`, sin ser organizador) está en `needsAction`, e
  `invitacionesSinAceptar` (`lib/resumen.ts`) lo cruza con el evento suelto y con la reunión del CRM.
  Sin la edge function desplegada no llega la marca y no se ve el rótulo; el evento sí. Tocar un lead o una reunión abre el lead en el mismo dialog
  (`?lead=`), con las flechas recorriendo los importantes. **Sin contadores** (tareas vencidas,
  pendiente agendar, recontactar), por pedido: son los chips de la lista. La regla es
  `muestraResumen` (`lib/resumen.ts`): `?resumen=1|0` manda; sin él, resumen solo si la URL no trae
  lead, filtros, vista, `owners` ni `como`, así los enlaces de Equipo, las alarmas y «Ver como» llegan a
  la lista. Decidido, se escribe en la URL (`fijarResumenEnLaUrl`): abrir un lead desde el resumen o
  limpiar filtros no cambian de vista solos. Se alterna con **un solo botón en el mismo lugar de la
  cabecera**: «Ver lista de leads» en el Dashboard, «Dashboard» en la lista (solo SUPERADMIN, sin «Ver como»). Un SDR (y «Ver como») ve la lista como siempre, aunque ponga `?resumen=1`.
- **Un SUPERADMIN elimina un lead desde el menú `⋯`** (23/10/2026, por pedido): «Eliminar», directo y
  sin confirmar, con «Deshacer» en el aviso (`useEliminarLead`). Es soft delete (`deleted_at`) y se
  lleva sus tareas pendientes, para que no sigan sonando las alarmas (`eliminarLead`, `restaurarLead`
  en el servicio). **Sin migración**: la RLS ya deja escribir a un SUPERADMIN. Solo el front lo
  esconde a un SDR: la base le dejaría poner `deleted_at` en su cartera. Las reuniones no se tocan:
  una futura sigue en el Google del responsable.
- **La matriz de Visibilidad de `/equipo`** (23/10/2026): los SUPERADMIN no son filas (van en una
  línea «Ven y editan todo») pero sí columnas; todo por nombre (`matrizVisibilidad`,
  `pages/equipo/lib/`); la primera columna queda fija al scrollear; cada celda guarda sola, con
  cambio optimista sobre `CRM_KEYS.accesos` y vuelta atrás si falla.
- **Qué se copió del producto** (podado de lo inmobiliario):
  De `propelia-frontend/src/pages/leads/lib/`: `discardStage`,
  `leadFilters`, `leadFilterParams`, `computeLeadListCounters`, `reassignCollisions`. De
  `propelia-frontend/src/pages/leads/components/`: `leadCells`, `LeadRowActions`, `LeadTasksPanel`,
  `DockedActivityChat`, `ClientFields`, `ReassignLeadsDialog`, `AgentFilterButton`, `BulkActionBar`.
  Del funnel en `propelia-frontend/src/pages/clients/components/FunnelSection/FunnelEditor/`:
  `StagesTable`. De `propelia-frontend/src/pages/ajustes/components/`:
  `ChannelsPanel`. De `propelia-frontend/src/pages/equipo/components/`: `VisibilityMatrix`.
  **Nuevo**: `permisos.ts`, `effectiveStage.ts` (acá es resolver por id), `systemComment.ts`
  (el del producto es el parser de Idealista), el servicio, los hooks, `CrmLeadList`, `LeadDialog`,
  `MeetingsPanel`, `ActividadLead`, `NewLeadDialog` y `estadisticasPorCartera`.

**El tablero vanilla vive en `legacy/`** y todo lo que sigue en este archivo lo describe. Es
la **especificación del port** del Roadmap (sub-proyecto 3): las rutas de archivo que nombra
(`app.js`, `index.html`, `scripts/…`) ahora están adentro de `legacy/`. Se borra cuando el
port termine. Para verlo en local: `cd legacy && node ../.claude/static-server.mjs` desde el
checkout principal (el servidor sirve la carpeta en la que se lo corre).

## Arquitectura

SPA que se sirve estática. **Una sola página**: `index.html`. Fue tablero doble (Propelia
y Captalia, con un router al frente); se unificó en un único sistema con tres personas:
Lorenzo, Antonio y Luis.

- `index.html` — la app entera. Define `window.APP_CONFIG` (título, `tablas`, `bucket`,
  `canal`) y luego carga, en orden: `order-math.js`, `equipo.js`,
  `supabase-sync.js`, `app.js`. Todo el CSS vive en `app.css`.
- `toniylorete.html` / `captalia.html` — stubs que redirigen a `index.html`. Existen solo
  para que no se rompan enlaces y favoritos viejos. No tienen lógica.
- `supabase-sync.js` expone `RoadmapSync`. Sus `const` top-level son globales de script;
  no repetir nombres en `app.js` (usa `_CFG`, no `CFG`).

**Regla de oro: la lógica va en `app.js` y los estilos en `app.css`. Nunca en el HTML.**

### Identidad y acceso: la tabla `users`

**Desde el 29/9/2026 son una sola cosa.** Tener fila activa en `users` ES tener acceso
(`es_usuario()`, que usan todas las policies) y esa misma fila dice quién sos: nombre,
iniciales, color y si ponés plata en la caja. El front la lee al entrar
(`RoadmapSync.cargarUsuarios()` → `cargarEquipo()` → `PERSONAS` / `PERSONAS_CAJA`), y la
conversión de filas a personas es `personasDesdeUsuarios()`, en `equipo.js`, con su test en
`scripts/test-equipo.cjs`.

- **Hasta ese día eran dos**: el acceso salía de `app_miembros` (por email) y la identidad de
  `APP_CONFIG.personas`, escrita a mano en el HTML. Existía el caso «entraste pero el tablero
  no sabe quién sos». Ya no existe: sin fila no entrás.
- **Lo que se guarda en los datos es el uuid de la cuenta**: `pend`, `resp`, `chat[].autor`,
  los avisos y `cuenta`/`carga` de la caja. Hasta la mudanza eran `'Loro'`, `'Toni'`,
  `'Luis'`; los reescribió `migracion/04-reasignar-usuarios.sql`.
- **El front no escribe `users`**: no hay policies de escritura. **El alta** (6/10/2026) es el
  botón «Nuevo miembro» de `/equipo`, que llama a la edge function `crear-miembro`
  (`supabase/functions/crear-miembro/`, tests con `deno test` ahí adentro): un SUPERADMIN activo
  crea la cuenta de auth y su fila. Iniciales y color salen solos y **`caja` nace en false**, que
  entrar al reparto mueve los saldos de todos. No hay trigger sobre `auth.users`: si la fila falla,
  la función borra la cuenta. **La baja** (13/10/2026) es el ícono de cada fila de `/equipo`
  (`BajaMiembroDialog`), que llama a la RPC `crm_dar_de_baja_miembro`: solo SUPERADMIN, nunca a
  uno mismo. En una transacción pone `activo = false` y le pasa a un sucesor sus leads, sus tareas
  del CRM sin completar, sus reuniones futuras y su lugar en `pend`/`resp` (y en los pasos) de las
  tareas del roadmap sin terminar, y borra sus filas de `crm_data_access`. La caja no se toca.
  Con `p_simular` solo cuenta: es el preview del dialog. **La vuelta** (19/10/2026) es el ícono de
  cada fila de Inactivos (`ReactivarMiembroDialog`), que llama a la edge function `reactivar-miembro`
  (tests con `deno test` ahí adentro): solo SUPERADMIN activo, pone `activo = true` y, si se eligió
  «Poner una nueva», antes le cambia la contraseña (si eso falla, no activa). Sin migración. No
  devuelve nada de lo que la baja traspasó, ni los permisos de `crm_data_access`: se dan de nuevo
  desde Visibilidad. **El teléfono** (19/10/2026, migración `20261019140832_users_phone`) es
  `users.phone`, aparte de `firma_telefono` (el de la firma de los mails, que puede ser el de la
  oficina). Como en el producto, **el alta lo exige** (`requiredPhoneError` en el front,
  `telefonoCargado` en `crear-miembro`) y se guarda en E.164; los de antes pueden no tenerlo. Se
  carga o cambia tocando la columna «Teléfono» de `/equipo` (`TelefonoMiembroDialog`, RPC
  `crm_set_member_phone`, solo SUPERADMIN). **El apellido** (19/10/2026, migración
  `20261019142535_users_last_name`) es `users.last_name` y va igual: obligatorio en el alta, editable
  al lado del nombre en `/equipo` (`ApellidoMiembroDialog`, RPC `crm_set_member_last_name`).
  `nombre` sigue siendo el corto de los avatares, y las iniciales de un alta salen de nombre y
  apellido. Cambios, `caja` y roles siguen por el MCP.
- **La baja es `activo = false`, nunca un `delete`.** Un inactivo no entra (`es_usuario()` lo
  corta y la RLS le devuelve la lista vacía), pero se sigue pintando: una tarea vieja dice
  quién la hizo y lo que pagó sigue en el saldo de la caja. Lo que no se hace es **ofrecerlo
  para elegir**: `elegibles()` lo saca de los menús salvo donde ya está puesto, para poder
  sacarlo.
- **`rol` es un enum con dos valores (`SUPERADMIN` y `SDR`, este desde el 29/9/2026)**. En la
  base restringe el CRM; en el front, desde el 6/10/2026, qué páginas ve cada uno (ver arriba). El default sigue siendo `SUPERADMIN`: un alta nueva que tenga que
  ser SDR se marca a mano. Un rol
  nuevo es `alter type user_role add value …`; la primera regla por rol es una policy.
- **`caja` es un booleano y no un rol**: quién pone plata y qué permisos tiene una cuenta son
  preguntas distintas.
- **`PERSONAS` y `PERSONAS_CAJA` son `const` que se llenan en el lugar** (`splice`), no se
  reasignan: todo el archivo las lee por nombre. Antes de entrar están vacías, así que nada
  que se calcule al cargar el script puede depender de ellas — por eso `anchoAvatares()` es
  una función y no la constante `ANCHO_AVATARES` que fue.

### Modelo de datos

Tablas: `roadmap_tareas`, `roadmap_caja` y `roadmap_notas` (los grupos del backlog y la hoja de
notas de esa pantalla, ver abajo).
Bucket de adjuntos: `roadmap-adjuntos`.

- `roadmap_tareas`: además de lo viejo, `prioridad`, `tipo`, `hoy` (bool; era la marca de la
  vista «Hoy» y desde el 26/8/2026 significa **«esta actividad todavía es nueva en el
  tablero»** — ver la chapa de novedad), `pend` (jsonb,
  varios responsables), `creada`, `chat` (jsonb `[{autor,ts,texto}]`) y `subtareas`
  (jsonb `[{id,titulo,resp,estado,expl,chat,files}]`). `resp` se mantiene sincronizado
  con `pend[0]` por compatibilidad.
- **`tipo` ya no se usa** (26/8/2026, por pedido). Era la clasificación de la actividad
  —«Desarrollo nuevo», «Modificación de lo hecho», «Corrección de errores», «UX / UI»— con su
  `<select>` en la ficha, su filtro en la barra y su columna en el CSV. Se sacaron los tres:
  había que elegir uno tarea por tarea y después nadie filtraba por él. **No se migró nada**,
  misma jugada que con `loom`: la columna sigue en la base con lo que tenía cargado,
  `guardarTarea()` la escribe igual y toda tarea nueva nace con el `'nuevo'` de fábrica —lo
  que ya era el default de la columna—. Simplemente no hay pantalla que la edite ni que la
  lea. Ojo con no confundirla con la constante `TIPOS`, que se borró.
- **Y ese mismo día `tipo` pasó a guardar otra cosa: cuándo entró la tarea al tablero**
  (`CAMPO_ENTRADA`, `entroAlTablero()`, `enTableroDesde()`). Es lo que hace que el círculo de
  días de la fila cuente desde que la tarea está en la cancha y no desde que alguien la anotó.
  Misma jugada que `modulo` con el «Área», que `hoy` con la chapa de novedad y que
  `texto`/`orden` de `roadmap_notas` con la columna de cada grupo: reusar un campo muerto que
  ya está corrido en vez de esperar una migración, que hay dos pendientes hace semanas.
  - **Se lee estricto, por la forma del dato** (`/^\d{4}-\d{2}-\d{2}/`) y nunca «lo que haya».
    Ahí adentro está cargado el `'nuevo'` de fábrica y las cuatro categorías viejas, y
    `new Date('nuevo')` no falla: devuelve `Invalid Date`. Es la misma regla del prefijo
    `grupo-` de `roadmap_notas` — una columna reusada se corta por la forma y no por confianza.
  - **Sin fecha guardada la cuenta cae en `creada`**, que es exactamente lo que el número decía
    antes de que esto existiera: **no se migró nada** y ninguna fila cambió de valor. Cada tarea
    empieza a contar de verdad la próxima vez que pase por el backlog.
  - **La escribe `alTablero()` y nadie más**, en cada pase y no solo en el primero: una tarea
    puede ir y volver, y la vuelta es una llegada nueva. Es la misma regla que ya tenía `hoy`
    dos líneas más abajo en esa función.
- **`estado` son cinco y no cuatro desde el 26/8/2026**: entre Bloqueada y Terminada entró
  `Revision` («En revisión»), lo que ya no se está haciendo pero tampoco está cerrado. **No
  hizo falta migración**: la columna es un `text` sin `check`, así que un valor nuevo entra
  solo, y las filas viejas simplemente no lo tienen porque nunca pasaron por ahí. El `id` va
  sin tilde —es lo que queda escrito en la base— y el `label` sí la lleva, la misma regla que
  ya tenían `Pendiente`/«Nueva» y `Hecho`/«Terminada».
- **`pend` nunca queda vacío: ninguna tarea existe sin responsable.** Son dos cortes, uno por
  cada punta. Al nacer: acá no hay formulario con submit —la fila se crea y se persiste
  vacía— así que el corte va **antes** de que exista, en `pedirResponsable()`, que abre el
  selector y recién con la elección hecha llama a `nuevaTarea()` / `nuevaEnBacklog()`. Cerrar
  el menú sin elegir no crea nada: dejar la fila nacida esperando responsable la guardaría
  sin nadie ante cualquier recarga, que es justo lo que se quiere evitar. Al editar:
  `alternarPend()` es el único camino de los tres botones (tablero, ficha y fila del backlog)
  y rechaza sacar al último. La regla vive en un lugar y no en cada botón — con cuatro
  puertas hasta la creación, olvidarse en una alcanza para que no valga. **Las cuatro preguntan,
  sin excepciones** desde el 26/8/2026: hubo una —el Enter del backlog heredaba el responsable
  de la fila de arriba, para no cortar el tipeo de corrido— y se fue con el Enter, cuando el
  título de la fila dejó de editarse en las dos listas.
  Las filas anteriores a esta regla siguen sin responsable: no se migraron.
- `roadmap_tareas.creada` se pinta como **antigüedad**, no como fecha, y sale toda de
  `antiguedad(iso)`: elige la unidad sola (`3 d`, `2 sem`, `4 mes`) y deja la fecha exacta en
  el `title`. **Desde el 26/8/2026 se ve en un solo lugar**: la ficha y la cabecera de la
  página de la tarea (`pillEdad()`). En las filas ya no va —en el tablero el círculo cuenta
  otra cosa (desde que la tarea entró, no desde que se anotó) y en el backlog el dato salió
  entero, ver los dos cuadros—. Lo que `creada` sigue alimentando en el backlog sin escribir
  números es el color del riel y el «N sin salir» del grupo.
  El texto lo reescribe un `setInterval` de un minuto sobre cada `[data-edad]`, **no un
  repintado**: repintar el tablero entero cada minuto cortaría lo que alguien esté
  escribiendo. Por eso el número vive en su propio `<i class="edad">` y no suelto al lado
  del ícono.
- `roadmap_tareas.expl` guarda **tres formatos a la vez**: texto plano (todo lo escrito
  hasta el 11/8/2026), HTML nuestro con la marca `<!--h-->`, y desde el 26/8/2026 un árbol
  de bloques en JSON con la marca `<!--b-->` (la página de la tarea). Se distinguen **por la
  marca del principio y nunca adivinando**: una explicación vieja que hable de `<div>` o que
  empiece con una llave no tiene por qué volverse markup ni JSON de golpe. Una fila vieja se
  convierte recién cuando alguien la edita. Todo lo que lee `expl` para otra cosa que no sea
  pintarlo (buscador, CSV) pasa por `explATexto()`, que entiende los tres. Ojo: `explATexto()`
  devuelve **la explicación y nada más**. Los avisos viven en el mismo árbol pero se saltean
  ahí a propósito —ver el cuadro de avisos— y se leen con `avisosDeExpl()`.
- `roadmap_caja`: los movimientos. Ojo: la columna se llama `cuenta` en la base
  pero el front la expone como `quien` (persona que puso o gastó).
- `roadmap_tareas.backlog` (bool), `.sprint` (smallint, nulo = sin sprint), `.dep` (texto) y
  `.loom` (texto, el enlace al video — ya sin pantalla que lo edite, ver el Backlog) son el
  Backlog. El front usa `0` para «sin sprint» porque es más cómodo de comparar y lo
  vuelve a `null` recién al guardar. **No hay tabla de backlog ni tabla de sprints**: mirá la
  sección del Backlog para el porqué. La columna «Área» de esa vista es `modulo`, un campo
  del tablero viejo que estaba muerto y se reusó.

`roadmap_secciones` ya no existe. Eran las **temáticas**: se sacaron del tablero el
11/8/2026 porque no aportaban nada, y el esquema único (`supabase/schema.sql`) no las crea,
ni a la tabla ni a `roadmap_tareas.sec_id`.

`roadmap_notas` **guarda los grupos del backlog y la hoja de notas de esa pantalla**, desde el
26/8/2026. La creó `schema-v3.sql` para la Visión vieja (dos hojas de texto libre) y quedó vacía;
se reusó a propósito y no por comodidad: una columna nueva habría dejado los nombres
esperando a que se corra otra migración —hay dos pendientes hace semanas— y esta tabla ya
está corrida, ya tiene su RLS por miembro y ya está publicada en realtime. Una fila por
grupo: `id = 'grupo-3'`, `titulo` = el nombre y, desde que los bloques se acomodan a mano,
`texto` = en qué columna de la hoja está y `orden` = su lugar dentro de esa columna. Las dos
últimas son otro campo muerto reusado —`texto` en una fila de grupo se escribía siempre vacío y
`orden` guardaba el número del grupo, que ya está en el `id`—, la misma jugada que `modulo` con
el «Área» y `hoy` con la chapa de novedad. **Sin `texto` escrito el grupo no tiene lugar propio y
la hoja se reparte sola**, que es exactamente lo que valía para cada fila antes: por eso no hubo
nada que migrar. El prefijo del `id` no
es decorativo: la tabla es de texto libre y podría volver a usarse para otra cosa, y sin él
cualquier fila que alguien meta ahí se leería como un grupo del backlog. **Y esa segunda cosa ya
llegó**: la hoja de notas del backlog es una fila sola con `id = 'nota-backlog'`, donde `texto` es
lo escrito, `titulo` va vacío y `orden` no ubica nada — o sea, las mismas tres columnas
significando otra cosa. Es exactamente el caso para el que estaba puesto el prefijo, y leer una
fila con el significado de la otra pinta un grupo llamado «acordate de llamar al contador».
Cualquier lector nuevo de esta tabla corta por el `id` y no por la forma del contenido.

### Vistas

`VISTAS` en `app.js` no son todas iguales, y las diferencias son dos, no una:

- **Quién no sabe nada de tareas** (`sinTareas`): solo la caja. El backlog y el tablero **sí**
  son tareas, así que tienen filtros, buscador y contador; la caja no.
- **Quién se come el board entero** (`anchoCompleto`): la caja y el backlog. **Desde el
  26/8/2026 este helper ya no separa nada** —las tres vistas son hojas de renglones y las tres
  ocupan el board entero— y quedó porque el backlog lo usa para otras cosas. Antes era el
  corte entre «hoja de renglones» y «tablero de tarjetas»; sin tarjetas, ese corte no existe.

Confundir las dos fue el error de la versión anterior, cuando había un solo helper para
todo. **La marca la lleva la vista (`caja:true`, `backlog:true`), no el render**: nadie
compara contra un id suelto por el archivo.

**Las clases del board son tres y siguen siendo tres**: `cmode` la caja, `bmode` la hoja de
renglones —la lleva el backlog y también el tablero, que se dibuja con el mismo componente— y
`pgmode` la página de una tarea. Ya no cambian el `display`, que ahora lo pone `.board`; lo que
aportan es el fondo y el scroll de cada una.

**Las vistas ya no son pestañas: viven en la barra lateral** (26/8/2026), y por eso cada
entrada de `VISTAS` trae un `ico` además del `label`. Con la barra plegada el ícono *es* la
vista; el rótulo aparece recién al abrirse. La caja se entra desde ahí como cualquier otra.

**La vista «Hoy» se eliminó** el 26/8/2026, y con ella todo el sistema de marcar tareas para
el día: el sol de la tarjeta, el botón de la ficha, el contador de la pestaña y la columna en
el CSV. Era una clasificación paralela a la prioridad que había que mantener a mano, tarjeta
por tarjeta, y que nadie mantenía. La columna `roadmap_tareas.hoy` quedó vacía y ese mismo día
se reusó para otra cosa —la chapa de novedad, ver su cuadro—, igual que `modulo` se había
reusado para el «Área» del backlog: un campo muerto que ya está en la base y que ya se guarda
solo evita una migración, y hay dos pendientes. Ojo con `localStorage`: una sesión vieja puede tener `vista:'hoy'`
guardada, y de eso se ocupa el `VISTAS.some(...)` que ya filtraba la preferencia al leerla.

### El tablero es una lista

**El tablero se dibuja de una sola forma desde el 26/8/2026** (por pedido): la hoja de
renglones del Backlog, agrupada por estado en vez de por sprint (`renderListaEstados()`). No es
una vista aparte: sigue siendo el tablero, con sus filtros, su buscador y su contador; lo único
que cambia respecto del backlog es el componente que decide de qué se agrupa.

**Hasta ese día hubo tres formas y un segmentado en la barra para elegirlas** (`LAYOUTS`, con
`UI.layout` guardado en `localStorage`):

| id | qué era |
|---|---|
| `cols` | el kanban: una columna por estado, tarjetas, bandas de prioridad adentro |
| `rows` | esa misma tarjeta estirada a lo ancho, una debajo de la otra |
| `lista` | esto |

**Las dos de tarjetas se sacaron enteras, y con ellas el segmentado**: un selector de una sola
opción no es un selector. Se fueron `renderTablero()`, `tarjetaHTML()`, `conectarTablero()`,
`soltarTarea()`, `tarjetaDespuesDe()`, el autoscroll del arrastre de tarjetas, `arrastreId` y
todo el CSS de `.card` / `.col` / `.board.rows`. También `nuevaTarea()`, que era el creador del
lado de las tarjetas: «+ Nueva tarea» pasa ahora por `nuevaEnEstado()`, el mismo del `＋` de la
lista, así que las dos puertas calculan el `orden` igual y las dos entran a la página.

- **`UI.layout` no se guarda ni se lee más.** Una sesión vieja puede traerlo en `localStorage` y
  se ignora, igual que la vista `'hoy'`.
- **La ficha perdió su última puerta y volvió al menú `⋯`** — ver el cuadro de la ficha.
- **`bmode` es el envoltorio de la lista de renglones, no «la vista Backlog».** Lo lleva
  cualquiera que dibuje esa hoja, venga de donde venga.
- **Agrupa por estado y no por prioridad** porque el eje del tablero ES el estado. De paso,
  arrastrar un renglón a otro bloque significa lo que significaba arrastrar una tarjeta a otra
  columna.
- **Y adentro del bloque se apila por prioridad** (26/8/2026, por pedido): primero las
  críticas, después las urgentes, y recién dentro de cada banda manda el `orden` a mano
  (`porPrioridad`, el único comparador, que usan el pintado y `tareasDeEstado()`). No es una
  regla nueva: en el kanban cada prioridad ya era su propia banda adentro de la columna, así
  que esto es lo que hacía falta para que el tablero se leyera igual de las dos formas mientras
  convivieron. **Acá las bandas no se dibujan**: cinco bloques por cuatro títulos, en una
  columna de un tercio de pantalla, es más encabezado que tarea — el color del riel de la
  puerta ya dice la prioridad de cada fila. El backlog no entra en esto, que ahí no hay
  prioridad.
  - **Y por eso soltar sobre otra banda le cambia la prioridad a la fila** (`adoptarBanda` en
    el descriptor de la lista). Es lo mismo que hacía soltar una tarjeta en la banda «Urgente»
    de otra columna, que cambiaba el estado y la prioridad de una. Sin eso, arrastrar
    entre bandas sería un no-op a la vista: la fila caería donde uno la soltó y el apilado la
    devolvería a su lugar en el próximo pintado.
  - **Todo lo que calcula un `orden` lo hace contra las hermanas de SU banda** (el arrastre,
    `cambiarEstado()` y `nuevaEnEstado()`, con `bandaDe`). Apilado por prioridad, los `orden`
    ya no van en el orden en que se ven, y `calcularOrden()` promedia dos vecinos: entre
    bandas distintas eso devuelve un número que no cae donde uno lo vio caer. Por lo mismo,
    lo que va «al final del bloque» va al final de su banda y no al final de la lista.
- **Terminadas se pliega con `UI.terminadasAbiertas`**, que era la preferencia de la columna
  plegada del kanban. Los otros cuatro estados sí llevan marca propia (`tablero-plegados` en
  `localStorage`, el gemelo de `backlog-plegados`). La preferencia sobrevivió a la columna
  porque es la misma pregunta —¿miro lo terminado?— y renombrarla no arreglaría nada: cambiar
  la clave dejaría a todos con Terminadas abierta el día que se suba.
- **Los cinco bloques se dibujan aunque estén vacíos**, al revés que «Sin planificar» del
  backlog: un estado sin tareas es información («nada bloqueado») y además es dónde soltar la
  primera. Y no lleva el `＋ Sprint` del final: los estados son un catálogo cerrado.
- **La cabecera del bloque es la flecha, el punto de color, el nombre y el contador. Nada más**
  (26/8/2026, por pedido). A la derecha vivían dos pastillas y se fueron las dos:
  - **«N críticas»**, que repetía en la cabecera lo que el bloque de abajo ya dice fila por fila
    y en color: las críticas se apilan arriba de todo (`porPrioridad`) y su riel es rojo.
    Contarlas otra vez arriba era el mismo dato dos veces en la misma pantalla.
  - **El «N%»**, que medía cuánto del tablero estaba parado en ese estado. Un número que hay que
    interpretar —¿32% es mucho?— pegado a un contador que dice la cuenta de verdad. Con él se
    fue el tercer argumento de `filaEstadoHTML()`, que era el total para calcularlo.
  - **Contrapartida asumida**: plegado el bloque, lo único que queda a la vista es el nombre y
    el contador. Es exactamente lo que se pliega para ver, así que se paga barato.
  - El «N sin salir» del backlog **no** se fue con estos, aunque fuera su gemelo: ese no repite
    nada de lo de abajo — desde que la antigüedad salió de la fila, es lo único que esa pantalla
    dice en números sobre qué se está pudriendo.
- **Los bloques van repartidos en tres columnas** (`COLUMNAS_LISTA`, clase `bkcols`): Nueva,
  En curso, y los tres finales del camino —Bloqueada, En revisión y Terminada— apilados en la
  tercera. El reparto no es parejo a propósito: los dos primeros son los que se miran todo el
  día. Se escribe **por id y no por posición** dentro de `ESTADOS`, y lo que no esté nombrado
  cae en la última columna — desaparecer de la pantalla es peor que caer en la columna
  equivocada. Las columnas son del pintado y de nadie más: cada bloque conserva su `data-g` y
  su `data-filas`, así que arrastrar, plegar y crear no se enteran de que hay tres cajas.
- **`bkcols` es «esta hoja está partida» y NO hay variante por lista** (26/8/2026, por pedido).
  El tablero-lista y el backlog se parten en las mismas tres columnas, con el mismo reparto
  (1.18 / 1.18 / 0.64), el mismo separador y los mismos anchos reservados en la fila. Hubo un
  `bkcols2` de un día —el backlog en dos columnas parejas— y se fue: dos listas que se leen
  distinto son dos pantallas que hay que aprenderse por separado, y estas dos son la misma hoja
  mirada por otro eje. Antes de eso, `bkcols` significaba «la lista por estado» y este cuadro
  decía que el backlog **no** se partía, porque los sprints son una secuencia. Lo que cambió no
  es la premisa sino el corte — ver el Backlog.
  - **La cantidad de columnas se escribe UNA vez**: `COLUMNAS_BACKLOG = COLUMNAS_LISTA.length`.
    Con un `3` suelto en el backlog, agregarle una columna al tablero lo dejaría con cuatro
    tracks de grilla y tres cajas adentro.
- **Todo el tratamiento de columnas vive adentro de un `@media(min-width:1121px)`**, no de un
  `max-width` que lo deshaga. Abajo de eso, tres columnas de menos de 340px entran con el
  título recortado a la mitad, así que la lista vuelve a ser una sola. La única regla del lado
  angosto es devolverle el margen al primer bloque de cada columna: `.bksprint:first-child` lo
  pega al de arriba, y apiladas cada columna tiene un primer bloque.
- **Cambiar de vista cierra el menú `⋯`.** La fila que lo tenía abierto puede no existir en el
  dibujo siguiente, y un menú colgado de la nada no se cierra con nada. La misma regla valía
  para cambiar de layout, y se fue con el segmentado.

**Las dos listas son un solo componente y un solo juego de manejadores** (`LISTAS`,
`listaActual`, `engancharLista()`, `engancharArrastreLista()`). Lo único que cambia entre el
backlog y el tablero-lista está en el descriptor: por qué se agrupa (`grupoDe`, `hermanas`,
`fijar`), qué significa plegar y crear adentro de un bloque, y el rótulo del menú `⋯`. Son
~110 líneas de delegación con ocho casos: con dos copias, el arreglo que se hace en una no
llega nunca a la otra. Por eso el menú `⋯` dice `data-acc="grupo"` y no `"sprint"` — qué
bloque es lo decide la lista pintada.

**La fila se dibuja en columnas de ancho fijo** (26/8/2026, por pedido): título, quién la hace
y —solo en el tablero— prioridad y cuántos días lleva en el tablero. Antes eran todas pastillas
apiladas contra el borde derecho, así que dónde caía
cada una dependía de cuántas tuviera la fila —la prioridad de un renglón quedaba a la altura
del área del de arriba— y con cuarenta filas eso se lee fila por fila y no bajando por una
columna.

- **En el backlog la primera columna no existe.** Ahí no hay prioridad a propósito, y hasta el
  26/8/2026 ese lugar lo ocupaba la antigüedad (`.pgcol-edad`, `pillEdad()`), con el argumento
  de que las dos listas presentan la misma tarjeta cambiando qué dice el dato. Se sacó ese
  mismo día, por pedido, por el otro lado del mismo argumento: cuánto lleva algo es una cuenta
  del tablero, y contarla también en la lista de lo que todavía no empezó era la misma pregunta
  contestada en dos pantallas con dos relojes distintos. **Lo que el backlog tiene para decir
  sobre qué se está pudriendo sigue estando y sin números**: el riel de la puerta se tiñe con la
  antigüedad y la cabecera del grupo cuenta las que ya llevan demasiado («N sin salir»). Un
  color y un contador por bloque, no cuarenta números.
- **Y en el tablero está la de los días** (26/8/2026, por pedido; `.pgcol-dias`, `pillDias()`),
  al final del bloque, después de la prioridad y de quién la hace. **En el backlog no va**, por
  lo de arriba, y lo decide la fila (`t.backlog`) y no la vista, como todo lo demás acá.
  - **Cuenta desde que la tarea entró al tablero, no desde que se anotó** (26/8/2026, por
    pedido). Es la pregunta que el número contesta: hace cuánto que esto está en la cancha y
    todavía no se cerró. Antes contaba desde `creada` porque la fecha de entrada no existía en
    ninguna columna; ahora la guarda `entroAlTablero()` — ver el modelo de datos, que ahí está
    dónde vive y por qué no hubo migración.
  - **Siempre en días crudos**, que es justo lo que `antiguedad()` NO hace: esa función elige la
    unidad sola —«3 d», «2 sem», «4 mes»—, que es lo correcto cuando el dato se lee suelto en una
    frase y lo peor posible en una columna. Bajando por cuarenta filas, «2 sem» contra «12 d» hay
    que traducirlo renglón por renglón antes de poder compararlo; en días crudos el número más
    grande es el que lleva más tiempo.
  - **El número va solo, adentro de un círculo** (`.pgdias`, 26/8/2026, por pedido). Fue «14d»
    en gris, sin marco y sin fondo, y a esa escala una cifra suelta al final del renglón se lee
    como el resto de otra pastilla. El círculo es una ficha: la misma forma cerrada en las
    cuarenta filas, que se cuenta bajando por la columna sin leer ninguna. La `d` se fue con el
    marco —adentro de una ficha de tamaño fijo una letra es la mitad del ancho— y qué unidad es
    lo dice el `title` una vez. Sigue tabular: el círculo es fijo y el número tiene que caer
    centrado igual con una cifra que con tres, y por eso el CSS lleva `min-width` y no `width`
    —con tres cifras la ficha cede y se estira a cápsula; recortar el número sería peor—.
  - **Los dos formatos salen de `textoEdad()` y de ningún otro lado.** El texto lo reescribe
    cada minuto el `setInterval` de `[data-edad]` (ver `creada`), y con el formato escrito en el
    pintado y otra vez en el refresco, el chip diría una cosa al dibujarse y otra a los sesenta
    segundos. Cuál de los dos formatos es lo dice `data-edad-fmt` en el propio elemento.
  - **Se ayuda con `cursor:help` y un `aria-label`**: un número pelado no dice de qué es, ni en
    pantalla ni en un lector, y toda la frase está en el `title`.
- **El código, la dependencia y el área NO son columna.** Se dibujan nada más cuando hay algo
  que decir, y una columna reservada para un campo que la mitad de las filas no tiene es puro
  hueco. Van juntas en `.pgpills`, pegadas al título, y partida la hoja en columnas se esconden
  en las dos listas (ver abajo).
- **El título es el único elástico** (`flex:0 1 auto`) y lo que clava las columnas a la derecha
  es un espaciador vacío (`.pgesp`) que se come todo el espacio libre. Fue el `margin-left:auto`
  de la primera columna, escrito como `.pgpills + .pgcol`, y eso valía mientras las dos listas
  tuvieran una columna visible ahí —prioridad en el tablero, antigüedad en el backlog—. El
  backlog se quedó sin ninguna el día que la antigüedad salió de la fila, y un `auto` sobre un
  elemento que el CSS esconde no empuja nada. **Un elemento que va siempre y no depende de qué
  dibuje cada lista es lo único que no hay que volver a arreglar la próxima vez que una columna
  cambie** — es la tercera vez que se mueve ese ancla. Se esconde a ≤760px, que ahí las columnas
  dejan de ser columnas y no hay de qué despegar nada.
- **El ancho es fijo y no `1fr`.** Son cuatro prioridades posibles y tres nombres: reservar lo
  que miden cuesta menos que hacer que el renglón se recalcule según lo que tenga adentro.
- **Los nombres van adentro de un `.qn`** y no sueltos en la pastilla: con ancho fijo hace falta
  un único elemento al que recortar, si no tres responsables desbordan en vez de terminar en
  puntos suspensivos. Los nombres completos quedan en el `title`.
- **Envuelto el renglón (≤760px) las columnas dejan de ser columnas**: sobre un segundo renglón
  propio, el ancho reservado solo deja huecos.

**Y en la lista en columnas (≥1121px) la de responsables ya no se dibuja** (26/8/2026, por
diseño). En un tercio de pantalla «Lorenzo · Antonio» terminaba en puntos suspensivos igual:
eran ~50px reservados para un dato que no entraba. **La de prioridad se queda** — se sacó ese
mismo día y volvió el mismo día, por pedido: el riel la dice en color, pero el color solo es un
dato para el que ya se lo sabe de memoria, y 58px de pastilla es lo que cuesta que no haya que
aprendérselo. Además es la que más se cambia, así que tiene que ser un botón y no un cartel.

- **El `▤` es también la prioridad.** Ese botón deja de ser un glifo y pasa a ser un riel del alto
  del renglón (`.pgriel`), pintado del color de la prioridad. Dice un dato más sin gastar ancho.
  Sigue siendo la puerta a la página: mismo botón, mismo `data-pagina`, mismo lugar.
  - **El color es el mismo `tint(color,.55)` que llevaba el lomo de la tarjeta** cuando había
    tarjetas. Sobrevivió a propósito: el color de una prioridad es el mismo mire por donde se
    mire, en la fila, en la pill y en el punto del filtro.
  - **Es una línea continua** (26/8/2026, por pedido). Estuvo unas horas cortado en muescas —una
    por línea de título, con el período atado al `line-height:1.4`, para que el riel dijera
    también cuánto medía la tarea— y se sacó el mismo día: con títulos de una y dos líneas el
    corte se leía como una línea y un punto sueltos, no como una escala. Un dato que hay que
    explicar para que se entienda no es un dato. El `line-height:1.4` del título se conserva,
    pero ya no depende de nada: es lo que hace entrar tres renglones en la altura de la fila.
  - **Al hover el riel se pone del color de acento**: un riel pálido y quieto se lee como
    decoración, no como algo que se toca.
- **Quién la hace se mudó a avatares** (`.bkav`, los mismos `.av.mini` de la barra lateral y el chat). Tres
  iniciales de color se leen bajando por la columna. Sin nadie, un hueco punteado: es justo el
  caso en el que hay que poder tocarlo, misma regla que el «Sin asignar» de la pastilla. Es el
  mismo `data-pop="pend"` y abre el mismo menú.
- **Los avatares también tienen ancho reservado, como las pastillas.** Al principio medían lo
  que midieran —31px con uno, 81px con tres—, y como el bloque va clavado a la derecha eso
  corría la pastilla de prioridad hasta 50px de una fila a la otra: las dos columnas dejaban de
  leerse bajando justo en la vista donde más filas hay a la vez. El hueco reserva la lista
  entera de gente y las iniciales arrancan pegadas a su izquierda. El ancho lo dibuja el CSS
  pero el número sale del JS (`anchoAvatares()` → `--avn`, tomado de `users` —hasta el 29/9/2026 `APP_CONFIG.personas`—, que
  es el techo real: el menú no ofrece a nadie más).
- **El ancla del bloque es `.pgesp` y no una columna**, justamente porque acá el backlog no
  dibuja ninguna. Ver el punto del título elástico, más arriba: el ancla se movió tres veces
  antes de dejar de depender de qué columnas tuviera cada lista.
- **Las dos formas van SIEMPRE en el HTML y el CSS elige cuál se ve.** Cuál corresponde es una
  pregunta de ancho de pantalla, y el ancho no se sabe desde el JS. Es la misma regla que ya
  tenía el recorte del título a tres líneas: todo el tratamiento vive adentro del
  `@media(min-width:1121px)` y no hay nada que deshacer más abajo.
- **La pastilla de quién la hace no se borra, se esconde.** Apretada la pantalla esto no existe,
  la lista vuelve a ser una sola y vuelve ella.
- **Las tres columnas se reparten 1.18 / 1.18 / 0.64** y no en tercios. Nueva y En curso son las
  que se miran todo el día y sus títulos son los que hay que leer enteros; la tercera apila los
  tres finales del camino, que se consultan.
- **Entre 1121 y 1239 la canaleta cede 6px** (`--pgcan:26px`): es lo único que se puede achicar
  sin tocar lo que se lee.

**Ya no hay selección múltiple** (26/8/2026, por pedido). Se fueron el casillero de la canaleta
(`.pgsel`), el conjunto `marcadas`, la barra oscura de acciones en lote (`.bbulk`) y
`accionEnLote()` / `aplicarEnLote()`. No se usaba, y esos 14px de canaleta eran los que le
faltaban al título. Sin dónde marcar una fila, dejar la barra habría sido dejar código que no
puede correr; las mismas acciones siguen estando de a una, en el menú `⋯`, en la pill de cada
campo y en la ficha. El `silencio` que todavía aceptan `campoTarea()`, `cambiarSprint()`,
`cambiarEstado()`, `pasarAlRoadmap()` y `mandarAlBacklog()` era de ahí y se conservó.
**Contrapartida asumida**: vaciar un grupo entero al tablero vuelve a ser una tarea por vez.

**El título de la fila no se edita: se entra, en las DOS listas** (26/8/2026, por pedido). El
título es un `<button class="pgtxt bktit">` con el mismo `data-pagina` que el riel, así que el
renglón entero es la puerta. La fila es para mirar, y un campo editable de tres renglones en el
que cualquier clic pone el cursor convierte la acción principal de la pantalla —entrar a la
tarea— en la de acertarle a un riel de 3px. Pasar por encima del título prende el riel
(`:has()`), que es la forma de decirlo sin subrayar tres líneas de texto en cada hover.

- **El backlog quedó afuera media hora y se descartó por pedido.** El argumento era que escribir
  una lista de corrido es el 90% de esa pantalla —anotar veinte cosas es tipear y apretar Enter
  veinte veces—. El motivo de unificar es más fuerte: dos renglones que se ven idénticos y
  responden distinto al mismo clic es peor que perder el tipeo.
- **Salvo la fila que se acaba de crear, que nace con el cursor adentro del título**
  (26/8/2026, por pedido). Es un `<input>` en el lugar del botón, marcado con `bautizando` —el
  gemelo de `renombrando`, el estado del grupo que se está bautizando— y vuelve a ser un botón
  al salir del campo: Enter guarda y cierra, Escape deja la tarea sin nombre (ya está creada,
  no se borra) y el clic afuera guarda lo que haya. No contradice la regla de arriba: la fila
  ya dibujada sigue sin editarse, y lo que se recupera es justo lo que se había perdido, anotar
  sin irse de la lista. **Vale para las dos listas**, que son el mismo componente y crear tiene
  que hacer lo mismo de los dos lados.
  - **Se limpia en `engancharTituloNuevo()` cuando el campo no está en pantalla.** Con un
    filtro o el buscador prendidos, la fila recién creada —que todavía no dice nada— puede no
    dibujarse: la marca quedaría puesta y le pondría un `<input>` encima del título a esa fila
    en cuanto el filtro la deje pasar.
- **Se fueron los tres manejadores del tipeo**, no quedaron mudos: `board.oninput`, `onpaste` y
  `onkeydown` ahora se **anulan** al entrar a la lista, junto con los dos que ya se anulaban.
  Anular es lo que hay que hacer y no borrar: si no, el `oninput` de la caja sigue vivo encima
  del tablero. **Contrapartidas asumidas**: Enter ya no abre una fila nueva —se agrega con el
  `＋` de la canaleta o el del final del bloque— y con él se fue la herencia del responsable de
  la fila de arriba, así que las cuatro puertas de creación preguntan.
- **`nuevaEnEstado()` y `nuevaEnBacklog()` dejan el cursor en la fila y NO entran a la página.**
  Estuvieron unas horas entrando, porque sin título editable quedarse afuera dejaba una tarea
  sin nombre y sin dónde escribirlo; se corrigió por el otro lado, con el campo de arriba.
  Con eso se fue también el `foco` de `abrirPagina(id, foco)`: no lo llamaba nadie más.

Cuidado con `filaTareaHTML()`: es compartida y le queda **un solo corte por vista**; el resto lo
decide la fila.

- **El «→ Al tablero» es lo único que mira la vista** (`vistaActual().backlog`): ofrecerle a una
  fila del tablero mandarla a donde ya está no es una acción, es ruido. Es también lo único que
  la fila del backlog tiene de más — todo lo demás se dibuja igual en las dos.
- **La chapa de novedad va en las dos.** No se enciende por las causas del tablero en una fila
  del backlog porque `nuevaSinAbrir()` y `prioridadSinVer()` cortan por `t.backlog` —ahí ni la
  tarea está en el tablero ni tiene prioridad— pero sí por los avisos sin ver, que valen igual de
  los dos lados. Mismo elemento, mismas reglas: las que no aplican, no encienden. Y entrar desde
  el backlog sigue sin marcarla vista, así que la tarea llega igual de nueva al tablero.
- **La pill de prioridad, el círculo de días y el color del riel los decide la fila**
  (`t.backlog`), no la vista: así vale igual adentro de la página de una tarea del backlog, que
  usa las mismas pills. Sin prioridad, esa columna no se dibuja y el riel se pinta de la
  antigüedad; los días no se dibujan porque de ese lado la cuenta ni siquiera arrancó.

### La barra lateral

Todo lo que no es una tarea (26/8/2026): a dónde ir, quién sos, exportar y cerrar sesión.
Antes eran dos renglones de encabezado; ahora arriba queda una sola línea con los filtros y
las dos acciones que sí son del tablero —la campana de críticas y «+ Nueva tarea»—.

- **Se abre sola al pasar el cursor y no tiene botón de fijar.** Es un menú al que se entra
  cuatro veces por día, no un panel de trabajo: un botón para abrirla y otro para cerrarla
  serían dos clics de más para algo que se mira dos segundos.
- **Lo que se abre es `.side-in`, apoyado ENCIMA del tablero y no dentro del flujo.** Si el
  ancho fuera parte del layout, rozar la barra con el mouse reacomodaría el tablero entero, y
  y partida la hoja en tres columnas eso son tres columnas saltando de lugar.
- **Va en `z-index:40`, por debajo de los modales.** Se abre sola: una barra que se despliegue
  encima de una ficha abierta es un manotazo cada vez que el cursor pasa cerca del borde.
- **El aviso de esquema (`.nota-pop`) es `position:fixed`.** La barra recorta lo que se sale
  de su ancho y ese cartel mide bastante más que la barra.
- **En el teléfono no existe como canaleta: es un cajón.** Ver la sección de abajo — lo que
  cambia es la barra entera, no un par de anchos.
- La franja de arriba (`.bar`) quedó con `#filtros` y `.bar-acciones` como hermanos: la caja
  esconde los filtros enteros, y la campana y «Nueva tarea» tienen que seguir estando.

### El teléfono

Abajo de 760px el tablero no es el mismo apretado: es otra forma de la misma pantalla
(27/8/2026, a partir de un diseño de Claude Design). Hasta ese día era el escritorio con los
anchos achicados y las columnas apiladas, que en 390px significaba una canaleta de 44px, una
barra lateral que hay que adivinar y filas de columnas fijas que no entran.

**Nada de esto lo sabe el JS.** Todo lo propio del teléfono va SIEMPRE al HTML y lo esconde el
CSS arriba de 760px — es la misma regla que ya tenían el riel de la fila, los avatares y el
rótulo del pase al tablero: cuál de las dos formas corresponde es una pregunta de ancho de
pantalla, y el ancho desde el JS no se sabe. Las piezas propias son seis: `.mhead` (el
encabezado), `.tabbar` (las vistas), `.fab` (el `＋`), `.side-scrim` (el fondo del cajón),
`.cjmes` (el mes de la caja) y `#fPend` (el filtro de personas con forma de menú). Las seis
arrancan en `display:none` en una línea sola, arriba del `@media`, y no hay nada que deshacer.

- **A dónde ir se va abajo** (`.tabbar`). La barra lateral se abría al pasar el cursor y sin
  cursor eso no existe. **Es un segundo dibujo del mismo `VISTAS`, no una segunda navegación**:
  se pinta adentro de `pintarChrome()`, arriba del `$$('[data-vista]')`, con el mismo atributo,
  así que el enganche cubre las dos de un saque y no hay un segundo lugar donde acordarse de
  agregar una vista.
- **Lo que no son vistas queda en un cajón**, que es la misma barra lateral abierta a lo ancho
  y sin canaleta. Lo abre el avatar del encabezado y lo cierra el fondo o Escape. `.side-nav`
  se esconde ahí adentro: las vistas ya están abajo, y dos lugares para lo mismo son dos
  lugares que hay que aprenderse. El `:hover` de la barra se anula a mano —en un teléfono un
  hover se queda pegado después de tocar— y el cajón va en `z-index:58`: por debajo de los
  modales y del visor, como en el escritorio, y por encima de la barra de abajo.
- **«+ Nueva tarea» se muda al `＋` flotante** y es el mismo camino, no una copia:
  `nuevaDesdeBarra(ancla, ev)` la usan los dos y lo único que cambia es el anclaje del menú de
  responsables —el botón del encabezado no está en pantalla—. **En la caja el `＋` carga un
  movimiento**, que es lo único en lo que las dos puertas se separan: el «＋ Nuevo movimiento»
  de esa pantalla está al final de la lista, y el del encabezado manda al tablero a crear una
  tarea, que no es lo que se vino a hacer ahí.
- **El buscador se despliega desde el 🔍** y se lleva su propio renglón: en línea con los dos
  filtros no le quedaría ancho para escribir. **Cerrarlo vacía lo buscado** —un filtro puesto
  detrás de un campo escondido es la forma más rápida de que el tablero parezca vacío sin que
  se vea por qué—. **Se vacía al irse a la caja y no al entrar a una tarea**: adentro de una
  página la búsqueda queda escondida con el resto de los filtros y al volver el tablero tiene
  que estar como se lo dejó, que buscar algo, entrar a lo que apareció y volver es exactamente
  para lo que se busca. `cerrarBuscador()` NO repinta: lo llama también `pintarChrome()`, en
  medio de un `render()` que todavía no dibujó nada, y desde ahí repintar sería una vuelta
  infinita. Devuelve si había algo puesto y quien lo llama de afuera decide.
- **El campo de búsqueda va en 16px y no en 12.5.** Abajo de 16 el navegador del teléfono hace
  zoom solo al tocarlo, y de ese zoom no se vuelve hasta recargar.
- **Las personas se filtran del mismo menú de tildes que las prioridades** (`#fPend`,
  `pintarFiltroPend()`). Tres chips con avatar y nombre son más anchos que la pantalla. Las dos
  formas escriben en el mismo `UI.f.pend`, así que no hay dos filtros que mantener de acuerdo;
  el menú usa `data-fpend` y no `data-persona` porque ese lo engancha el bucle de los chips con
  un `onclick` directo y cada tilde se contaría dos veces.
- **El 🔍 y el `＋` se esconden donde no significan nada**: en la caja no hay qué buscar, y
  adentro de la página de una tarea `＋` inserta bloques, que es otro botón y está en la fila.
  Se esconden en vez de no hacer nada — un control que no responde se toca dos veces antes de
  darse por vencido.

**La fila deja de ser una fila y pasa a ser una tarjeta.** Es el MISMO renglón con las mismas
clases y el mismo HTML; lo que cambia es el reparto: **el título a la izquierda —hasta cuatro
líneas, no tres— y todo lo demás clavado a la derecha**, en el mismo renglón. El orden de la
derecha lo pone `order`: avatares, prioridad, días, pase y el `⋯`.

- **Estuvo unas horas con el título llevándose la primera línea entera y las catalogaciones
  abajo**, y se cambió el mismo día por pedido. El problema era el de siempre: arrancando en el
  borde izquierdo y con una cantidad distinta de cosas por fila, la prioridad de un renglón
  caía a la altura del área del de al lado. Es exactamente lo que las columnas de ancho fijo
  vinieron a resolver en el escritorio.
- **El título es lo único elástico y va con `flex:1 1 0`, no `1 1 auto`.** Con la base en el
  contenido un título largo reclama su ancho entero y se lleva el renglón solo; con la base en
  cero se estira hasta donde llegue lo que tiene al lado, que es lo que clava el resto a la
  derecha. El `min-width:140px` es el piso: sin él, un bloque de la derecha que no entre lo
  achica hasta desaparecer. Y `justify-content:flex-end` en la fila es para ese caso — lo que
  envuelva baja alineado a la derecha y no al borde donde vive el título.
- **Todas las columnas tienen ancho reservado, los avatares incluidos** —quién la hace
  (`--avn`), prioridad 34px, días 24px, pase 32px— y por lo mismo de siempre: reservar lo que
  miden cuesta menos que recalcular el renglón según lo que tenga adentro, y es lo único que
  hace que cada cosa caiga en la misma x en las cuarenta filas.
  - **Los avatares estuvieron unas horas midiendo lo que midieran**, puestos primeros del bloque
    para que su ancho variable moviera nada más que el borde del título. Se cambió el mismo día
    por pedido: eso no es una columna. Con uno o con tres responsables la prioridad caía en un
    lugar distinto, que es justo lo que rompe leer bajando.
  - **Lo que hace pagable el hueco reservado es la prioridad abreviada**: de 58px a 34. Sin eso,
    las dos columnas juntas no entran al lado de un título legible.
- **En el teléfono la prioridad es la inicial con su punto de color** (27/8/2026, por pedido):
  «C», «U», «S», «M», que son cuatro y no se pisan. **La pastilla lleva las tres piezas siempre
  en el HTML** —el punto, la palabra entera y la inicial— y el CSS elige cuál se ve, la misma
  regla del riel y los avatares. El punto no es decorativo: solas, «S» y «M» no dicen nada, y el
  color es lo único que se lee bajando por una columna de 34px sin leer ninguna fila. En el
  escritorio no va, que ahí está la palabra y el fondo de la pastilla ya es de ese color. La
  inicial va con `aria-hidden` y la frase entera en el `title` y el `aria-label`.
- **El montón que se pega al título se esconde** (código, de qué depende, de qué área es), con
  la misma regla y el mismo argumento que en la lista en columnas: es lo único que se estaba
  recortando el título, y un racimo que cambia de largo en cada renglón rompe que la lista se
  lea bajando. Se ven entrando a la tarea.
- **El riel de la puerta se convierte en el borde izquierdo de la tarjeta.** Mismo color y
  mismo dato que en la lista en columnas —prioridad en el tablero, antigüedad en el backlog—.
  Va `position:absolute` y no como ítem del flex: la fila envuelve, y en una fila envuelta
  `align-self:stretch` mide una línea y no la tarjeta.
- **La canaleta desaparece** (`--pgcan:0`) y sus dos controles se van al final del renglón, el
  del bloque incluido. 48px reservados son un octavo de la pantalla, y el `＋` delante del
  nombre de un bloque es lo primero que se toca sin querer al ir a plegar. Con la canaleta se
  va la guía vertical del bloque, que colgaba de ella.
- **El `⠿` se va.** El arrastre del navegador no funciona con el dedo, así que sería un control
  que no hace nada. **Contrapartida asumida**: cambiar una tarea de bloque se hace desde el
  menú `⋯`, que es el mismo camino y sigue estando.
- **Los responsables son los avatares y no la pastilla**, la misma regla que en la lista en
  columnas y por lo mismo: tres nombres escritos se comen el renglón, y el avatar además es el
  blanco al que hay que apuntarle.
- **El menú `⋯` cae debajo de la tarjeta y en `z-index:46`.** Con los 20 de siempre, abierto en
  la última tarjeta a la vista quedaría tapado por la barra de abajo.
- **Los blancos crecen**: el `⋯` a 28px y las pastillas a 4px de alto de más. Lo que cuesta es
  el ancho que dejó de gastar la canaleta.

**La caja se lee por mes.** Los separadores (`.cjmes`, `cuerpoDeMovimientos()`) van siempre al
HTML y los esconde el CSS arriba de 760px: en el escritorio la caja es una planilla y la fecha
vive en su columna, pero con el pulgar «24/08» sola no dice de qué mes es hasta que uno se fija
en el renglón de arriba. No cambia nada de lo que ya andaba — el `↑` `↓` de la planilla salta
entre `.cjrow` y esto no es una, y las filas siguen saliendo de `filaMovimiento()`.

- **El movimiento también es una tarjeta**, y el que envuelve es `.cjmid`: el concepto se lleva
  su primera línea y la categoría baja a la segunda, así que el monto, quién pagó y a quién se
  le carga quedan centrados a la derecha sin partirse en dos renglones. **La categoría vuelve**
  —hasta el 27/8/2026 se escondía en el teléfono— porque en su propio renglón sí entra; la nota
  sigue afuera.
- **«Pagó» y «Cargar a» quedan en el punto de color**, ninguno se esconde entero: es plata, y
  un gasto imputado a uno leído como compartido es un saldo mal. El de «Pagó» recorta el nombre
  contra el borde derecho y no se centra —centrado, lo que se sale por los dos lados es justo
  el punto—; el de «Cargar a» sí se centra, que ahí adentro solo hay puntos. Por eso el `title`
  de «Pagó» ahora dice el nombre: es lo único que queda del dato cuando el rótulo no entra.
- **La miga y el título («Caja», dos veces) se van**: el encabezado del teléfono ya dice dónde
  estás y cuántos movimientos hay.

**Lo que NO cambió y conviene saber**: la ficha, la página de una tarea y los modales se siguen
dibujando igual, con los anchos apretados de siempre. La página de una tarea conserva su miga
—es la salida— y su canaleta de 28px.

### La Caja

Quién puso cada peso. **Desde el 26/8/2026 es una lista de renglones y no una `<table>`**,
por un diseño de Claude Design, igual que el Backlog y por las mismas razones: reusa las
clases `pg` del encabezado y de las pills, y lo propio lleva el prefijo `cj`. Antes fue una
planilla de ocho columnas con `<input>` en cada celda.

- **Las celdas se escriben sobre el texto pintado** (`contenteditable`), no en un
  `<input type=date>` ni en uno `type=number`: es lo que hace que la fila se lea como un
  renglón y no como un formulario. El costo es tener que interpretar lo tipeado, y por eso
  hay **una sola puerta por dato**: `parsearDia()` y `parsearMonto()`. Ojo con el punto en
  `parsearMonto()`: en «1.234» separa miles y en «12.5» es la coma decimal de quien viene de
  un teclado numérico. Se decide por la forma del número —si hay coma, el punto es de miles;
  si lo que queda calza exacto con grupos de tres, también; si no, es decimal— y no por una
  preferencia, porque adivinar mal ahí multiplica un gasto por mil.
- **El texto se guarda mientras se escribe; la fecha y el monto, al salir de la celda.** Los
  dos hay que interpretarlos, y hacerlo tecla por tecla reescribiría a medias lo que alguien
  todavía está tipeando.
- **Quién pagó y a quién se le carga son dos columnas, no una.** `quien` es de qué bolsillo
  salió la plata; `carga` (jsonb, lista de ids) es a quién se le imputa para el saldo. Hasta
  el 26/8/2026 era una sola pregunta y se daba por hecho que todo gasto era de todos: la
  herramienta que paga uno pero usa el otro no tenía cómo anotarse y el saldo salía mal por
  la mitad del importe.
  - **`carga` vacío significa «a todos»**, y eso es lo que hace que no haga falta migrar
    nada: es exactamente lo que valía para cada fila antes de que la columna existiera, y
    sigue valiendo mientras `schema-v8.sql` no esté corrido. Todo lo que lee el campo pasa
    por `cargaDe(m)`, que resuelve el vacío y filtra a quien ya no está en la caja. Los
    movimientos nuevos **sí** escriben la lista completa: eligieron a todos, no se quedaron
    sin elegir.
  - **Sacar al último no vale**, igual que con `pend`: un gasto que no se le carga a nadie
    deja de deberse sin que nadie lo haya pagado. El corte está en `abrirMenu()`, que es la
    única puerta que toca el campo.
- **Cada persona trae su saldo pegado a su número.** Antes había una tarjeta oscura de «A
  favor de» al lado de una por cabeza, y para contestar si te debían había que cruzar las
  dos. `saldoCaja()` devuelve por cabeza `puesto` (lo que puso, **neto** —lo que salió menos
  lo que entró—), `toca` (lo que le corresponde bancar) y el `saldo`, que es la resta.
  `gastos` y `entradas` son las dos mitades sin repartir y solo alimentan el renglón que
  resume la lista. Dos cosas de la fórmula:
  - **`toca` divide por `cargaDe(m).length` y no por la cantidad de gente**, que es toda la
    diferencia entre repartir un gasto y cargárselo entero a uno. Con todo compartido da
    exactamente lo mismo que el viejo `total / n`.
  - **Solo se reparte lo que salió de un bolsillo de la caja.** Un movimiento sin dueño o a
    nombre de alguien que ya no participa queda fuera de las dos columnas — `total` nunca lo
    contó, así que el reparto viejo tampoco lo cargaba. Sin ese corte, tocar la fórmula
    habría movido saldos de filas que nadie tocó. Es también lo que garantiza que los saldos
    sumen cero.
- **Los gastos fijos tienen su bloque, plegable, arriba de todo.** No son otra entidad: son
  los mismos movimientos con `repite`, así que siguen apareciendo abajo. El plegado es de la
  sesión, no del tablero.
- **La condición de fijo se maneja SOLO en ese bloque.** Marcar, desmarcar y crear un gasto
  fijo son cosas de ahí: en la lista de movimientos no hay con qué prender ni apagar la
  repetición (`quitarDeFijos()` es la única puerta que toca `repite`, y cuelga del ✕ de ese
  renglón). Abajo, un movimiento es un movimiento y se edita como tal —importe, concepto,
  fecha, quién— pero no su condición. El mismo interruptor repartido entre las dos pantallas
  era invitar a que alguien volviera fijo un gasto de una vez sin darse cuenta, en el
  renglón donde estaba corrigiendo un importe. **Contrapartida asumida**: un movimiento ya
  cargado no se puede ascender a fijo; se crea con «+ Nuevo gasto fijo».
- **Pero en la lista se señala, con dos marcas y las dos siempre prendidas**: el ↻ de la
  canaleta (`.cjmarca`), que se lee bajando por la columna sin leer ningún renglón, y la
  pill `↻ fijo` al lado del concepto (`.cjtag`), para el que mira una fila sola. Ninguna de
  las dos se toca: son un dato de la fila, no un control. La llevan por igual la plantilla y
  las copias que genera; lo que las distingue es el `title`.
- **El renglón del bloque de fijos SÍ se edita** (concepto, quién, monto): es el mismo
  movimiento, y lo que se toca ahí es lo que se va a copiar el mes que viene. Como esa fila
  se dibuja dos veces —arriba y abajo—, lo escrito se espeja en la otra copia en pantalla
  con `espejarCelda()` en vez de repintar: repintar mientras alguien escribe le tira el
  cursor a la primera letra. Por lo mismo, `actualizarTotalesCaja()` refresca también los dos
  `.cjsecsub`, que salen de esos montos.
- **Las filas van de la más nueva a la más vieja**, al revés que la planilla. Una caja se
  abre para ver lo último, no para releer marzo. Las que no tienen fecha caen al final —son
  de antes— y no arriba, donde taparían justo lo que se vino a mirar.
- **`categoria` y `notas` no estaban en el diseño y se conservaron igual**: sacarlas hubiera
  dejado dos columnas de la base sin ninguna pantalla que las lea. La categoría es la pill
  que el diseño ya dibujaba, pero se toca; la nota es texto tenue al final del renglón, que
  aparece al pasar por encima cuando está vacía. La pill de categoría **se dibuja aunque no
  haya categoría**, apagada: misma regla que el «Sin asignar» del backlog, la pill vacía es
  justo la que hay que poder tocar. En pantallas chicas las dos se esconden.
- **`quien`, `carga` y `categoria` se eligen con el mismo menú del backlog** (`abrirMenu()`),
  donde `t` es un movimiento y no una tarea. Hacer una copia del menú para tres listas más
  sería mantener tres veces el mismo posicionamiento. Los disparadores llevan `data-pop` y no
  una clase propia: es la marca que mira el clic global para no cerrar el menú en el mismo
  clic que lo abre. Ojo con una diferencia: `quien` y `categoria` van por `alElegir` —un
  valor y el menú se cierra—, y `carga` **no**, porque admite varios y se resuelve adentro
  del menú como los responsables de una tarea. Pasarle `alElegir` a `carga` la haría
  cortocircuitar antes de llegar a su rama.
- **«Cargar a» es UNA pill con todos los nombres adentro**, misma regla que «quién la hace»
  del backlog: con una pill por cabeza no habría dónde tocar para sumar a la segunda.
  Compartido dibuja igual su punto, apagado — en pantalla chica el rótulo se esconde (no
  entra) y el punto es lo único que queda: color es de alguien, hueco es de todos. Sin ese
  punto, el botón mediría cero y no habría dónde tocar desde el teléfono. **No se esconde
  entera como la nota y la categoría**: es plata, y un gasto imputado a uno leído como
  compartido es un saldo mal.
- **Los manejadores se cuelgan del board entero, por delegación**, como en el backlog: la
  lista se repinta ante cualquier cambio y con `addEventListener` se acumularía uno por
  repintado. La caja usa además `onfocusout`, que el backlog no: por eso `render()` lo
  suelta con el resto y `engancharBacklog()` lo apaga a mano al entrar.
- **Se sigue moviendo como una planilla**: `↑` `↓` saltan de fila por la misma columna y
  `Enter` en la última agrega una nueva. El `Enter` se ataja **siempre**, porque en un
  `contenteditable` lo que hace de fábrica es meter un salto de línea adentro del dato.

### El Backlog

La pestaña que antes fue Visión. Es la planificación: se anota, se clasifica por sprint, se
reparte, y cuando llega el momento se manda al tablero.

**Son tareas de verdad, no otra entidad.** La misma fila de `roadmap_tareas`, los mismos
campos y la misma ficha. Lo único que las separa es la columna `backlog`. Mandar una al
tablero es apagar esa marca — llega con su explicación, su checklist, sus archivos y su
conversación intactos, porque nunca dejó de ser la misma fila. Con dos tablas, cada pasaje
sería copiar filas y mover adjuntos; con una marca es un booleano.

**Lo que se manda al tablero se va de acá** (26/8/2026, por pedido). Hasta ese día la tarea con
sprint se quedaba en su bloque, apagada y con la cinta rayada, para poder ver el sprint entero
al cerrarlo. En la práctica el backlog es lo que falta hacer, y una lista que se llena de
renglones apagados esconde justo lo que queda pendiente. Ahora `enBacklog(t)` es `!!t.backlog`
y nada más: de un lado o del otro, nunca en los dos. Lo que salió de cada grupo se sigue
sabiendo —la tarea conserva su número en `sprint`— y devolverla la deja otra vez en su bloque.
Con eso se fueron también la clase `salida`, la pill «En el tablero» de la fila y el contador
«N en el tablero» de la cabecera del grupo.

**El filtro vive en un solo lugar**: la primera línea de `visible(t)`. Todo lo que pinta
tareas pasa por ahí. Lo que hay que excluir a mano es lo que no pasa por `visible()`: la
campana de críticas.

- **`sprint` es un número y el `0` es «Sin planificar»**, último bloque y solo visible si
  tiene algo. Existe para que anotar a las apuradas no obligue a clasificar en el momento:
  si clasificar fuera obligatorio, nadie anotaría nada.
- **Los bloques se llaman como uno quiera** (26/8/2026, por pedido). Eran «Sprint 1»,
  «Sprint 2»: un número que se leía como una cadencia de dos semanas que este equipo no usa.
  Ahora son grupos con nombre —«Onboarding», «Lo de la AFIP»—, y en pantalla la palabra
  «sprint» desapareció; adentro del código sigue siendo `sprint`, porque es la columna.
  - **El número SIGUE siendo el grupo; el nombre es un rótulo colgado de ese número.** La
    tarea guarda `sprint: 3` como siempre, así que renombrar no toca ni una fila de
    `roadmap_tareas` y ninguna tarea puede quedar apuntando a un grupo que no existe. Lo que
    se guarda aparte es una línea de texto por número, en `roadmap_notas` (ver más arriba).
  - **Sin nombre, el bloque se llama «Grupo N».** No queda en blanco: el menú «Mover a otro
    grupo» es justo donde más falta hace poder distinguir uno de otro.
  - **El nombre se edita en un `<input>` que reemplaza al botón entero**, no adentro de él.
    Un `contenteditable` metido en un `<button>` es HTML inválido y, peor, cada clic para
    corregir una letra le llegaría igual al botón: renombrar plegaría y desplegaría el grupo
    de paso. Se guarda al salir del campo, no tecla por tecla. El lápiz que entra a editar
    vive en las pills de la derecha y aparece con el hover del renglón, como el resto de lo
    que se toca; en pantalla chica queda prendido, que es la regla de siempre acá.
  - **El campo se engancha a mano y no por delegación**, al revés que todo el resto de esta
    pantalla: hay uno solo, nace de cero en cada repintado y así no hay que prender el
    `onfocusout` del board, que la lista apaga a propósito porque es de la caja.
- **Los bloques son siempre `1..N`, sin huecos.** `sprintsVisibles()` toma el piso de
  `APP_CONFIG.sprints`, lo sube si alguien apretó «+ Nuevo grupo» (queda en `localStorage`),
  lo sube si hay una tarea en un grupo más alto —un grupo con tareas no se esconde— y lo sube
  también si alguien lo tocó: un grupo con nombre **o con lugar propio en la hoja** es un grupo
  que alguien creó a propósito, y las dos cosas están en la base, así que las ven todos. Un grupo
  nuevo nace con el cursor adentro del nombre y sin fila en la base: si al final no se le escribe
  nada ni se lo acomoda, queda como quedaba antes de todo esto, un casillero de este navegador en
  `UI.sprints`.
  - **Y por eso quedarse sin nombre ya no siempre borra la fila.** Sigue valiendo que una fila sin
    nombre no existe —el bloque vuelve a llamarse «Grupo N»— pero solo si esa fila no guarda
    además dónde está el bloque: borrarla ahí le movería la columna a un grupo por haberle
    vaciado el rótulo, que son dos cosas que no tienen nada que ver. Quién decide es
    `fijarNombreGrupo()`, que es el único que sabe las dos.
- **`modulo` es la columna «Área».** Era un campo muerto del tablero viejo, ya estaba en la
  base y ya lo guardaba `guardarTarea()`: revivirlo no costó una migración.
- **`dep` («Depende de») es texto libre a propósito**, no una relación entre tareas. La
  mitad de las dependencias reales no son otra tarea del tablero, y obligarlas a serlo hace
  que nadie las anote.
- **El Loom ya no es un campo ni una condición** (26/8/2026). Fue un input propio en la barra
  de clasificación, una pill en la fila, una entrada del menú `⋯` y el corte que frenaba el
  pase al tablero. Se sacó todo por pedido: frenar el pase por un campo vacío hacía que la
  regla se peleara con el trabajo en vez de ayudarlo. En su lugar, **toda tarea nace con el
  renglón `LOOM: ` escrito en la explicación** (`TEXTO_LOOM` en `tareaVacia()`) y el enlace
  se pega ahí adentro como cualquier otra cosa. La columna `loom` sigue en la base con lo que
  tenía cargado —`guardarTarea()` la escribe igual— pero ya no hay pantalla que la edite: no
  se migró nada. `pasarAlRoadmap()` conserva su `true`/`false` aunque hoy ya no rechace nada.
- **`TEXTO_LOOM` va como texto plano y no como bloque.** La explicación de la ficha se edita
  solo mientras `expl` no esté en bloques (ver `pintarExpl()`), así que nacer en bloques
  dejaría a toda tarea nueva con su campo de solo lectura. Por lo mismo, `borrarDeBacklog()`
  no cuenta ese renglón como algo escrito: si contara, una fila recién creada preguntaría
  antes de borrarse igual que una con media página adentro.
- **Se entra a la tarea por el `▤` de la izquierda**, que es `[data-pagina]` y llama a
  `abrirPagina()`. Ese símbolo significa lo mismo acá que adentro de una página: entrás a un
  documento. La **ficha** —el modal de siempre, con conversación, archivos y campos— **ya no se
  abre desde una fila** (26/8/2026, por pedido): estuvo unas horas en el menú `⋯` y se sacó el
  mismo día, junto con el botón de la cabecera de la página. Desde una fila, entrar a la tarea
  es entrar a la página. Ver el cuadro de la ficha, más abajo, para lo que quedó de ella.
- **El plegado es del navegador de cada uno**, no del tablero. Que alguien pliegue el Sprint 3
  para leer cómodo no tiene por qué plegárselo a los demás.

**El formato es el del diseño de Claude Design (26/8/2026): una lista de renglones, no una
rejilla.** Hasta ese día fue un `grid` de once columnas. Se reemplazó por pedido explícito, y
la lista pasó a usar **las mismas clases `pg` que la página de una tarea**: son el mismo
componente. La vista sigue marcándose con `bmode` en el board; lo propio de acá son
`bkwrap`, `bksprint`, `bktarea` y las pills.

- **Los grupos van repartidos en las mismas tres columnas del tablero** (26/8/2026, por pedido,
  clase `bkcols`), y esto contradice a propósito lo que valía hasta ese día.
  - **Y cuál va en cuál lo decide el que acomodó la hoja** (26/8/2026, por pedido): el bloque se
    arrastra de una columna a otra con el `⠿` de su canaleta y se queda donde lo dejaron
    (`columnasDeGrupos`, `moverGrupo`). Esto también contradice a propósito lo que valía ese
    mismo día —el corte era **en orden y de a tramos**, así que se leía 1, 2, 3, 4 bajando por la
    izquierda y siguiendo por la del medio, como las columnas de un diario—. **Contrapartida
    asumida y real**: dónde está el Grupo 4 ya no se deduce de nada. Se paga porque los bloques
    dejaron de ser una cadencia el día que se les puso nombre —«Onboarding», «Lo de la AFIP»— y
    cuál va al lado de cuál lo sabe el que los escribió, no el orden en que se crearon.
  - **El lugar es del tablero y no del navegador**, igual que el nombre y al revés que el
    plegado: acomodar la hoja es una decisión sobre la hoja, y que cada uno la viera acomodada
    distinto sería justo lo contrario de acomodarla. Va en la misma fila de `roadmap_notas` que
    ya guarda el nombre (ver el cuadro de la tabla), así que tampoco necesitó migración.
  - **O están ubicados todos los bloques o no lo está ninguno.** Mientras nadie haya arrastrado
    nada, el reparto es el viejo, en tramos; el primer arrastre escribe la ubicación de todos de
    una sola vez, y por eso `moverGrupo()` reescribe el reparto entero y no solo el bloque que se
    movió. Con la mitad ubicada y la mitad no habría que inventar una segunda regla para decir
    dónde entra la que no lo está, y esa regla se contradice con la primera al día siguiente. El
    que aparezca después sin lugar propio —un grupo recién creado, «Sin planificar» cuando se
    llena— cae al pie de la última columna, que es donde nace todo lo nuevo acá.
  - **Contrapartida asumida** del reparto viejo, que sigue valiendo mientras nadie acomode nada:
    el corte es por cantidad de bloques y no por altura, así que un grupo de treinta tareas
    frente a uno de dos deja una columna mucho más larga. Balancear por altura pondría el Grupo 4
    arriba del 3, que es justo lo que la secuencia no permite.
  - **El reparto de ancho se copia y no se deduce.** Es 1.18 / 1.18 / 0.64 como el de los
    estados, y ahí ese número sale del contenido —Nueva y En curso contra los tres finales del
    camino—. Acá los grupos son intercambiables entre sí y ninguno merecería menos ancho que
    otro. **Contrapartida asumida**: los últimos entran más angostos sin que eso signifique nada
    sobre ellos. Se paga porque las dos listas tienen que leerse igual; fue un `1fr 1fr` en dos
    columnas durante unas horas y se descartó por pedido.
  - **El asa del bloque es el mismo `⠿` de una tarea, en el mismo lugar de la canaleta.** Adentro
    del bloque la fila se arrastra para cambiarla de bloque; acá el bloque se arrastra para
    cambiarlo de columna. Un asa distinta para lo mismo un nivel más arriba sería un control que
    hay que aprenderse aparte. **La lista por estado no lo lleva**: ahí la columna de cada bloque
    la fija `COLUMNAS_LISTA` y no una preferencia de nadie, y es el `data-col` de la columna
    —que solo dibuja el backlog— lo que hace que el manejador compartido no acomode nada del
    otro lado.
  - **El corte se hace contra el bloque entero —cabecera más lo que le cuelga— y no contra la
    cabecera sola** (`suelteDeGrupo`). Con veinte tareas colgando, el medio de la cabecera cae en
    el primer centímetro de un bloque de media pantalla y todo lo demás contaría como «abajo de
    todo». Y mientras dura el arrastre las columnas cortas llevan un piso (`.mueve-grupo .bkcol`):
    si una termina a media pantalla, lo que se suelte más abajo cae en el hueco de la grilla, que
    no es de nadie.
  - **Un solo «＋ Nuevo grupo», al pie de la última columna**, aunque el diseño le ponga uno a
    cada una. El que nace es siempre el N+1 y aparece siempre ahí —después se lo arrastra a donde
    tenga que ir—, así que dos botones que hacen lo mismo pero prometen dos lugares distintos
    serían un botón que miente.
  - **El montón de pastillas pegado al título se esconde acá también** (26/8/2026, por pedido).
    Estuvo unas horas quedándose —media pantalla por columna alcanzaba— y se fue: la fila tiene
    que presentarse igual de los dos lados, y un racimo que cambia de largo en cada renglón es
    justo lo que rompe que la lista se lea bajando por la columna. El código, de qué depende y
    de qué área es se ven entrando a la tarea. La regla es una sola para las dos listas:
    `.bkcols .bktarea .pgpills{display:none}`. La antigüedad estuvo unas horas saliendo del
    montón para mudarse a una columna fija, y ese mismo día se fue de la fila entera.
  - **«→ Al tablero» es lo ÚNICO que la fila del backlog tiene de más**, y por eso paga 30px en
    vez de 88: queda en la flecha sola, con el rótulo adentro de un `.irtxt` que el CSS esconde
    —un solo HTML para los dos anchos, como el riel y los avatares—. No se esconde en el menú
    `⋯` como se escondió el resto: mandar tareas al tablero es lo que se viene a hacer acá.
  - **La antigüedad no se dibuja en la fila, de ninguna forma** (26/8/2026, por pedido). Estuvo
    unas horas siendo columna fija —58px, sin el «hace», exactamente en el lugar y con el ancho
    de la prioridad del otro lado— y se fue el mismo día: contar días es una cuenta del tablero,
    y hacerla también en la lista de lo que todavía no empezó era la misma pregunta contestada
    en dos pantallas con dos relojes. Lo que quedó del dato acá es lo que no escribe números: el
    color del riel y el «N sin salir» del grupo. Con la columna se fue el segundo argumento de
    `pillEdad()`, que ahora va siempre con el «hace» porque solo se dibuja en la cabecera de la
    página, donde no hay columna que respetar.
- **El riel de la puerta dice antigüedad** (26/8/2026, por diseño). En el tablero el riel se
  pinta de la prioridad; acá no hay prioridad a propósito, así que hasta ese día caía en gris y
  no decía nada. Ahora dice lo único que el backlog tiene para decir sobre qué apremia: cuánto
  hace que algo está anotado y todavía no salió. Son dos lecturas del mismo riel según el lado,
  y está bien que lo sean — de un lado se mira qué es urgente, del otro qué se está pudriendo.
  - **El umbral es uno solo** (`UMBRAL_VIEJA`, 30 días). El color del riel, el «N sin salir» de
    la cabecera del grupo y la pastilla ámbar de la página de la tarea (`.pgpill.rancio`, que
    pisa a `.edad`) son el mismo dato en tres escalas: con el número escrito en tres lugares se
    contradicen la primera vez que alguien toque uno, y un riel ámbar dentro de un grupo que
    dice «0 sin salir» no se le explica a nadie.
  - **Ámbar y no rojo.** Dos meses anotada no es una alarma, es algo que hay que mirar. El rojo
    ya está tomado por las críticas del tablero y por la chapa de novedad.
  - **Lo ámbar es solo del backlog** (`t.backlog && esVieja(t)`, la marca la da la fila y no la
    vista). En el tablero la antigüedad es contexto —hace cuánto se creó— y no un reproche: ahí
    la tarea ya está en la cancha, y encima el número que se muestra cuenta otra cosa.
  - **No se migró nada**: sale toda de `creada`, que ya estaba en la fila.
- **La pantalla no tiene encabezado** (26/8/2026). Tenía miga («Backlog»), contador
  («4 tareas · 3 bloques»), título y bajada. Se sacaron los cuatro por pedido: la barra
  lateral ya dice dónde estás y cada sprint ya lleva su contador al lado del nombre, era medio
  scroll de repetir lo obvio. El aire de arriba lo pone ahora `.bkwrap{padding-top}` — sin
  eso la lista arrancaría pegada al borde. La página de una tarea **sí** conserva su miga y
  su título: ahí la jerarquía no se ve de otra forma.
- **Los sprints son los renglones desplegables y las tareas los renglones `▤` que cuelgan de
  ellos.** El árbol no se guarda en ningún lado: se arma en cada pintado. Un sprint no es
  fila de ninguna tabla —es el número que tiene cada tarea en `sprint`—, así que plegarlo,
  contarlo o crear uno nuevo no toca la base.
- **El desplegable del sprint es un botón entero (`.bkfold`), no una flechita al costado**
  (26/8/2026). Hasta ese día el único lugar donde se podía tocar para abrir un sprint era el
  `.pgcar` de siempre: un carácter de 9px, sin fondo y apagado hasta el hover. Abrir y cerrar
  bloques es *la* acción de esta pantalla y no puede ser la más difícil de acertar. Ahora la
  flecha, el nombre y el contador de actividades viven adentro de un mismo botón con marco
  propio. El contador va ahí adentro y no en las pills de la derecha porque, plegado, es el
  único dato que queda a la vista.
  - **Y por eso la pill «N por hacer» de la derecha se sacó** (26/8/2026, por pedido): decía
    con palabras el mismo número que el `.bkn` del botón, a dos centímetros de distancia y en
    el mismo renglón. El «N sin salir» se queda, que ese cuenta otra cosa y solo aparece
    cuando hay algo que decir.
- **Al abrir un sprint lo que tiene que saltar a la vista es el título de cada actividad**, no
  las catalogaciones: es el dato por el que se abrió el bloque. Por eso `.bktarea .pgtxt` pesa
  más que el texto de un renglón de página común.
- **Al lado del título NO va el arranque de la explicación.** Existió un rato el 26/8/2026
  (`resumenDeExpl()`, clase `bkexpl`, en el hueco entre el título y las pills) y se sacó el
  mismo día por pedido: media línea de texto tenue recortada al medio se lee peor que el hueco
  vacío, y de qué se trata la tarea se ve entrando a la página, que está a un clic del `▤`.
  Con eso volvió también la fila sin la clase `conexpl`.
- **Las catalogaciones van todas a la derecha, en pills**, y desde el 26/8/2026 en dos zonas:
  las que se comparan entre filas —quién la hace, «→ Al tablero»— en columnas de ancho fijo, y
  las que solo acompañan —código, dependencia y área— juntas contra el título. Las que no tienen
  valor no dibujan nada: una columna de guiones no dice más que el hueco. La única excepción es
  quién la hace. Es el mismo reparto de la fila del tablero, con dos columnas menos: acá no hay
  prioridad y tampoco días. La regla completa está en el cuadro «El tablero es una lista».
- **En el backlog no hay prioridad, y no es que esté escondida: no se puede poner**
  (26/8/2026, por pedido). Lo que está anotado todavía no se está haciendo, y ponerle
  «crítica» a algo que nadie empezó es una urgencia inventada que después llega al tablero
  envejecida. Se decide cuando la tarea entra a la cancha. Son dos puertas y hay que cerrar las
  dos, porque con una abierta la regla no vale: la pill de la fila (`pillPrioridad()`, que mira
  `t.backlog` y no la vista, así vale también adentro de la página de la tarea) y el `<select>`
  de la ficha, que se esconde —no se deshabilita: un campo gris invita a preguntar por qué no
  anda—. Fueron tres hasta que se sacó la barra de acciones en lote, con su «Prioridad ▾». El
  campo igual se guarda con el `semanal` de fábrica: no se migró nada y no hace falta.
- **Y por eso el pase al tablero la pregunta, sí o sí** (26/8/2026, por pedido). Es la
  contracara de la regla de arriba: si la prioridad se decide cuando la tarea entra a la
  cancha, el momento de entrar es el momento de elegirla. Antes el pase la dejaba pasar con
  el `semanal` de fábrica y el tablero se llenaba de semanales que nadie había elegido.
  - **El corte vive adentro de `pasarAlRoadmap()` y no en cada botón**, igual que
    `alternarPend()` con los responsables. Son cuatro puertas —la pill «→ Al tablero» de la
    fila, el menú `⋯`, la ficha y la cabecera de la página— y con una sola olvidada la regla
    no valdría. `pasarAlRoadmap(t, anclaje, ev)` solo abre el menú; el pase de verdad —apagar
    `backlog`, prender `hoy`, reordenar y persistir— es `alTablero(t, prioridad)`, que es
    ahora la única puerta que toca la marca.
  - **Pregunta SIEMPRE, no solo cuando falta.** Toda tarea nace con `prioridad:'semanal'`, así
    que «ya tiene prioridad» sería verdad para las cuarenta y la pregunta no aparecería nunca:
    lo guardado es un valor de fábrica, no una decisión de nadie. El ✓ del menú lo marca igual
    —dice de dónde parte— pero elegir es obligatorio.
  - **Cerrar el menú sin elegir no pasa nada**, misma regla que `pedirResponsable()`: dejar la
    tarea ya pasada esperando una prioridad la guardaría con la de fábrica ante cualquier
    recarga, que es justo lo que se quiere evitar.
  - **El anclaje lo pasa quien llama**, porque no siempre es el elemento que se clickeó: desde
    el menú `⋯` la fila se repinta antes de abrir el menú y el botón viejo ya no existe, así
    que se vuelve a buscar en la fila nueva, igual que hacen `pend` y `grupo`.
  - **Al pasar, la ficha abierta sobre esa misma tarea se repinta entera** con `abrirTarea()`:
    el botón dice lo contrario y el `<select>` de prioridad, que el backlog escondía, vuelve.
- **Quién la hace es UNA pill con todos los nombres adentro, no una por persona.** Abre el
  menú donde se prenden y se apagan; con una pill por cabeza no habría dónde tocar para
  agregar a la segunda. Cuando no hay nadie igual se dibuja («Sin asignar») porque es justo
  el caso en que hay que poder tocarla. Ese menú **no se cierra al elegir**: asignar a tres
  es marcar tres, y cerrarlo en la primera obligaría a abrirlo tres veces.
  - **En columnas es el avatar y no la pastilla** (`.bkav`), la misma regla que ya tenía el
    tablero-lista. Las dos formas van SIEMPRE al HTML y el CSS esconde la que no corresponde:
    cuál se dibuja es una pregunta de ancho de pantalla, y el ancho no se sabe desde el JS.
  - **El avatar de la fila mide 23px y no los 19px del `.av.mini` de todos lados**
    (26/8/2026, por pedido). Acá no acompaña a un nombre escrito al lado: **es** el nombre, y
    encima es el blanco al que hay que apuntarle para cambiar el responsable. Se sube en
    `.bkav .av.mini` y no en `.av.mini`, que también lo usa la identidad de la barra lateral —
    ahí sí acompaña a un nombre y 19px están bien.
- **En el tablero-lista la prioridad sí está, y es una pill-botón y no una entrada del menú
  `⋯`**: ahí es la que más se cambia, y meterla en el menú serían dos clics para lo que se
  hace veinte veces por semana. Estuvo un rato en el menú el 26/8/2026, mientras la pastilla
  salió de la fila en columnas; volvieron las dos cosas atrás el mismo día.
- **El menú `⋯` es el equivalente del `＋` del diseño.** Adentro de una página ese botón
  inserta bloques; en la lista, una tarea no tiene bloques que insertar pero sí cosas que
  cambiar: **son cuatro —sprint, ficha completa, pase al tablero y borrar—**. «Ficha completa»
  salió y volvió el 26/8/2026: es la única puerta que le queda a la ficha desde que se fueron
  las tarjetas, y es también la única entrada del menú que no toca la tarea (ver el cuadro de
  la ficha).
- **El botón «→ Al tablero» de la fila se sacó y volvió el mismo día** (26/8/2026, las dos
  veces por pedido). Se había ido por ser un botón por renglón —cuarenta en pantalla— para
  algo que se hace una vez por tarea; volvió porque mandar tareas al tablero es *lo que se
  viene a hacer* al backlog cuando arranca el grupo, y tenerlo en el menú `⋯` son dos clics
  por tarea. La diferencia con la primera versión es dónde vive: ahora es una pill más, al
  lado de la prioridad y de quién la hace, y no un botón suelto al final del renglón.
  - **Va enganchado a las columnas y no al final de las pills** porque las columnas son las
    únicas que se dibujan siempre: así queda en el mismo lugar en las cuarenta filas, en vez de
    bailar según la fila tenga o no área o dependencia.
  - **Solo lo dibuja el backlog.** Quién lo dibuja lo decide quien llama y no `pillPase()`
    mirando la vista: la cabecera de la página de la tarea usa estas mismas pills y ya tiene
    su propio «→ Al tablero», así que preguntando por la vista se dibujaría dos veces el mismo
    botón. Que la fila esté ahí ya alcanza para saber que todavía no salió — la que sale se va
    de la lista. Los otros caminos siguen intactos: el menú `⋯` y la cabecera de la página.
- **El panel de planificación de la fila se eliminó.** Era donde vivían Área, «Depende de»,
  Estado y Tipo; se mudaron a la ficha —Tipo salió del tablero entero ese mismo día, ver el
  modelo de datos—. La explicación ya no se edita en la lista
  bajo ningún concepto: dos editores sobre el mismo `expl`, uno de bloques y otro de HTML
  plano, se pisan el formato.
- **Los manejadores del backlog se cuelgan del board entero, por delegación**, y `render()`
  los suelta al salir de la vista. Si no, siguen escuchando encima del tablero. La caja
  cuelga los suyos igual, así que cada una apaga a mano los que la otra usa y ella no.
  Ojo con usar `addEventListener` ahí: la lista se repinta entera ante cualquier cambio y se
  acumularía un listener por repintado (por eso son `board.onclick`, `board.oninput`…).
- **La canaleta tiene dos controles y no tres**: el `⋯` y el `⠿`. El casillero de marcar se
  sacó el 26/8/2026 con toda la selección múltiple — ver el cuadro «El tablero es una lista», donde
  vive esa regla.

**Arriba de todos los grupos va la hoja de notas** (26/8/2026, por pedido): un cuadro del ancho
de la hoja para escribir a mano lo que no es una tarea —un pendiente suelto, algo que hay que
preguntar—. Existe porque el backlog es lo único que se mira antes de repartir trabajo, y hasta
ahora la única forma de anotar algo ahí era crear una tarea, que después hay que clasificar,
asignar y sacar.

- **Es texto plano y no bloques.** Es una nota al margen, no un documento: con bloques habría que
  decidir dónde vive el árbol, qué pasa al arrastrar y cómo se anida, media pantalla de reglas
  para algo que se escribe en diez segundos. Lo que se pega entra como texto y por eso tampoco
  hace falta un sanitizador — la misma regla que la Explicación de la ficha.
- **No puede robarle la pantalla al backlog**, que es a lo que se vino. El cuadro crece con lo
  escrito desde tres renglones hasta 148px y de ahí en más se scrollea solo. Un alto fijo dejaría
  un cuadro grande y vacío la mayor parte del tiempo; sin techo, media pantalla de notas empuja
  los grupos abajo del pliegue.
- **Lo escrito es del tablero y el plegado es de cada uno**, el mismo reparto que ya tienen los
  grupos: el texto en la base (`localStorage` haría que cada uno viera notas distintas, que es lo
  contrario de dejarle algo anotado al otro) y el plegado en `localStorage` (que alguien la cierre
  para ver más grupos no tiene por qué cerrársela a los demás).
- **Vive en `roadmap_notas`, en una fila con id propio (`nota-backlog`)**, y no en una columna
  nueva: es la segunda cosa que usa esa tabla y para eso estaba el prefijo en el `id` de los
  grupos. Ojo con las tres columnas: en una fila de grupo `texto` es el número de columna de la
  hoja y `orden` la posición; en la de la nota `texto` es lo escrito, `titulo` va vacío y `orden`
  no ubica nada. Leer una por la otra pinta un grupo llamado «acordate de llamar al contador».
- **Vacía no se borra la fila**, al revés que el nombre de un grupo: el cuadro está siempre en
  pantalla, así que la fila en blanco y la fila que no existe son el mismo estado.
- **Va solo en el backlog y no en el tablero-lista**, aunque las dos listas sean el mismo
  componente: la nota es de la planificación, y arriba del tablero sería un cuadro de texto libre
  compitiendo con el trabajo del día. Va además **afuera de `.pgbody`** — adentro sería una caja
  más de la grilla de tres columnas y se metería en una sola.
- **Se guarda con retraso (700ms) y al salir del campo**, no tecla por tecla, y **lo que todavía
  no confirmó la base gana sobre lo que llega por realtime** (`notaEnVuelo`). Es la misma regla
  que la página de una tarea: sin eso, un cambio de otro recarga `datos` y pisa en pantalla lo
  que estás terminando de escribir.
- **Se engancha a mano y no por delegación**, igual que el nombre de un grupo: `engancharLista()`
  anula `oninput`, `onpaste` y `onkeydown` del board a propósito —son de la caja— y hay un solo
  cuadro, que nace de cero en cada repintado.

**Historial de la pestaña**, para no volver a caminarlo: fue un enlace a Notion, después una
hoja de texto libre con renglones anidados (`roadmap_vision`, borrada el 15/8/2026 sin haber
llegado a correrse), después una lista tipo Notion con los controles escondidos, después una
`<table>` estilo planilla, después una rejilla `grid` de once columnas, y desde el 26/8/2026
esta lista de renglones. Ojo con lo que parece contradicción: la lista de 2026 se descartó
por esconder los controles, y esta los esconde de nuevo. La diferencia es que ahora lo que
quedó a la vista son las catalogaciones —lo que se viene a mirar— y lo escondido son las
acciones. Antes era al revés.

### La tarea como página

Entrar a una tarea abre un documento tipo Notion (`renderPagina()`, clases con prefijo `pg`,
la vista se marca con `pgmode` en el board). Se agregó el 26/8/2026 a partir de un diseño
hecho en Claude Design.

**Una tarea se ENTRA, no se despliega.** El diseño proponía que cada tarea se abriera en el
lugar; se cambió por una página aparte porque desplegar tres para compararlas empuja el
resto del sprint fuera de pantalla, y la lista existe para ver el sprint entero. Los sprints
sí se despliegan: son cuatro, no cuarenta.

**Y como se entra, el «atrás» del navegador tiene que sacarte** (26/8/2026, por pedido). Hasta
ese día la app no tocaba el historial —una sola URL, cero entradas—, así que entrar a una tarea
y apretar atrás te sacaba del tablero entero. Ahora cada nivel al que se entra —la tarea y cada
subpágina— apila una entrada con la ubicación adentro.

- **`popstate` es la única puerta que mueve dónde estás parado.** Entrar apila y se mueve en el
  mismo acto (la entrada todavía no existe, no hay nada que esperar); **todo lo que sale
  —Escape, la miga de pan, el «Tablero» del principio— le pide al navegador que retroceda**
  (`volverAProfundidad()`) y se mueve recién cuando el navegador contesta. Que las dos formas de
  salir escriban en el mismo lugar es lo que mantiene el historial y la pantalla diciendo lo
  mismo. Al revés —que salir con Escape apilara una entrada nueva— «atrás» te volvería a meter
  en la tarea de la que acabás de salir, que es el defecto clásico de atar un botón de cerrar a
  un `pushState`.
- **La ubicación va entera en el `state` (`{t, r}`), no como un número de profundidad.** Así
  cada entrada sabe sola a qué tarea y a qué subpágina corresponde: adelante funciona igual que
  atrás, y no hay que reconstruir nada contando saltos.
- **`cerrarPagina()` fija la entrada en «el tablero»**, y por eso el `replaceState` vive ahí
  adentro y no en quien llama: los caminos que cierran la página sin que nadie navegue —la tarea
  borrada, la que desapareció por realtime— dejarían una entrada jurando que estás adentro de
  algo que ya no existe.
- **Al arrancar la ubicación sale del historial** (`restaurarUbicacion()`, llamada desde
  `arrancar()` justo antes del `render()`): recargar adentro de una tarea te deja adentro de esa
  tarea. Va ahí y no en el `let` de arriba porque necesita los datos cargados — sin ellos no hay
  cómo saber si la tarea que nombra el historial todavía existe. Sirve también para el
  logout/login, que vuelve a pasar por `arrancar()`.
- **`pushState` va con red** (`try`): tira si no hay origen —abrir el `index.html` con doble
  clic, sin servidor—. Que ahí no ande el «atrás» es aceptable; que no se pueda entrar a una
  tarea, no.
- **Ojo con la ficha**: el modal NO participa del historial. Abrirla desde el menú `⋯` de la
  fila y apretar atrás sigue sacándote de la app, porque nadie apiló nada. Es lo que queda del
  asunto — ver el cuadro de la ficha.

**La lista y la página son el mismo componente** y comparten las clases `pg`. Lo que cambia
es qué representa cada renglón: afuera, sprints y tareas; adentro, bloques de texto. Por eso
el `▤` significa lo mismo en los dos lados.

**Todo esto NO necesitó migración, y no fue casualidad.** El árbol de bloques vive en la
columna `expl` de siempre, detrás de una tercera marca (`<!--b-->`, ver más arriba). Y las
subpáginas **no son tareas**: no tienen código, ni prioridad, ni salen al tablero. Son hojas
adentro de la tarea. Si fueran tareas haría falta `padre_id` en `roadmap_tareas` — con la v5
y la v7 todavía sin correr, eso era condenar la pantalla a esperar.

**El título de la tarea es un cuadro y no un titular** (26/8/2026, por pedido). Fue 29px de
`--display` con el interletrado apretado —una tipografía de display— y los títulos de este
tablero son frases largas: tres renglones a esa escala son media pantalla antes de que
empiece la página. Ahora es texto: la fuente del cuerpo, 16.5px, `line-height` de párrafo.
**Lo que dice que es el título ya no es el tamaño sino el marco** —caja blanca, borde y un
riel de acento a la izquierda, el mismo lenguaje del riel de la fila—, y eso es justo lo que
hace que una frase de tres renglones se siga leyendo como una frase. Sigue siendo el mismo
`contenteditable` con `data-titulo`: cambió cómo se ve, no qué es.

**La cabecera perdió el grupo y «Ficha completa», y lo que quedó se agrandó** (26/8/2026,
por pedido). En qué grupo cae la tarea es un dato de la planificación y se mira desde el
backlog, donde los grupos son la estructura de la pantalla; acá adentro llenaba el renglón
con algo que nadie viene a ver. Y la ficha se abre desde el menú `⋯` de la fila, así que el
botón eran dos puertas al mismo modal, una de ellas peleando lugar con lo que sí se toca —
ese cuadro sigue valiendo aunque «Ficha completa» haya vuelto al menú horas después: desde
adentro de la tarea, un modal encima de la misma tarea no agrega nada.
Con la mitad de las pastillas afuera, prioridad, quién la hace y el pase al tablero pueden
pesar lo que valen: **el aumento vive en `.pgmeta` y no en `.pgpill`**, que es de las dos
listas —ahí hay cuarenta renglones y las pastillas tienen que ser discretas para que se lea
el título; acá hay una tarea sola y son los únicos controles del encabezado—. La antigüedad
es la única que se queda chica y tenue: es contexto, no algo que se toca. Con el botón se
fue también su manejador `[data-ficha]`; el `sprint` de `abrirMenu()` sigue vivo porque lo
usa la lista.

- **Seis tipos de bloque** que se dibujan: `text`, `h`, `toggle` (se despliega), `check`,
  `page` (se entra), `file` (se adjunta). Solo `toggle` y `page` anidan. El séptimo, `hdr`,
  es el cuadro de avisos y no se dibuja nunca entre los bloques (ver abajo).

### El archivo como renglón

Cualquier renglón puede ser un archivo (`file`, 26/8/2026). Reemplazó a `img`, que era solo
una imagen pegada.

- **Es UN tipo para todo lo que se adjunta, no uno por formato.** Una imagen es un archivo
  que además se puede dibujar, no otra cosa. Con un `img` aparte, la misma captura se
  comportaría distinto según si se pegó con Ctrl+V o si se eligió del disco.
- **Dos estados, un solo dato**: `open`. Plegado se ve la ficha del archivo —ícono, nombre y
  peso— y el nombre lo abre en una pestaña. Desplegado se ve además el contenido acá mismo:
  la imagen pegada en la hoja, el PDF o el HTML en un marco. **La ficha no desaparece al
  desplegar**: una imagen suelta en el medio de la página no dice de qué archivo salió ni
  deja dónde apretar para bajarla.
- **La imagen nace desplegada y el resto plegado.** Es lo que uno quiso en cada caso: una
  captura se pega para verla ahí, un PDF se adjunta para tenerlo a mano.
- **Lo que no se puede dibujar no muestra la flecha.** `seVeAdentro()` son imagen, PDF y
  cualquier `text/*`; de un zip o un `.docx` no hay nada que mostrar, y una flecha que al
  apretarla no hace nada es peor que no tenerla. El marco va con `sandbox` **sin**
  `allow-scripts`: lo adjunta el equipo, pero un `<iframe>` con permiso de ejecutar sobre
  cualquier HTML que alguien pegue es una puerta que no hace falta abrir.
- **Una sola puerta de entrada**: `subirArchivosEnPagina()`. La usan los tres caminos —pegar,
  soltar del escritorio y elegir del disco desde el menú `＋`—. Con tres copias serían tres
  formas distintas de fallar a mitad de camino. Y **acá adentro el archivo se queda en el
  renglón**, sea imagen o no: en la ficha el que no era imagen se iba a los adjuntos de abajo
  porque no había forma de dibujarlo en un renglón, la página sí la tiene.
- **El enlace se firma al pintar, nunca en el clic.** Pedir la firma después de que el usuario
  apretó llega tarde: el navegador ya bloqueó la pestaña por venir de un `await`. De eso se
  ocupa `refrescarFirmasDeExpl()`, que es la misma función para los tres —imagen, marco y
  enlace—: quien lleve `data-path` se firma.
- **Los `img` viejos se convierten al leer** (`normalizarArchivos()`), no con una migración: la
  fila se reescribe recién cuando alguien la guarda, igual que ya pasó con el texto plano y
  con el HTML.

### El cuadro de avisos

Arriba de todo en la página de una tarea. Lo que se escribe ahí **queda resaltado en rojo
hasta que alguien le pone «visto» o lo borra**. Es el lugar para dejarle algo a quien entre
después, sin abrir la conversación de la ficha.

- **Es UN cuadro y sin firma a la vista.** Se probó primero con un renglón por persona y se
  descartó: elegir a quién antes de poder escribir es justo lo que hace que no se anote nada.
  Quién lo escribió y cuándo quedan en el `title` — el cuadro tiene que leerse de un vistazo y
  una firma por renglón lo llenaría de nombres.
- **El destinatario existe desde el 26/8/2026, y es opcional y posterior a escribir**
  (por pedido). Lo de arriba sigue valiendo entero: el aviso se manda con Enter como siempre y
  recién ahí, si hace falta, se le pone nombre con el botoncito del renglón. Elegir nunca
  bloquea el paso de anotar — eso es lo que se descartó, no el destinatario en sí.
  - **`para` vacío significa «para todos»**, que es exactamente lo que valía para cada aviso
    antes de que el campo existiera: por eso no hay nada que migrar, ni en la base (vive en el
    árbol de `expl`, como el resto del cuadro) ni al leer. Todo lo que lo lee pasa por
    `destinatariosDe()`, que además filtra a quien ya no está en `users` (hasta el 29/9/2026, `APP_CONFIG.personas`): un
    aviso dirigido a alguien que se fue se volvería invisible para todos.
  - **Acá SÍ se puede sacar al último**, al revés que `pend` y que `carga`. Quitar a todos no
    deja el aviso sin dueño: lo devuelve al equipo, que es el estado de fábrica.
  - **Decide a quién le SUENA la chapa, no quién puede leerlo.** El aviso se dibuja igual para
    cualquiera que entre a la tarea: el cuadro es de la tarea, no un buzón.

**Adentro del cuadro no hay contador** (26/8/2026, por pedido). Al lado del rótulo iba la
pastilla «N sin ver» y se sacó: decía en números lo que la lista de abajo ya muestra renglón por
renglón y en rojo, y aparecía pegada al campo justo cuando uno va a escribir un aviso nuevo. Que
hay algo sin ver lo sigue diciendo **el borde rojo del cuadro** (`.pghdr.hay`), que es lo que se
ve antes de leer nada; para eso alcanza con saber si hay o no hay, así que `sinVer` pasó de
contar (`.filter().length`) a preguntar (`.some()`). La chapa de la fila, que es la que avisa
desde afuera, no se tocó.
  - **El avatar y además el nombre escrito** (26/8/2026, por pedido). Estuvo siendo el avatar
    solo, con el argumento de que el renglón tiene que leerse de un vistazo y tres nombres al
    lado pesan más que el aviso; se corrigió por el otro lado. Un círculo con una «L» adentro
    solo le dice algo al que ya se lo sabe de memoria, y el destinatario es justo lo que hay
    que poder leer sin pasar el cursor por encima — la misma razón por la que la pastilla de
    prioridad se quedó al lado del riel en la fila de la lista. El nombre se recorta con puntos
    suspensivos y la lista entera sigue estando en el `title`, así que el que manda sigue
    siendo el aviso.
  - **Sin nadie elegido dice «Sin destinatario», escrito y en ámbar.** Era un punto hueco y
    tenue que se prendía con el hover del renglón: de los dos estados, el invisible era
    justamente el que hay que notar. Ámbar y no rojo, la misma escala que lo rancio del
    backlog: es algo para mirar, no una alarma — y acá el rojo ya significa «sin ver». **Ojo
    con lo que dice el cartel**: vacío no es que el aviso no le llegue a nadie, es que le suena
    a todo el equipo (ver dos puntos más arriba), y eso lo aclara el `title` porque en el
    renglón no entra.
- **El visto lo pone cualquiera**, no una persona en particular: el aviso es de la tarea, y
  uno ya resuelto en una llamada tiene que poder apagarse sin esperar a nadie. Queda quién lo
  apagó en `vistoPor`.
- **Vive en `expl`, como un bloque `hdr` más del árbol** (`{avisos:[{id,texto,autor,ts,visto}]}`),
  y no en una columna nueva: con la v5 y la v7 pendientes, una columna sería condenar la
  pantalla a esperar a que se corra una migración. Se saltea en `planosPagina()` —y ahí y no
  en quien llama, que es lo único que garantiza que ningún camino lo deje arrastrable o
  borrable— y `normalizarCabecera()` lo deja siempre primero y único.
- **No se crea al abrir.** `cabeceraDe()` puede devolver `null` y la pantalla pinta igual, con
  el cuadro vacío; materializa recién cuando alguien escribe un aviso. Mirar una tarea vieja
  no la convierte a bloques, que es la misma regla que ya tenía la página.
- **Un aviso no es la explicación.** Por eso `textoDeBloques()` los saltea: alimenta el
  resumen de la fila del backlog y el CSV, y un «fijate el endpoint» ahí se leería como de qué
  se trata la tarea. Al buscador se los suma `textoBuscable()` por su lado.
- Solo va en la raíz de la tarea, no en las subpáginas: repetirlo en cada nivel haría que el
  mismo aviso pareciera tres avisos distintos.

### La chapa de novedad

La chapita roja sobre la actividad cuando adentro hay algo que todavía no se miró. **Son dos
cosas distintas con el mismo cartel a propósito**: la pregunta que contesta es una sola —¿hay
algo nuevo acá?— y dos chapas distintas obligarían a aprenderse cuál es cuál antes de que
sirvan para algo.

**Se dibuja en las dos listas, pero no dice lo mismo en las dos** (26/8/2026). Estuvo un rato
siendo del tablero y de nadie más; ahora la fila es la misma de los dos lados y la chapa va
siempre. Lo que cambia es qué la enciende: en una fila del backlog no aplican las dos causas del
tablero —`nuevaSinAbrir()` y `prioridadSinVer()` cortan por `t.backlog`, que ahí ni la tarea está
en el tablero ni tiene prioridad— y sí aplican los avisos sin ver. Mismo elemento, mismas reglas:
las que no aplican, no encienden.

**Entrar a una tarea desde el backlog sigue sin marcarla como vista**, y eso no cambió: el
backlog se lee entero y varias veces mientras se planifica, y si mirarla ahí contara, la tarea
llegaría apagada al tablero, que es justo donde tiene que llamar la atención.

- **Avisos sin ver que sean para mí**: un aviso sin destinatario es para todos, uno dirigido le
  suena solo a quien nombraron (ver el cuadro de avisos). El visto lo pone cualquiera y lo
  apaga para todos.
- **La actividad asignada a mí que todavía es nueva en el tablero y que este navegador no abrió
  nunca.** Son **dos datos y no uno**, y esa es toda la gracia:
  - Que **sea** nueva es compartido y vive en `roadmap_tareas.hoy`, la columna muerta de la
    vista «Hoy» reusada acá — misma jugada que `modulo` con el «Área». Se prende al nacer y se
    vuelve a prender **cada vez que una tarea pasa del backlog al tablero**: llega como nueva
    siempre, aunque se haya anotado hace dos meses, porque para el tablero recién aparece hoy.
  - Que **vos** ya la hayas abierto es del navegador de cada uno (`localStorage`,
    `tablero-vistas`), como el plegado del backlog: «yo no la abrí» es una pregunta sobre vos,
    no sobre la fila. Contra: si entrás desde otra máquina, la chapa vuelve.
- **La ve el responsable y no el equipo** (26/8/2026, por pedido). Hasta ese día la veía
  cualquiera, con el argumento de que una tarea que aparece en el tablero es algo que el equipo
  tiene que notar. En la práctica eso son cuarenta chapas rojas para todos y ninguna dirigida a
  nadie, que es el ruido que hace que se dejen de mirar. Sale de `pend` (`miTarea()`), que es
  el único lugar donde vive quién la hace. **Contrapartidas asumidas**: sin fila en `users`
  (hasta el 29/9/2026, identidad en `APP_CONFIG.personas`) no le suena a nadie —el tablero no sabe quién sos, mal puede decirte
  que algo es tuyo— y una tarea sin responsable tampoco, que es un caso que la invariante de
  `pend` ya no deja crear.
- **Lo que hacés vos no te avisa a vos.** Por eso `tareaVacia()` marca la tarea vista para vos
  al crearla: tu propia tarea recién anotada no es novedad tuya. Va ahí y no en cada uno de los
  tres creadores — con tres copias, olvidarse en una alcanza para que la regla no valga.
- **Y vuelve a sonar cuando le cambian la prioridad**, al mismo responsable y por el mismo
  motivo por el que suena al llegar: que algo que era semanal pase a crítica es exactamente el
  momento en que hay que volver a entrar.
  - **Por eso lo guardado por cada navegador dejó de ser «la vi» y pasó a ser con qué prioridad
    la vi**: `vistas` es un mapa `id → prioridad` y no un conjunto de ids. Sigue siendo del
    navegador de cada uno y no de la fila, así que tampoco acá hay migración de base.
  - **El formato viejo (`{ids:[...]}`) entra como `''`** —«vista, no sé con qué prioridad»— y
    `prioridadSinVer()` pide que la guardada exista. Sin eso, el primer pintado después de este
    cambio le encendería a cada uno todas las tareas que ya había mirado.
  - **Las cinco puertas que escriben `prioridad` pasan por `ponerPrioridad()`** —el menú, la
    ficha, las dos formas de arrastrar y el pase al tablero—, que es donde vive «lo que cambiás
    vos no te avisa a vos». La regla en un lugar y no en cada puerta: con cinco, olvidarse en
    una alcanza para que no valga. Solo pone al día la marca si YA existía: si nunca entraste,
    la chapa de «nueva» se queda esperando, que para eso está.
- **Con la marca compartida no hace falta ningún corte por fecha.** El `vistasDesde` que había
  hasta el 26/8/2026 existía porque un navegador sin nada guardado daba por no vista toda tarea
  que existiera y el primer día se prendían las cuarenta. Ahora solo se prenden las que alguien
  creó o mandó al tablero: las de antes de esta regla tienen `hoy` en `false` y no se encienden
  nunca. No se migró nada.
- `avisosSinVer()` mira la marca `"visto":false` **en el texto crudo antes de parsear**: son
  cientos de filas por repintado y un `JSON.parse` en cada una para no encontrar nada no se
  paga.
- Se apaga al **entrar** a la página (`abrirPagina()`), no al salir: ese es el momento en que
  efectivamente la miraste. Y solo si la tarea está en el tablero, por lo de arriba.
- **El `check` no guarda su texto: guarda un `sid` que apunta a la subtarea.** El checklist
  de verdad sigue siendo `subtareas`, con su responsable, su estado y sus archivos. Dos
  listas de pasos sobre la misma tarea sería la peor de las opciones: la de la ficha y la de
  la página se desincronizarían a la semana. `sincronizarChecks()` empareja las dos al abrir
  — tira los tildes cuyo paso ya no existe y agrega al final los pasos cargados desde la
  ficha que todavía no tienen bloque.
- **La ficha lee la página pero no la edita.** Un `contenteditable` suelto sobre un árbol de
  bloques lo aplastaría a HTML en la primera tecla. El atributo se pone a `false` y, además,
  `guardarExpl()` corta si `expl` está en bloques: el atributo frena el tipeado y el pegado,
  pero **no el `drop`**, y un archivo soltado encima llegaba igual hasta el guardado.
- **Los cambios de texto no repintan; los de estructura sí** (`guardarPagina()` vs.
  `cambiarPagina()`). Repintar mientras alguien escribe le tira el cursor a la primera letra.
- **`render()` rearma el árbol desde `expl` salvo que haya un guardado en vuelo.** Así un
  cambio de otro se ve al toque y lo que estás escribiendo no se pisa con una versión vieja.
- **Todo trabaja sobre `nivelPagina()` y no sobre `paginaArbol`**: al entrar a una subpágina,
  esa subpágina *es* la raíz. Si no, indentar o arrastrar podría sacar un bloque del nivel
  que estás mirando.
- **La página se abre desde cualquier lado**, no solo desde el backlog: la ficha del tablero
  tiene su botón. Por eso el ruteo está arriba de todo en `render()` y no adentro de la vista.
- **Dónde vive cada cosa**: la estructura en `expl`; el texto de cada tilde en `subtareas`;
  los archivos en el bucket, con el `{n,t,path,size,b}` colgado del bloque `file` (por eso
  `archivosDeExpl()` recorre el árbol — si no, borrar una tarea dejaría sus capturas y sus
  adjuntos ocupando lugar para siempre).

### Adjuntos y buckets

Cada archivo se guarda como `{n, t, path, size, b}`, donde `b` es el bucket del que salió.
Los adjuntos heredados del viejo tablero de Captalia traen `b: 'captalia-adjuntos'`; los
nuevos, el bucket principal. `RoadmapSync.urlFirmada(archivo)` y `.borrarArchivo(archivo)`
reciben **el objeto entero**, no el `path`, justamente para poder leer esa clave.

**Los buckets son privados y las direcciones, URLs firmadas que vencen.** `urlFirmada()`
es async, cachea por sesión y se llama **al pintar**, nunca para guardar: una URL firmada
guardada es un enlace muerto en unas horas. Por eso `pintarExpl` vuelve a firmar el `src`
de cada `<img data-path>` en cada pintado — el `src` que quedó escrito dentro de `expl`
(público de la época del bucket público, o firmado ya vencido) no sirve para pintar y no
hay que «migrarlo»: se pisa solo. El flip a privado se aplicó el 17/8/2026 (migración
`roadmap_buckets_privados`); la lectura la cubre la política `adjuntos_read` por miembro.

**La clave en el bucket no es el nombre del archivo.** Supabase valida las claves con un
regex ASCII: «Gestión CIMA.pdf» con su «ó» hacía fallar la subida entera con 400. La clave
sale de `claveLimpia()` (sin tildes, sin espacios); el nombre real vive en `n` y es el que
se muestra.

Lo que se pega o se adjunta dentro de la Explicación **no está en `t.files`**: vive en el
propio texto —en el bloque `file` si la tarea ya es una página, o colgado del `<img>`
(`data-path`, `data-b`) si todavía es HTML—. Por eso `borrarTodosLosArchivos()` suma
`archivosDeExpl(t.expl)`, que entiende los dos: si no, borrar una tarea dejaría sus capturas
y sus adjuntos ocupando lugar en el bucket para siempre. Quitar el renglón a mano sí deja el
archivo huérfano: se decidió no llevar la cuenta, como en cualquier editor.

### El detalle de la tarea

**La ficha tiene una sola puerta: «Ficha completa», en el menú `⋯` de la fila** (26/8/2026). Ese
día la puerta se mudó dos veces y conviene leer las dos juntas, porque la segunda contradice a
la primera a propósito:

1. **Salió del menú `⋯` y de la cabecera de la página**, por pedido. El argumento era que eran
   dos puertas al mismo modal y que la ficha ya colgaba de la tarjeta del tablero, que la abría
   con un clic. Desde una fila se entra a la tarea por el `▤`, que abre la página: la misma
   tarea con más lugar y sin un modal encima.
2. **Volvió al menú `⋯` unas horas después**, cuando se sacaron los dos layouts de tarjeta. Sin
   tarjeta, esa era la última puerta, y con las tres cerradas la conversación, los adjuntos
   sueltos y los campos que la página no dibuja quedaban guardados en la base sin ninguna
   pantalla que los mostrara. El motivo por el que se había ido —dos puertas al mismo modal—
   dejó de ser cierto justo cuando la otra dejó de existir.

**La cabecera de la página NO la recupera**: desde adentro de la tarea, un modal encima de la
misma tarea no agrega nada. Y va en el menú y no como pill de la fila porque se abre mucho
menos que entrar a la tarea, que es el `▤`.

**Contrapartida asumida**: la ficha dejó de ser el lugar donde se trabaja una tarea y quedó como
lo que le es propio —la conversación, los adjuntos sueltos y los campos que la página no
dibuja—. Lo que se toca todos los días vive en la página o en las pills de la fila. Todo lo que
sigue vale igual, que la ficha no se tocó por dentro.

La Explicación es un `contenteditable`, no un `<textarea>`: hace falta que una captura
pegada quede **adentro del texto**, en el lugar donde estaba el cursor, y un textarea pinta
un solo tipo de contenido. Tres cosas que dependen de eso:

- **Lo que se pega y no es una imagen entra siempre como texto plano.** Es la razón por la
  que no hay un sanitizador: si nunca entra HTML de otras páginas, no hay nada que limpiar.
  Un archivo que no sea imagen no se puede dibujar en un renglón, así que sigue yendo a los
  adjuntos de abajo.
- **La imagen se ve al instante con el archivo local (`blob:`) y recién después se cambia
  por la del bucket.** Mientras tanto lleva la clase `cargando`, y `leerExpl()` la saca de
  lo que guarda: un `blob:` muere al recargar la página. Entra sola cuando termina de subir.
- El manejador de pegado del campo hace `stopPropagation()`: sin eso, el del modal adjuntaría
  la misma imagen abajo por segunda vez.

Checklist, conversación y archivos son `<details>` que arrancan plegados si están vacíos —el
alto que no gastan es el de la Explicación—, y el estado abierto/cerrado se decide **solo al
abrir la tarea**. Si se decidiera en cada repintado, plegar una ficha a mano duraría hasta el
próximo tilde.

### Supabase / esquema

**Un solo archivo: `supabase/schema.sql`** (29/9/2026). Se corre una vez, entero, sobre un
proyecto vacío, y es idempotente. Reemplazó a la cadena `schema.sql` → v2 → v3 → v4 → v5 →
v7 → v8, que contaba cómo se llegó al esquema sobre el proyecto `propelia`
(`gvkdyxhxsnpumxlhvhsm`, compartido con el CRM). Esa cadena está en git; no hay que
reconstruirla. El archivo nuevo se armó **leyendo el catálogo en vivo** y no sumando los
viejos: la v8 figuraba como pendiente y en la base estaba corrida.

- **Las «migraciones pendientes» que se nombran en este archivo** (la v5 y la v8, «hay dos
  pendientes hace semanas») son historia: explican por qué se reusaron `modulo`, `hoy`,
  `tipo` y las columnas de `roadmap_notas`, y esos porqués siguen valiendo. En el esquema
  único la v5 ya está aplicada (no existen `roadmap_secciones` ni `sec_id`) y la v8 también.
- **El tablero se muda a un proyecto Supabase propio**: `migracion/PASOS.md`. Los datos
  extraídos (`migracion/02-datos-*.sql`) están en `.gitignore` — tienen la caja y emails.
- `RoadmapSync.faltantesDeEsquema()` sigue vivo: con una base a medio armar avisa en el
  triangulito de la barra lateral en vez de fallar en silencio. Cuentas, acceso y bucket en
  `PENDIENTES-BACKEND.md` (raíz).

**Ojo con `guardarMovimiento()`, que es el único guardado tolerante del proyecto.** Un
`upsert` con una columna que la base no conoce no guarda «casi todo»: falla entero. Sin la columna
`carga` en la base, mandarla dejaría de guardar hasta el importe. Por eso intenta con la columna
y, solo si la base contesta que no la conoce (`PGRST204` o `42703`, ver
`esColumnaDesconocida()`), reintenta una vez sin ella y se lo anota para el resto de la
sesión. Se pierde la imputación —que es lo que la base todavía no sabe guardar— y no el
movimiento. Distinguir ese error de uno de permisos o de red es lo que evita que un fallo
real pase por «falta el esquema» y se guarde a medias en silencio.

### Preview local

`.claude/static-server.mjs` sirve la carpeta (respeta `PORT`). La app siempre pega contra
el Supabase real; sin sesión válida la base no devuelve datos.

## Loading states & optimistic updates

Patrón para toda acción que persiste contra Supabase (`RoadmapSync.*`). El helper genérico
es `conEstadoDeCarga(accion, {revertir, intentos, onEstado})`: centraliza reintento (2 por
defecto) + revert + aviso, desacoplado del DOM — cada call site decide cómo se ve mediante
su propio `onEstado(estado)`.

- **Optimistic update por defecto**: el cambio se aplica en memoria y se pinta al toque; la
  persistencia corre en paralelo sin bloquear la UI.
- **Falla tras agotar los reintentos → revertir, no dejar colgado**: el valor vuelve al
  anterior (no se deja «sin guardar» en pantalla) y se muestra el aviso.
- **Indicador global único** (`● guardando` / `✓ guardado`) en la franja de filtros, con
  contador `enVuelo++/--`. Nada de un indicador por campo — sería ruido repartido por toda
  la pantalla.
- **Acciones discretas** (borrar tarea, borrar movimiento, login, logout): además del
  indicador global, feedback local en el propio botón vía `onEstadoBoton(el, texto)`,
  combinado con `combinar(...fns)`.
- **Campos con autoguardado debounced y drag&drop**: solo alimentan el indicador global.
- **Carga inicial**: esqueleto con shimmer escrito en el HTML dentro de `#board`, sin JS
  para mostrarlo u ocultarlo — el primer `render()` lo pisa solo. **Tiene la forma de lo que
  va a llegar**: bloques con renglones, no las tres columnas de tarjetas que fue hasta el
  26/8/2026. Un esqueleto con la silueta de un tablero que ya no existe promete durante medio
  segundo una pantalla que después no llega.
- **No pisar lo que alguien está escribiendo**: `estaEditando()` bloquea el refresco de
  realtime mientras hay un campo con foco dentro del tablero o el detalle de una tarea
  abierto. El refresco pendiente se aplica al salir del campo o al cerrar el modal.
- **Ecos propios**: `marcarEcoPropio(tabla, id)` evita que el cambio que acabás de guardar
  vuelva por realtime y te repinte la pantalla encima.
