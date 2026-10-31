# Servidor MCP: conectar Claude o ChatGPT al tablero

Copiado de `propelia-frontend` (`docs/mcp/README.md` de allá tiene la historia larga): OAuth, el
blindaje del token, la auditoría y la pantalla de consentimiento (migración
`20261030115614_mcp_oauth_infra`), y las tools sobre vistas `mcp_*` (migración
`20261031135450_mcp_tools`). **Todas de sólo lectura.**

| Tool | Qué devuelve | Vista |
|---|---|---|
| `get_me` | Id, nombre y rol de quien conectó (el «mío» de las demás) | RPC `mcp_whoami` |
| `list_team` | El equipo: id, nombre, rol, activo | `mcp_team` |
| `list_roadmap_tasks` | Tareas del tablero o del backlog: estado, prioridad, responsables, grupo, área. Por defecto el tablero sin terminadas | `mcp_roadmap_tareas`, `mcp_roadmap_grupos` |
| `get_roadmap_task` | Una tarea entera: la explicación como texto (los tres formatos de `expl`), los pasos, los avisos y los últimos 30 mensajes | `mcp_roadmap_tareas` |
| `list_backlog_groups` | Los grupos del backlog con nombre y cuántas tareas | `mcp_roadmap_grupos`, `mcp_roadmap_tareas` |
| `list_crm_stages` | El funnel con cuántos leads hay en cada etapa | `mcp_crm_stages`, `mcp_crm_leads` |
| `list_crm_leads` | Leads (inmobiliarias) con etapa, responsable, importante, tipo. Por defecto sin descartados | `mcp_crm_leads` |
| `get_crm_lead` | Un lead entero: datos de la inmobiliaria, contactos (nombre, rol, decisor), tareas, reuniones, actividad y cambios de etapa | `mcp_crm_*` |
| `list_crm_tasks` | Tareas del CRM. Por defecto las pendientes tuyas; `hoy` y `vencidas` en hora de España | `mcp_crm_tasks` |
| `list_crm_meetings` | Reuniones y demos, por defecto las próximas | `mcp_crm_meetings` |
| `list_demos` | Las demos agendadas (por defecto las próximas): hora de España, inmobiliaria y su etapa, quién asiste, decisor apuntado y notas de quien la agendó (del registro de la demo; las de antes del 22/10/2026, de `description` sin el email) | `mcp_crm_meetings`, `mcp_crm_leads`, `mcp_crm_comments` |
| `get_demo_briefing` | Para preparar una demo: la demo y el lead entero, con notas de cada contacto, notas de la inmobiliaria, oficina, cómo llegó, toda la actividad, reasignaciones, correos enviados (asunto y estado), otras reuniones y un resumen con números | las de arriba + `mcp_crm_emails`, `mcp_crm_assignment_history` |
| `list_onboardings` | Altas de clientes (sólo SUPERADMIN) | `mcp_onboardings` |
| `list_expenses` | La caja, con total y cuánto pagó cada uno de lo filtrado (sólo SUPERADMIN) | `mcp_expenses` |

**Cada uno ve lo que ve en la app**: las vistas corren como su dueño (la RLS restrictiva le cierra
las tablas al conector) y recortan cada fila con la misma regla que la RLS: `es_usuario()`, la
cartera de `crm_puede()` y `crm_es_superadmin()` (altas y caja, que el front también esconde a un
SDR). **Las del CRM no llaman a `crm_puede()` por fila** (migración
`20261031141933_mcp_demos_y_rendimiento`): `(select crm_es_superadmin()) or owner in (select
mcp_carteras_visibles())` dice lo mismo y se evalúa una vez por consulta. Con la función por fila,
la lista de leads tardaba 139 ms en 431 filas y crecía con la tabla; y `security_barrier` no deja
adelantar un `ilike` a ese corte. Si cambia `crm_puede()`, cambia `mcp_carteras_visibles()`. **Nunca salen** teléfonos ni emails (de contactos, de la inmobiliaria ni
de las invitaciones), el teléfono de la meta de una llamada, el `public_token` del alta, el equipo
que carga el cliente, los tokens de Google ni los archivos. Sí salen los textos que escribe el
equipo (notas, explicaciones, conversaciones, consejo del SDR): es el CRM interno y sin eso no
sirve. Las `instructions` del servidor le piden al modelo tratarlos como datos.

URL que se pega: **`https://propelia-roadmap.vercel.app/mcp`**

- **Claude**: Settings → Connectors → Add custom connector.
- **ChatGPT**: Settings → Connectors (o Apps) → Advanced → *Developer mode*; después Create →
  pegar la URL, autenticación OAuth.

