import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { crearMiembro, type CrearMiembroDb } from './crearMiembro.ts'

/* Alta de un miembro desde /equipo. Existe porque crear una cuenta en auth.users pide el
   service_role, que no puede ir al navegador. Quién puede llamarla lo decide `crearMiembro`
   (SUPERADMIN activo), no el JWT: el JWT solo dice quién sos. */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = { ...cors, 'Content-Type': 'application/json' }

function dbDe(admin: SupabaseClient): CrearMiembroDb {
  return {
    async quienLlama(id) {
      const { data } = await admin.from('users').select('rol, activo').eq('id', id).maybeSingle()
      return data ?? null
    },
    async coloresUsados() {
      const { data } = await admin.from('users').select('color')
      return (data ?? []).map(f => f.color as string)
    },
    async crearCuenta({ email, password }) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (error) return { error: error.message }
      return { id: data.user!.id }
    },
    async crearFila(fila) {
      const { error } = await admin.from('users').insert(fila)
      return error ? { error: error.message } : {}
    },
    async borrarCuenta(id) {
      await admin.auth.admin.deleteUser(id)
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const callerId = await quienLlamaId(req)
  if (!callerId) return new Response(JSON.stringify({ error: 'Sesión inválida' }), { status: 401, headers: json })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const r = await crearMiembro(
    callerId,
    { email: texto(body.email), password: texto(body.password), nombre: texto(body.nombre), rol: texto(body.rol) },
    dbDe(admin),
  )
  return r.ok
    ? new Response(JSON.stringify({ user: r.user }), { headers: json })
    : new Response(JSON.stringify({ error: r.error }), { status: r.status, headers: json })
})
