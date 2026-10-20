import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { handleWebhook } from './resendWebhook.ts'

/* El webhook de Resend (20/10/2026): le cambia el estado a la fila de `crm_emails` que escribió
   `send-email` al mandar. Lo llama Resend, sin JWT (`verify_jwt = false` en `config.toml`): la
   puerta es la firma svix, con el secreto `RESEND_WEBHOOK_SECRET` que da el panel de Resend.
   Que el estado solo avance lo decide `crm_email_evento()` en la base. */

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const cuerpo = await req.text()
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const r = await handleWebhook(
    { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    cuerpo,
    {
      secreto: Deno.env.get('RESEND_WEBHOOK_SECRET'),
      async registrar(e) {
        const { error } = await admin.rpc('crm_email_evento', {
          p_resend_id: e.resendId, p_status: e.estado, p_detalle: e.detalle, p_at: e.at,
        })
        return error ? { error: error.message } : {}
      },
    },
  )
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