Es un proxy de Vercel (`vercel.json`) a `…supabase.co/functions/v1/mcp?via=equipo`; con eso la
función anuncia `propelia-roadmap.vercel.app/mcp` como `resource` (`publicUrls`,
`_shared/mcp/oauthResource.ts`). Existe por el ícono: claude.ai ignora `serverInfo.icons` y
muestra el favicon que Google tiene para el dominio de la URL del conector. Con la URL de
Supabase sale el logo de Supabase.

## Piezas

| Pieza | Dónde |
|---|---|
| Servidor MCP (Streamable HTTP, sin estado) | `supabase/functions/mcp/index.ts` |
| Tools | `supabase/functions/_shared/mcp/tools.ts` |
| Acceso a la base (sólo vistas `mcp_*` y RPC de la lista) | `_shared/mcp/db.ts`, `_shared/mcp/relations.ts` |
| Última barrera de salida | `_shared/mcp/sanitize.ts` |
| Auditoría de cada llamada | `_shared/mcp/audit.ts` → `mcp_audit_log` (la lee un SUPERADMIN) |
| Rechazo del token del conector en las demás funciones | `_shared/auth/oauthClientGuard.ts` (`withoutOAuthClients`), test `todasLasFunciones.test.ts` |
| Blindaje en la base | migración `20261030115614_mcp_oauth_infra` |
| Pantalla de consentimiento | `src/pages/oauth/OAuthConsent.tsx` → `/oauth/consent` |
| Volver del login al consentimiento | `RequireAuthReturning` + `?next=` en `PublicRoutesAuthCheck` (`src/lib/safeNextPath.ts`) |
| Sólo Claude y ChatGPT pueden recibir el código | `src/lib/oauthRedirectTrust.ts` |
| Servidor OAuth 2.1 | Supabase Auth (`[auth.oauth_server]` en `config.toml`) |

## Flujo

1. Claude hace `POST /mcp` sin token → **401** con `WWW-Authenticate: Bearer resource_metadata=…`.
2. La metadata dice que el servidor de autorización es Supabase Auth (`/auth/v1`).
3. Claude se registra solo (registro dinámico) y abre `/oauth/consent?authorization_id=…` del
   tablero. Sin sesión pasa por `/sign-in` y vuelve. Sin fila activa en `users`, no pasa.
4. Al aprobar, Claude recibe un access token (JWT del usuario con `client_id`) y un refresh token.
5. Cada llamada valida el token, corta a los dados de baja (`mcp_whoami`, 403) y consulta con un
   cliente **armado con ese token**. La service role sólo escribe la auditoría.

## Seguridad: el token del conector no sirve para nada más

El token es un JWT de sesión normal con un claim extra, `client_id`. Sin blindaje serviría contra
toda la API con los permisos de la persona: la caja, los leads, escribir, mandar emails.

| Capa | Qué hace con un token con `client_id` |
|---|---|
| `db_pre_request` de PostgREST (`oauth_client_request_guard`) | Sólo `GET`/`HEAD` a las vistas de `mcp_oauth_relations()` y a las RPC de `mcp_oauth_rpcs()` (hoy `mcp_whoami`). Todo lo demás: 403. |
| RLS restrictiva `oauth_clients_no_access` en **todas** las tablas de `public` | Cero filas y ninguna escritura. Cubre embeds y realtime. |
| `oauth_clients_no_storage` en `storage.objects` | Nada de archivos. |
| `withoutOAuthClients` en todas las edge functions salvo `mcp` | 403 de entrada. |

Las sesiones normales no cambian. **Tabla nueva en `public`**: su migración tiene que terminar con
`select public.oauth_guard_apply();`, y `select public.oauth_guard_missing_tables();` (service
role) tiene que dar vacío. **Edge function nueva**: `Deno.serve(withoutOAuthClients(…))`, o el test
falla.

**La pantalla de consentimiento sólo aprueba a Claude y ChatGPT** (el registro dinámico está
abierto: cualquiera puede registrar una app con cualquier nombre). Lo que decide es a dónde vuelve
el código (`redirectTrust`), no el nombre.

**Pendiente heredado del producto**: Supabase Auth no distingue el token del conector, así que
`PUT /auth/v1/user` con ese token podría cambiar la contraseña. Lo acota que sólo lo recibe Claude
o ChatGPT (consentimiento + PKCE). Conviene prender *Secure password change* (Authentication →
Sign In / Providers → Email).

## Activar en producción (una vez)

1. Migraciones: `supabase db push` (las aplica Antonio). **Antes** que la función: sin
   `mcp_whoami` el MCP responde 500, y sin las vistas de `20261031135450_mcp_tools` cada tool
   contesta «No se pudieron leer los datos» (el guard las rechaza por no estar en la lista).
