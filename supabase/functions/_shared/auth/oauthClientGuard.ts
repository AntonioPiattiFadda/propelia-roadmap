// Los tokens OAuth que Supabase Auth le da a un conector (Claude / ChatGPT, servidor MCP) son
// JWT de sesión normales (role authenticated) con un claim extra, `client_id`. Pasan el
// `verify_jwt` del gateway y el `auth.getUser` igual que la sesión del usuario, así que sin
// esto un conector podría llamar a cualquier edge function: crear miembros, mandar emails,
// tocar el calendario de alguien…
//
// Toda edge function rechaza de entrada un token con `client_id` (Deno.serve envuelto en
// `withoutOAuthClients`). La única que los acepta es `mcp`, que es para eso.
// auth/todasLasFunciones.test.ts falla si una función nueva no lo usa.
//
// Se lee el payload SIN verificar la firma a propósito: sólo sirve para RECHAZAR. Agregar un
// `client_id` falso no le da nada a nadie, y sacarlo invalida la firma, que el gateway o
// `auth.getUser` siguen verificando.

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

/** Payload del JWT SIN verificar la firma: sólo para rechazar, nunca para dar acceso. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

/** true si el header Authorization trae un token OAuth de un conector. */
export function isOAuthClientToken(authorization: string | null | undefined): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!match) return false
  const payload = decodeJwtPayload(match[1].trim())
  return typeof payload?.client_id === 'string' && payload.client_id.length > 0
}

/** 403 si el request viene de un conector; null si no (seguir). */
export function rejectOAuthClientToken(req: Request): Response | null {
  if (!isOAuthClientToken(req.headers.get('Authorization'))) return null
  return new Response(
    JSON.stringify({ error: 'oauth_client_forbidden', message: 'Los conectores no pueden usar esta función.' }),
    { status: 403, headers: JSON_HEADERS },
  )
}

/** Envuelve un handler de `Deno.serve` con el rechazo de tokens de conectores. */
export function withoutOAuthClients<A extends unknown[]>(
  handler: (req: Request, ...rest: A) => Response | Promise<Response>,
): (req: Request, ...rest: A) => Response | Promise<Response> {
  return (req, ...rest) => rejectOAuthClientToken(req) ?? handler(req, ...rest)
}
