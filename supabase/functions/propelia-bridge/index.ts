import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { reenviar, type PuenteDb } from './puente.ts'
import { withoutOAuthClients } from '../_shared/auth/oauthClientGuard.ts'

/* El puente con Propelia para el onboarding de clientes (docs/onboarding/PUENTE.md). El front
   nunca habla con Propelia: llama acá, y acá se decide quién puede (`reenviar`). */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = { ...cors, 'Content-Type': 'application/json' }

function dbDe(admin: SupabaseClient): PuenteDb {
  return {
    async quienLlama(id) {
      const { data } = await admin.from('users').select('email, rol, activo').eq('id', id).maybeSingle()
      return data ?? null
    },
  }
}

async function quienLlamaId(req: Request): Promise<string | null> {
  const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data } = await cliente.auth.getUser()
  return data?.user?.id ?? null
}

Deno.serve(withoutOAuthClients(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed', message: 'Método no permitido.' }), { status: 405, headers: json })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const r = await reenviar(await quienLlamaId(req), await req.json().catch(() => null), {
    db: dbDe(admin),
    url: Deno.env.get('PROPELIA_BRIDGE_URL'),
    secreto: Deno.env.get('PROPELIA_BRIDGE_SECRET'),
    fetch,
  })
  return new Response(JSON.stringify(r.body), { status: r.status, headers: json })
}))