2. Dashboard → **Authentication → OAuth Server**: habilitar, *Authorization path*
   `/oauth/consent`, *Allow dynamic client registration* activado.
3. Dashboard → **Authentication → URL Configuration**: el *Site URL* tiene que ser
   `https://propelia-roadmap.vercel.app` (el consentimiento se abre en `<Site URL>/oauth/consent`).
4. `supabase functions deploy` de **todas** las funciones (todas llevan el guard; `mcp` toma
   `verify_jwt = false` de `config.toml`) y el front en Vercel (ruta nueva + proxy).
5. Probar: agregar el conector en Claude y pedirle «¿con qué cuenta estás conectado?», después
   «¿qué tareas críticas hay en el roadmap?» y «¿qué demos hay esta semana?».

### Cómo quedó (31/10/2026)

| Paso | Estado |
|---|---|
| Migraciones `20261030115614_mcp_oauth_infra` y `20261031135450_mcp_tools` | Aplicadas |
| Migración `20261031141933_mcp_demos_y_rendimiento` | Pendiente de `db push` al escribir esto (`supabase migration list` lo dice) |
| Función `mcp` y proxy de Vercel | Deployados: `POST /mcp` sin token da 401 con el `WWW-Authenticate` que apunta a `propelia-roadmap.vercel.app` |
| OAuth Server (Authentication → OAuth Server) | Prendido, *Authorization Path* `/oauth/consent` |
| *Allow Dynamic OAuth Apps* | Prendido. Supabase pide confirmar el riesgo (registros de apps falsas para phishing): lo cubre la pantalla de consentimiento, que sólo deja aprobar si el código vuelve a Claude o ChatGPT, y el token igual sólo lee las vistas `mcp_*` |
| *Site URL* | **Quedó en `http://localhost:3000`**: hay que pasarlo a `https://propelia-roadmap.vercel.app` (Authentication → URL Configuration). Con localhost, el consentimiento se abre en la máquina de cada uno y no conecta |

**El dominio es `propelia-roadmap.vercel.app`**, no `equipo.propelia.es` (que no existe; se había
supuesto de los tests y se corrigió el 31/10/2026). Está en `TABLERO_MCP_URL`
(`_shared/mcp/oauthResource.ts`) y en el ícono de `mcp/index.ts`; `MCP_RESOURCE_URL` lo pisa sin
deployar código. Ojo con el logo: Claude toma el favicon del dominio y en `vercel.app` puede salir
el de Vercel. Para ver el de Propelia hace falta un dominio propio (ej. `tablero.propelia.es`).

### Si Claude no deja agregarlo

- **Pide «Usa tu propio cliente OAuth» / un ID de cliente**: el registro dinámico está apagado o el
  OAuth Server no está prendido. Se ve con
  `curl https://itqwxnmuxuiiydsueazb.supabase.co/.well-known/oauth-authorization-server/auth/v1`:
  tiene que traer `registration_endpoint` (apagado contesta `"OAuth server is disabled"`). Así
  estaba la primera vez, el 31/10/2026.
- **El login se abre en localhost**: el *Site URL* (ver arriba).
- **Conecta pero las tools dicen «No se pudieron leer los datos»**: el error real queda en
  `mcp_audit_log.error`. Puede faltar una migración (una vista que no está en la base, el guard la
  rechaza) o un permiso: **una función que llama una vista se ejecuta con los permisos de quien
  consulta, no del dueño de la vista**. El 31/10/2026 todas las del CRM fallaban por haberle sacado
  a `authenticated` el EXECUTE de `mcp_carteras_visibles()` (lo devolvió
  `20261031144827_mcp_carteras_visibles_permiso`). Toda función nueva que usen las vistas necesita
  `grant execute … to authenticated`.
- En Claude se elige «Iniciar sesión ahora» y, en Cliente OAuth, «Registrar automáticamente».

### Cuánto cuesta cada consulta (medido el 31/10/2026)

Con `EXPLAIN ANALYZE` sobre las vistas, simulando al usuario en una transacción que sólo lee
(`set local role authenticated`, `request.jwt.claims` con su id, `statement_timeout` de 5 s y
`rollback`). **Nunca consultar las tablas así**: con el rol `authenticated` se paga la RLS de cada
fila, y una consulta sobre toda la actividad quedó corriendo en producción.

| Consulta | Tiempo | Nota |
|---|---|---|
| Lista de leads (SUPERADMIN, 431) | 72 ms en frío, el `count` 5 ms | El permiso se evalúa una vez (`InitPlan`); antes, 139 ms con `crm_puede()` por fila |
| Lista de leads de un SDR con búsqueda | 14 ms | La lista de carteras se arma una vez (`loops=1`) |
| Briefing de una demo (actividad, tareas, reuniones, etapas, correos) | ~30 ms las cinco | Recorría toda la actividad y los cambios de etapa sin índice por lead: los suma `20261031145314_crm_indices_por_lead` |

