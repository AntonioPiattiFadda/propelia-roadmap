import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { withoutOAuthClients } from '../_shared/auth/oauthClientGuard.ts'
import { progreso, type ProgresoDb } from './progreso.ts'

/* La vuelta del puente (6/11/2026): la página /onboarding de crm.propelia.es (propelia-frontend) pide
   acá el avance del onboarding de su organización. La llama la edge `onboarding-progress` del producto,
   nunca un navegador. Sin JWT (`verify_jwt = false`): el producto no tiene un JWT de este proyecto. La
   puerta es `x-bridge-secret` = PROPELIA_BRIDGE_SECRET, el mismo valor que el producto usa como
   ROADMAP_BRIDGE_SECRET. Contrato en docs/onboarding/PUENTE.md.
   Body: { organization_id }. */

const json = { 'Content-Type': 'application/json' }

type Fila = {
  created_at: string
  client: { company_name: string | null } | null
  onboarding: { created_at: string; completed_at: string | null; company_name: string | null; tareas: { task_id: string }[] } | null
}

function dbDe(admin: SupabaseClient): ProgresoDb {
  return {
    async onboardingDeLaOrg(orgId) {
      // Una org la ata un solo lead (`client_onboarding_importar_equipo` y `_vincular_org` lo cuidan);
      // si hubiera más, gana el más nuevo con alta.
      const { data, error } = await admin
        .from('crm_leads')
        .select(`created_at,
          client:crm_clients(company_name),
          onboarding:client_onboardings!inner(created_at, completed_at, company_name, tareas:client_onboarding_tasks(task_id))`)
        .eq('propelia_organization_id', orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) return { data: null, error: error.message }
      const f = (data?.[0] ?? null) as unknown as Fila | null
      if (!f?.onboarding) return { data: null }
      return {
        data: {
          empresa: f.onboarding.company_name?.trim() || f.client?.company_name?.trim() || '',
          iniciado: f.onboarding.created_at,
          completado: f.onboarding.completed_at,
          tareas: f.onboarding.tareas.map(t => t.task_id),
        },
      }
    },
  }
}

Deno.serve(withoutOAuthClients(async req => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'metodo_invalido' }), { status: 405, headers: json })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const r = await progreso({
    secretoRecibido: req.headers.get('x-bridge-secret'),
    secreto: Deno.env.get('PROPELIA_BRIDGE_SECRET'),
    body: body && typeof body === 'object' ? body : {},
  }, dbDe(admin))
  if (!r.ok && r.status >= 500) console.error('onboarding-progreso', r.error)
  return r.ok
    ? new Response(JSON.stringify(r.body), { headers: json })
    : new Response(JSON.stringify({ error: r.error }), { status: r.status, headers: json })
}))
