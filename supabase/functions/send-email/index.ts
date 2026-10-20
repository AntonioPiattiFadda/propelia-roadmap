import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const clienteDe = (req: Request) => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
})

async function getCallerId(caller: SupabaseClient): Promise<string | null> {
  const { data } = await caller.auth.getUser()
  return data?.user?.id ?? null
}

/* El lead se pega solo si quien manda lo puede leer: la fila la escribe la service role, y sin
   esto cualquiera podría colgarle un envío al lead de otra cartera. Se pregunta con SU sesión. */
async function leadVisible(caller: SupabaseClient, leadId: unknown): Promise<string | null> {
  if (typeof leadId !== 'string' || !UUID.test(leadId)) return null
  const { data } = await caller.from('crm_leads').select('id').eq('id', leadId).maybeSingle()
  return data?.id ?? null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const caller = clienteDe(req)
  const callerId = await getCallerId(caller)
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
    if (!r.ok) return respond(r.status, { error: r.error })
    /* El registro que después actualiza `resend-webhook` (20/10/2026). El mail ya salió: si esto
       falla no se le dice que no al que mandó, solo se pierde el aviso de rebote de este envío. */
    const { error } = await admin.from('crm_emails').insert({
      resend_id: r.id, lead_id: await leadVisible(caller, body.leadId), sent_by: callerId,
      to_email: r.to, subject: r.subject, plantilla: r.plantilla ?? null,
    })
    if (error) console.error('crm_emails: no se pudo registrar el envío', r.id, error.message)
    return respond(200, { id: r.id })
  } catch (error) {
    if (error instanceof EmailConfigError) return respond(500, { error: 'El envío de emails no está configurado (falta RESEND_API_KEY)' })
    if (error instanceof EmailProviderError) return respond(502, { error: error.message })
    return respond(500, { error: 'Error interno' })
  }
})
