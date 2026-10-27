import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { altaPublica, type AltaPublica, type AltaPublicaDb } from './altaPublica.ts'

/* La puerta de la página pública de alta (crm.propelia.es/alta/<token>, en propelia-frontend).
   Sin JWT (`verify_jwt = false`): quien la abre es el cliente, que no tiene cuenta. La llave es el
   token, y las dos funciones de la base solo las puede correr el service_role.
   Body: { accion: 'leer', token } | { accion: 'enviar', token, inmobiliaria, web, miembros }. */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = { ...cors, 'Content-Type': 'application/json' }

function dbDe(admin: SupabaseClient): AltaPublicaDb {
  return {
    async leer(token) {
      const { data, error } = await admin.rpc('onboarding_alta_leer', { p_token: token })
      return error ? { data: null, error: error.message } : { data: (data as AltaPublica | null) ?? null }
    },
    async enviar(token, inmobiliaria, web, miembros) {
      const { error } = await admin.rpc('onboarding_alta_enviar', {
        p_token: token, p_company_name: inmobiliaria, p_website: web, p_miembros: miembros,
      })
      return error ? { error: error.message } : {}
    },
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'alta_accion_invalida' }), { status: 405, headers: json })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const r = await altaPublica(body, dbDe(admin))
  if (!r.ok) console.error('onboarding-alta', r.error)
  return r.ok
    ? new Response(JSON.stringify(r.body), { headers: json })
    : new Response(JSON.stringify({ error: r.error }), { status: r.status, headers: json })
})
