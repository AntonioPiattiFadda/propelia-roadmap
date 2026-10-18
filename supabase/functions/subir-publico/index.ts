import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/* TEMPORAL (18/10/2026): da una URL firmada para subir un archivo al bucket `publico`, que no tiene
   policies de escritura. Existe para subir el vídeo de los mails desde el botón «Subir vídeo» de
   la cabecera del CRM, porque la cuenta del CLI no tiene permisos de storage. Solo SUPERADMIN
   activo y solo bajo `videos/`. Se borra junto con el botón. */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const RUTA = /^videos\/[A-Za-z0-9._-]+$/

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await user.auth.getUser()
  if (!auth?.user) return respond(401, { error: 'Sesión inválida' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: fila } = await admin.from('users').select('rol, activo').eq('id', auth.user.id).maybeSingle()
  if (!fila?.activo || fila.rol !== 'SUPERADMIN') return respond(403, { error: 'No autorizado' })

  const body = (await req.json().catch(() => ({}))) as { path?: unknown }
  const path = typeof body.path === 'string' ? body.path : ''
  if (!RUTA.test(path)) return respond(400, { error: 'Ruta inválida' })

  const { data, error } = await admin.storage.from('publico').createSignedUploadUrl(path, { upsert: true })
  if (error || !data) return respond(500, { error: error?.message ?? 'No se pudo firmar la subida' })
  return respond(200, { path: data.path, token: data.token })
})
