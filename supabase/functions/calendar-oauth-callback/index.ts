import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyState } from '../_shared/oauthState.ts'
import { encryptToken } from '../_shared/tokenCrypto.ts'
import { decodeJwtPayload } from '../_shared/googleOAuth.ts'

/* Copiada de `propelia-frontend` (21/10/2026). A dónde vuelve el navegador después del
   consentimiento de Google: canjea el código, guarda los tokens cifrados en
   `calendar_connections` y redirige a Ajustes. Lo que cambia: acá no hay organización — alcanza
   con que la fila de `users` esté activa, la misma regla que `es_usuario()`. */

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

const SETTINGS_PATH = '/ajustes?tab=integraciones'

Deno.serve(async (req: Request) => {
  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('code')
  const stateParam = requestUrl.searchParams.get('state')
  const oauthError = requestUrl.searchParams.get('error')

  const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!encryptionKey || !clientId || !clientSecret) {
    return new Response('OAuth is not configured', { status: 500 })
  }

  // Sin state válido no hay a dónde redirigir: respuesta plana.
  const state = stateParam ? await verifyState(stateParam, encryptionKey) : null
  if (!state) {
    return new Response('Invalid state', { status: 400 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Un solo uso: si el nonce ya está consumido, esto es un replay — respuesta plana, sin redirect.
  const { error: nonceError } = await admin
    .from('oauth_state_nonces')
    .insert({ nonce: state.nonce })
  if (nonceError) {
    return new Response('State already used', { status: 400 })
  }

  const fail = (reason: string): Response =>
    Response.redirect(`${state.redirectOrigin}${SETTINGS_PATH}&error=${reason}`, 302)

  try {
    if (oauthError || !code) return fail('denied')

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-oauth-callback`,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) return fail('exchange')
    const tokens = (await tokenRes.json()) as GoogleTokenResponse

    // prompt=consent garantiza refresh_token; si falta, algo anduvo mal.
    if (!tokens.refresh_token) return fail('no-refresh-token')
    // Consentimiento granular: el usuario pudo destildar permisos.
    const grantedScopes = (tokens.scope ?? '').split(/\s+/)
    const required = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ]
    if (!required.every((scope) => grantedScopes.includes(scope))) return fail('missing-scope')

    const connectedEmail =
      typeof decodeJwtPayload(tokens.id_token ?? '')?.email === 'string'
        ? (decodeJwtPayload(tokens.id_token ?? '')!.email as string)
        : null

    const { data: userRow } = await admin
      .from('users')
      .select('id')
      .eq('id', state.userId)
      .eq('activo', true)
      .maybeSingle()
    if (!userRow) return fail('user-not-found')

    const { error: upsertError } = await admin.from('calendar_connections').upsert(
      {
        user_id: state.userId,
        provider: 'google',
        refresh_token: await encryptToken(tokens.refresh_token, encryptionKey),
        access_token: await encryptToken(tokens.access_token, encryptionKey),
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        connected_email: connectedEmail,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' },
    )
    if (upsertError) return fail('save')

    return Response.redirect(`${state.redirectOrigin}${SETTINGS_PATH}&connected=google`, 302)
  } catch {
    return fail('exchange')
  }
})
