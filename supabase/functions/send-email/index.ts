import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { EmailConfigError, EmailProviderError, sendEmail } from '../_shared/email.ts'
import { handleSendEmail } from './handler.ts'

/* Envío de un email desde el front: el formulario de prueba del CRM y las plantillas de «Mensajes».
   Quién puede llamarla lo decide `handleSendEmail` (SUPERADMIN para texto libre, usuario activo
   para una plantilla), no el JWT: el JWT solo dice quién sos, y el
   gateway deja pasar la anon key del bundle. La API key de Resend es un secret de la función. */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: jsonHeaders })

async function getCallerId(req: Request): Promise<string | null> {
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data } = await client.auth.getUser()
  return data?.user?.id ?? null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const callerId = await getCallerId(req)
  if (!callerId) return respond(401, { error: 'Sesión inválida' })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const r = await handleSendEmail(
      callerId,
      {
        to: str(body.to), subject: str(body.subject), text: str(body.text), attachments: body.attachments,
        ...(typeof body.plantilla === 'string' ? { plantilla: body.plantilla, campos: body.campos } : {}),
      },
      {
        async getCaller(id) {
          // `*` y no la lista: así no rompe si las columnas `firma_*` todavía no están en la base.
          const { data } = await admin.from('users').select('*').eq('id', id).maybeSingle()
          return data ?? null
        },
        send: msg => sendEmail(msg),
      },
    )
    return r.ok ? respond(200, { id: r.id }) : respond(r.status, { error: r.error })
  } catch (error) {
    if (error instanceof EmailConfigError) return respond(500, { error: 'El envío de emails no está configurado (falta RESEND_API_KEY)' })
    if (error instanceof EmailProviderError) return respond(502, { error: error.message })
    return respond(500, { error: 'Error interno' })
  }
})
