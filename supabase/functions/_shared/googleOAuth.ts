// Helpers puros del flujo OAuth de Google. Sin Deno.* — importable desde Vitest.

export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
]

export const buildGoogleAuthUrl = (params: { clientId: string; redirectUri: string; state: string }): string => {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // sin esto Google no reenvía refresh_token en reconexiones
    state: params.state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`
}

// Allowlist de origins a los que el callback puede redirigir (anti open-redirect).
// `allowlist` viene del secret GOOGLE_CALENDAR_ALLOWED_REDIRECT_ORIGINS (CSV); vacío/undefined => solo localhost dev (el puerto de `npm run dev` de este repo, ver vite.config.ts).
export const isAllowedRedirectOrigin = (origin: string, allowlist: string | undefined): boolean => {
  const allowed = (allowlist ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (allowed.length === 0) allowed.push('http://localhost:4100')
  return allowed.includes(origin)
}

export const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (parts[1].length % 4)) % 4)
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  } catch {
    return null
  }
}
