import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'
import { dispatchLeadNotifications } from '../_shared/leadNotifications/dispatch.ts'
import { buildHandlers } from '../_shared/leadNotifications/handlers/index.ts'
import {
  createSupabaseDemoScheduledDb,
  createSupabaseDispatchDb,
  emailAssetsBaseUrl,
} from '../_shared/leadNotifications/supabaseAdapters.ts'

const jsonHeaders = { 'Content-Type': 'application/json' }

/**
 * Orquestador de avisos a leads (copiado de `propelia-frontend`, 21/10/2026): toma los eventos
 * pendientes de `lead_notification_events` (los encolan los triggers de `crm_meetings`) y manda
 * por cada vía que un SUPERADMIN prendió en Ajustes → «Avisos a leads». Lo llama el cron
 * `lead-notifications-dispatch` cada minuto con la anon key, como los crons del calendario (el
 * producto usa un secreto de Vault). Llamarlo de más no manda nada de más: solo vacía la cola, y
 * cada envío lleva Idempotency-Key.
 */
Deno.serve(async (_req: Request) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const result = await dispatchLeadNotifications({
      db: createSupabaseDispatchDb(admin),
      handlers: buildHandlers({
        demoDb: createSupabaseDemoScheduledDb(admin),
        assetsBaseUrl: emailAssetsBaseUrl(Deno.env.get('EMAIL_ASSETS_BASE_URL'), Deno.env.get('APP_BASE_URL')),
      }),
      senders: { email: (msg) => sendEmail(msg) },
      now: new Date(),
    })
    return new Response(JSON.stringify(result), { headers: jsonHeaders })
  } catch (error) {
    console.error('lead-notifications-dispatch:', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders })
  }
})
