import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { signState } from '../_shared/oauthState.ts'
import { buildGoogleAuthUrl, isAllowedRedirectOrigin } from '../_shared/googleOAuth.ts'
import { withoutOAuthClients } from '../_shared/auth/oauthClientGuard.ts'

/* Copiada de `propelia-frontend` (21/10/2026). Arranca la conexión con Google Calendar de quien
   llama: devuelve la URL de consentimiento con un `state` firmado que el callback verifica. Sin el
   `withoutOAuthClients` del producto: acá no hay servidor MCP que emita tokens de conector. */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

Deno.serve(withoutOAuthClients(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Identificar al usuario con su propio JWT (verify_jwt=true ya validó la firma)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
    }

    // El callback redirige de vuelta a este origin (localhost o prod, según de dónde vino)
    const origin = req.headers.get('origin')
    if (!origin) {
      return new Response(JSON.stringify({ error: 'Missing Origin header' }), { status: 400, headers: jsonHeaders })
    }

    if (!isAllowedRedirectOrigin(origin, Deno.env.get('GOOGLE_CALENDAR_ALLOWED_REDIRECT_ORIGINS'))) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: jsonHeaders })
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')
    if (!clientId || !encryptionKey) {
      return new Response(JSON.stringify({ error: 'OAuth is not configured' }), { status: 500, headers: jsonHeaders })
    }

    const state = await signState(
      { userId: userData.user.id, redirectOrigin: origin, iat: Date.now(), nonce: crypto.randomUUID() },
      encryptionKey,
    )
    const url = buildGoogleAuthUrl({
      clientId,
      redirectUri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-oauth-callback`,
      state,
    })

    return new Response(JSON.stringify({ url }), { headers: jsonHeaders })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders })
  }
}))
