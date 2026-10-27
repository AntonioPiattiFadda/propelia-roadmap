import { assertEquals } from 'jsr:@std/assert@1'
import { altaPublica, type AltaPublica, type AltaPublicaDb } from './altaPublica.ts'

const TOKEN = '7f3a9c2e-b41d-4e8a-9d5f-2c6b1a0e8f73'
const ALTA: AltaPublica = { inmobiliaria: 'Fincas Ribera', web: null, enviado: false, miembros: [] }
const MARTA = { first_name: 'Marta', last_name: 'Gil', email: 'marta@f.es', phone: '+34612345678', role: 'admin', is_owner: true }

function db(over: Partial<AltaPublicaDb> = {}) {
  const llamadas: unknown[][] = []
  const base: AltaPublicaDb = {
    leer: async token => { llamadas.push(['leer', token]); return { data: ALTA } },
    enviar: async (...args) => { llamadas.push(['enviar', ...args]); return {} },
    reabrir: async token => { llamadas.push(['reabrir', token]); return {} },
  }
  return { db: { ...base, ...over }, llamadas }
}

Deno.test('un token que no es un uuid es «no existe» y no llega a la base', async () => {
  const { db: d, llamadas } = db()
  assertEquals(await altaPublica({ accion: 'leer', token: 'nada' }, d), { ok: false, status: 404, error: 'alta_no_existe' })
  assertEquals(llamadas.length, 0)
})

Deno.test('leer devuelve el alta', async () => {
  const { db: d } = db()
  assertEquals(await altaPublica({ accion: 'leer', token: TOKEN }, d), { ok: true, status: 200, body: { alta: ALTA } })
})

Deno.test('leer sin fila (token de otra alta o alta terminada) es 404', async () => {
  const { db: d } = db({ leer: async () => ({ data: null }) })
  assertEquals(await altaPublica({ accion: 'leer', token: TOKEN }, d), { ok: false, status: 404, error: 'alta_no_existe' })
})

Deno.test('enviar pasa todo a la base', async () => {
  const { db: d, llamadas } = db()
  const r = await altaPublica({ accion: 'enviar', token: TOKEN, inmobiliaria: 'Fincas Ribera', web: '', miembros: [MARTA] }, d)
  assertEquals(r, { ok: true, status: 200, body: { ok: true } })
  assertEquals(llamadas, [['enviar', TOKEN, 'Fincas Ribera', '', [MARTA]]])
})

Deno.test('enviar sin inmobiliaria o sin equipo no llega a la base', async () => {
  const { db: d, llamadas } = db()
  assertEquals((await altaPublica({ accion: 'enviar', token: TOKEN, inmobiliaria: ' ', miembros: [MARTA] }, d)), { ok: false, status: 400, error: 'alta_falta_inmobiliaria' })
  assertEquals((await altaPublica({ accion: 'enviar', token: TOKEN, inmobiliaria: 'F', miembros: [] }, d)), { ok: false, status: 400, error: 'alta_sin_miembros' })
  assertEquals(llamadas.length, 0)
})

Deno.test('las claves de la base se traducen a un status', async () => {
  const con = (error: string) => db({ enviar: async () => ({ error }) }).db
  const enviar = (error: string) => altaPublica({ accion: 'enviar', token: TOKEN, inmobiliaria: 'F', miembros: [MARTA] }, con(error))
  assertEquals(await enviar('alta_ya_enviada'), { ok: false, status: 409, error: 'alta_ya_enviada' })
  assertEquals(await enviar('alta_responsable_admin'), { ok: false, status: 400, error: 'alta_responsable_admin' })
  assertEquals(await enviar('alta_no_existe'), { ok: false, status: 404, error: 'alta_no_existe' })
  // Lo que no es una clave nuestra no se le muestra al cliente.
  assertEquals(await enviar('connection refused'), { ok: false, status: 500, error: 'alta_error' })
})

Deno.test('reabrir pasa a la base', async () => {
  const { db: d, llamadas } = db()
  assertEquals(await altaPublica({ accion: 'reabrir', token: TOKEN }, d), { ok: true, status: 200, body: { ok: true } })
  assertEquals(llamadas, [['reabrir', TOKEN]])
})

Deno.test('reabrir lo ya importado es 409 con su clave', async () => {
  const d = db({ reabrir: async () => ({ error: 'alta_ya_importada' }) }).db
  assertEquals(await altaPublica({ accion: 'reabrir', token: TOKEN }, d), { ok: false, status: 409, error: 'alta_ya_importada' })
})

Deno.test('una acción desconocida es 400', async () => {
  const { db: d } = db()
  assertEquals(await altaPublica({ accion: 'borrar', token: TOKEN }, d), { ok: false, status: 400, error: 'alta_accion_invalida' })
})
