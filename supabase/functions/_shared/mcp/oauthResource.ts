// El servidor MCP como "protected resource" de OAuth 2.1 (RFC 9728), que es lo que Claude (y
// ChatGPT, mismo flujo) espera de un custom connector remoto. Copiado de propelia-frontend:
//
//   1. Claude llama sin token → 401 con `WWW-Authenticate: Bearer resource_metadata="…"`.
//   2. Lee esa metadata → `authorization_servers` apunta a Supabase Auth (`/auth/v1`).
//   3. Supabase Auth publica su propia metadata (/.well-known/oauth-authorization-server/auth/v1),
//      Claude se registra solo (dynamic client registration) y manda al usuario a
//      `/oauth/consent` del tablero. Al aprobar, Claude recibe un access token de ESE usuario.
//
// El paso 1 es el que obliga a `verify_jwt = false` en config.toml: el 401 del gateway de
// Supabase no trae el header, Claude no encuentra dónde loguearse y el conector no conecta.

type GetEnv = (key: string) => string | undefined

export const METADATA_PATH = '/.well-known/oauth-protected-resource'

export interface McpPublicUrls {
  /** La URL que el cliente pega en Claude o ChatGPT. Tiene que coincidir con `resource` de la metadata. */
  resource: string
  metadata: string
  authorizationServer: string
}

/**
 * URL del conector bajo el dominio del tablero. Claude no usa el ícono que manda el servidor:
 * pide a Google el favicon del dominio de la URL del conector. Con la URL de Supabase el
 * conector sale con el logo de Supabase. vercel.json reenvía `equipo.propelia.es/mcp` a esta
 * función agregando `?via=equipo`.
 */
export const EQUIPO_MCP_URL = 'https://equipo.propelia.es/mcp'
export const VIA_PARAM = 'via'

/**
 * Las URLs tienen que ser las PÚBLICAS, y `resource` la misma que el cliente pegó en Claude:
 *   · llegó por el proxy del tablero (`?via=equipo`) → `EQUIPO_MCP_URL` (pisable con MCP_RESOURCE_URL);
 *   · si no → la de Supabase.
 * Dentro del edge runtime local `SUPABASE_URL` es `http://kong:8000`, inalcanzable para Claude
 * o el MCP Inspector: en local se pisa con `MCP_PUBLIC_SUPABASE_URL`.
 * El servidor de autorización es siempre Supabase Auth.
 */
export function publicUrls(getEnv: GetEnv, req?: Request): McpPublicUrls {
  const base = (getEnv('MCP_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL') || '').replace(/\/+$/, '')
  const viaEquipo = req ? new URL(req.url).searchParams.get(VIA_PARAM) === 'equipo' : false
  const resource = viaEquipo
    ? (getEnv('MCP_RESOURCE_URL') || EQUIPO_MCP_URL).replace(/\/+$/, '')
    : `${base}/functions/v1/mcp`
  return { resource, metadata: `${resource}${METADATA_PATH}`, authorizationServer: `${base}/auth/v1` }
}

export function protectedResourceMetadata(urls: McpPublicUrls) {
  return {
    resource: urls.resource,
    authorization_servers: [urls.authorizationServer],
    bearer_methods_supported: ['header'],
    resource_name: 'Propelia Roadmap',
  }
}

export function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')
  return match ? match[1].trim() || null : null
}

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Expose-Headers': 'www-authenticate, mcp-session-id',
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
  })
}

/**
 * Sin token: sólo el puntero a la metadata (RFC 6750 §3.1, no se le dice `invalid_token` a
 * quien todavía no mandó nada). Con token vencido o inválido: `invalid_token`, que es lo que
 * hace que Claude use el refresh token o vuelva a pedir login.
 */
export function unauthorized(urls: McpPublicUrls, reason: 'missing' | 'invalid'): Response {
  const challenge = reason === 'missing'
    ? `Bearer resource_metadata="${urls.metadata}"`
    : `Bearer error="invalid_token", error_description="El token no es válido o venció", resource_metadata="${urls.metadata}"`
  return json({ error: reason === 'missing' ? 'unauthorized' : 'invalid_token' }, 401, { 'WWW-Authenticate': challenge })
}