Tamaño: listas de 25 por defecto (tope 100), textos cortados a 4.000 caracteres por el
sanitizador, el briefing con hasta 100 actividades (hoy un lead tiene como mucho 13).

### Pendiente: revisión de seguridad

Quedó para evaluar con calma (31/10/2026). Lo que ya está y lo que hay que mirar:

| Tema | Hoy | Qué revisar |
|---|---|---|
| Registro dinámico abierto | Cualquiera registra una app con cualquier nombre; el consentimiento sólo aprueba si el código vuelve a Claude o ChatGPT (`oauthRedirectTrust.ts`) | Mirar cada tanto Authentication → OAuth Apps y borrar lo raro. ¿Hace falta registrar los clientes a mano y apagar el registro dinámico? |
| El token puede cambiar la contraseña | Heredado del producto: `PUT /auth/v1/user` con el token del conector no pasa por PostgREST ni por la RLS | Prender *Secure password change* (Authentication → Sign In / Providers → Email), que en este proyecto no se verificó, y saber que igual deja 24 h abiertas |
| Las vistas corren como su dueño | Copian la regla de la RLS (`es_usuario()`, la cartera vía `mcp_carteras_visibles()`, `crm_es_superadmin()`) | Si cambia una policy de `crm_*`, `expenses` o `client_onboardings`, la vista no se entera sola. Falta un test tipo `crm-permisos.sql` que compare vista contra RLS por usuario |
| Qué datos salen | Sin teléfonos, emails, tokens ni archivos; sí todos los textos del equipo (notas, consejo del SDR, conversaciones, notas de contactos) | ¿Está bien que un SDR lleve a Claude/ChatGPT todo el texto de su cartera? ¿Y la caja a un SUPERADMIN? |
| Prompt injection | Los textos los escribe el equipo; las `instructions` le piden al modelo tratarlos como datos; el sanitizador limpia caracteres raros y corta largos | Todo es sólo lectura, así que el daño posible es que el modelo lea algo mal o lo mande a otra tool del chat |
| Auditoría | Cada llamada queda en `mcp_audit_log` (quién, qué tool, argumentos cortos, cuántas filas); la lee un SUPERADMIN | No hay pantalla para verla ni alerta de uso raro |
| Revocar el acceso | Se quita desde Claude/ChatGPT; dar de baja a la persona (`activo = false`) corta en la siguiente llamada (403) | Ver cuánto duran los tokens y si conviene acortarlos |
| Dominio | `vercel.app` es compartido | Un dominio propio da logo y una URL que no depende del subdominio de Vercel |

## Tests

```bash
# Fuera del repo: con el package.json de la raíz, Deno busca las dependencias en node_modules.
cp -r supabase/functions /tmp/fns && cd /tmp/fns
deno test --no-check --allow-env --allow-net --allow-read mcp/ _shared/mcp/ _shared/auth/
deno check _shared/mcp/tools.ts _shared/mcp/roadmap.ts _shared/mcp/crm.ts   # los tipos, sin el SDK
npx vitest run src/lib/oauthRedirectTrust.test.ts src/lib/safeNextPath.test.ts
```

Sin Deno instalado: `npx -y deno@2.1.4 …`. `--no-check` porque el chequeo de tipos de Deno no
encuentra los `.d.ts` del SDK de MCP; por eso los módulos de las tools se chequean aparte.
`tools.test.ts` corre cada tool contra una base de mentira y falla si lee algo fuera de la lista
blanca o si el sanitizador tiene que sacarle una clave.

## Agregar una tool

1. Si lee datos: **una vista `mcp_*` nueva**, nunca la tabla (una tabla en la lista blanca expone
   todas sus columnas). En una migración: la vista con `security_barrier`, cortando a quien no es
   `es_usuario()`, sólo con columnas que se pueden entregar, revocada de `anon`, y
   `mcp_oauth_relations()` redefinida completa con la vista. Sumarla en `MCP_RELATIONS`.
2. Definirla en `tools.ts` y sumarla a `TOOLS`. Sólo lectura (`readOnlyHint` lo pone `index.ts`).
   Escribir requiere además abrir el método en `oauth_client_request_guard`.
3. Actualizar «Va a poder» / «No va a poder» de `OAuthConsent.tsx`, la tabla de arriba y las
   `instructions` de `mcp/index.ts`, que le dicen al modelo qué tool usar para qué.
