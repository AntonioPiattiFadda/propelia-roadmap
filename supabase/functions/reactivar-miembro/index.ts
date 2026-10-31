import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { reactivarMiembro, type ReactivarMiembroDb } from './reactivarMiembro.ts'
import { withoutOAuthClients } from '../_shared/auth/oauthClientGuard.ts'

/* Reactivar a un miembro desde /equipo, con contraseña nueva opcional. Existe porque cambiarle la
   contraseña a otra cuenta pide el service_role, que no puede ir al navegador, y el front no tiene
   policies de escritura sobre `users`. Quién puede llamarla lo decide `reactivarMiembro`
   (SUPERADMIN activo), no el JWT: el JWT solo dice quién sos. */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = { ...cors, 'Content-Type': 'application/json' }

function dbDe(admin: SupabaseClient): ReactivarMiembroDb {
  return {
    async quienLlama(id) {
      const { data } = await admin.from('users').select('rol, activo').eq('id', id).maybeSingle()
      return data ?? null
    },
    async miembro(id) {
      const { data } = await admin.from('users').select('activo').eq('id', id).maybeSingle()
      return data ?? null
    },
    async cambiarPassword(id, password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password })
      return error ? { error: error.message } : {}
    },
    async activar(id) {
      const { error } = await admin.from('users').update({ activo: true }).eq('id', id)
      return error ? { error: error.message } : {}
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

  const callerId = await quienLlamaId(req)
  if (!callerId) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: json })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const r = await reactivarMiembro(callerId, { userId: texto(body.userId), password: texto(body.password) }, dbDe(admin))
  return r.ok
    ? new Response(JSON.stringify({ ok: true }), { headers: json })
    : new Response(JSON.stringify({ error: r.error }), { status: r.status, headers: json })
}))
