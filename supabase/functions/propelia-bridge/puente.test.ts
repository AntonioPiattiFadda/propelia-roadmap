import { assertEquals } from 'jsr:@std/assert@1'
import { reenviar, type PuenteDeps } from './puente.ts'

type Llamada = { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function deps(over: Partial<PuenteDeps> & { responde?: () => Response | Promise<Response> } = {}) {
  const llamadas: Llamada[] = []
  const d: PuenteDeps = {
    db: { quienLlama: async () => ({ email: 'toni@propelia.es', rol: 'SUPERADMIN', activo: true }) },
    url: 'https://propelia.supabase.co/functions/v1/roadmap-bridge',
    secreto: 'secreto',
    fetch: (async (url: string, init: RequestInit) => {
      llamadas.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })
      return over.responde ? over.responde() : new Response(JSON.stringify({ organizations: [] }), { status: 200 })
    }) as typeof fetch,
    ...over,
  }
  return { d, llamadas }
}

Deno.test('sin sesión: 401 y no llama a Propelia', async () => {
  const { d, llamadas } = deps()
  const r = await reenviar(null, { action: 'list_organizations' }, d)
  assertEquals(r.status, 401)
  assertEquals(llamadas.length, 0)
})

Deno.test('un SDR, un inactivo o alguien sin fila: 403', async () => {
  for (const fila of [
    { email: 'sdr@propelia.es', rol: 'SDR', activo: true },
    { email: 'baja@propelia.es', rol: 'SUPERADMIN', activo: false },
    null,
  ]) {
    const { d, llamadas } = deps({ db: { quienLlama: async () => fila } })
    const r = await reenviar('u1', { action: 'list_organizations' }, d)
    assertEquals(r.status, 403)
    assertEquals(llamadas.length, 0)
  }
})

Deno.test('acción desconocida o cuerpo que no es objeto: 400', async () => {
  const { d, llamadas } = deps()
  assertEquals((await reenviar('u1', { action: 'borrar_todo' }, d)).status, 400)
  assertEquals((await reenviar('u1', null, d)).status, 400)
  assertEquals((await reenviar('u1', [1], d)).status, 400)
  assertEquals(llamadas.length, 0)
})

Deno.test('sin URL o sin secreto: 502 sin llamar', async () => {
  for (const over of [{ url: undefined }, { secreto: undefined }]) {
    const { d, llamadas } = deps(over)
    const r = await reenviar('u1', { action: 'list_organizations' }, d)
    assertEquals(r.status, 502)
    assertEquals(llamadas.length, 0)
  }
})

Deno.test('reenvía con el secreto y el email del que llama, y devuelve lo de Propelia tal cual', async () => {
  const { d, llamadas } = deps()
  const r = await reenviar('u1', { action: 'get_organization', org_id: 'o1' }, d)
  assertEquals(r, { status: 200, body: { organizations: [] } })
  assertEquals(llamadas[0].url, 'https://propelia.supabase.co/functions/v1/roadmap-bridge')
  assertEquals(llamadas[0].headers['x-bridge-secret'], 'secreto')
  assertEquals(llamadas[0].body, { action: 'get_organization', org_id: 'o1', actor: { email: 'toni@propelia.es' } })
})

Deno.test('el actor no lo elige el navegador', async () => {
  const { d, llamadas } = deps()
  await reenviar('u1', { action: 'list_organizations', actor: { email: 'otro@propelia.es' } }, d)
  assertEquals(llamadas[0].body.actor, { email: 'toni@propelia.es' })
})

Deno.test('un error de Propelia vuelve con su status y su mensaje', async () => {
  const { d } = deps({
    responde: () => new Response(JSON.stringify({ error: 'not_demo_org', message: 'Sólo en la demo.' }), { status: 409 }),
  })
  assertEquals(await reenviar('u1', { action: 'send_simulated_inbound' }, d), {
    status: 409,
    body: { error: 'not_demo_org', message: 'Sólo en la demo.' },
  })
})

Deno.test('un 401 de Propelia es el secreto, no la sesión: 502', async () => {
  const { d } = deps({ responde: () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) })
  const r = await reenviar('u1', { action: 'list_organizations' }, d)
  assertEquals(r.status, 502)
})

Deno.test('Propelia caído o respondiendo algo que no es JSON: 502', async () => {
  const caido = deps({ fetch: (() => Promise.reject(new Error('red'))) as typeof fetch })
  assertEquals((await reenviar('u1', { action: 'list_organizations' }, caido.d)).status, 502)
  const html = deps({ responde: () => new Response('<html>', { status: 500 }) })
  assertEquals((await reenviar('u1', { action: 'list_organizations' }, html.d)).status, 502)
})

Deno.test('create_org_with_users pasa (el paso 1 del onboarding)', async () => {
  const { d, llamadas } = deps()
  const r = await reenviar('u1', { action: 'create_org_with_users', organization_name: 'Fincas', users: [] }, d)
  assertEquals(r.status, 200)
  assertEquals(llamadas[0].body.action, 'create_org_with_users')
  assertEquals(llamadas[0].body.organization_name, 'Fincas')
})
