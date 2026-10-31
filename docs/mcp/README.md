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

URL que se pega: **`https://equipo.propelia.es/mcp`**

- **Claude**: Settings → Connectors → Add custom connector.
- **ChatGPT**: Settings → Connectors (o Apps) → Advanced → *Developer mode*; después Create →
  pegar la URL, autenticación OAuth.

Es un proxy de Vercel (`vercel.json`) a `…supabase.co/functions/v1/mcp?via=equipo`; con eso la
función anuncia `equipo.propelia.es/mcp` como `resource` (`publicUrls`,
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
   `https://equipo.propelia.es` (el consentimiento se abre en `<Site URL>/oauth/consent`).
4. `supabase functions deploy` de **todas** las funciones (todas llevan el guard; `mcp` toma
   `verify_jwt = false` de `config.toml`) y el front en Vercel (ruta nueva + proxy).
5. Probar: agregar el conector en Claude y pedirle «¿con qué cuenta estás conectado?», después
   «¿qué tareas críticas hay en el roadmap?» y «¿qué demos hay esta semana?».

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
