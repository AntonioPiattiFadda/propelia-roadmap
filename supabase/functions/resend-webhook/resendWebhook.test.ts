import { assertEquals } from 'jsr:@std/assert@1'
import { type EventoEmail, eventoDe, firmaValida, handleWebhook } from './resendWebhook.ts'

// El ejemplo de la documentación de svix: secreto, id, timestamp, cuerpo y la firma que da.
const SECRETO = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek'
const TS = '1614265330'
const CUERPO = '{"test": 2432232314}'
const FIRMA = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='
const AHORA = Number(TS)

Deno.test('la firma de svix se verifica con su ejemplo', async () => {
  assertEquals(await firmaValida(SECRETO, { id: ID, timestamp: TS, signature: FIRMA }, CUERPO, AHORA), true)
  // Entre varias firmas separadas por espacio alcanza con que una calce.
  assertEquals(await firmaValida(SECRETO, { id: ID, timestamp: TS, signature: `v1,otra= ${FIRMA}` }, CUERPO, AHORA), true)
})

Deno.test('firma que no calza, cuerpo tocado, vieja o sin headers → inválida', async () => {
  assertEquals(await firmaValida(SECRETO, { id: ID, timestamp: TS, signature: 'v1,AAAA' }, CUERPO, AHORA), false)
  assertEquals(await firmaValida(SECRETO, { id: ID, timestamp: TS, signature: FIRMA }, CUERPO + ' ', AHORA), false)
  assertEquals(await firmaValida(SECRETO, { id: ID, timestamp: TS, signature: FIRMA }, CUERPO, AHORA + 301), false)
  assertEquals(await firmaValida(SECRETO, { id: null, timestamp: TS, signature: FIRMA }, CUERPO, AHORA), false)
})

Deno.test('eventoDe: el rebote trae el motivo', () => {
  assertEquals(eventoDe({
    type: 'email.bounced', created_at: '2026-10-20T10:00:00Z',
    data: { email_id: 'abc', bounce: { message: 'No existe', type: 'Permanent' } },
  }), { resendId: 'abc', estado: 'bounced', detalle: 'No existe', at: '2026-10-20T10:00:00Z' })
  assertEquals(eventoDe({ type: 'email.failed', data: { email_id: 'abc', failed: { reason: 'reached_daily_quota' } } })?.detalle, 'reached_daily_quota')
  assertEquals(eventoDe({ type: 'email.suppressed', data: { email_id: 'abc', suppressed: { message: 'En la lista' } } })?.estado, 'suppressed')
  assertEquals(eventoDe({ type: 'email.delivered', data: { email_id: 'abc' } })?.estado, 'delivered')
})

Deno.test('eventoDe: abierto, clic o sin id no se guardan', () => {
  assertEquals(eventoDe({ type: 'email.opened', data: { email_id: 'abc' } }), null)
  assertEquals(eventoDe({ type: 'email.bounced', data: {} }), null)
  assertEquals(eventoDe('nada'), null)
})

async function firmar(cuerpo: string) {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(SECRETO.slice(6)), c => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ID}.${TS}.${cuerpo}`))
  return { id: ID, timestamp: TS, signature: `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}` }
}

Deno.test('handleWebhook: registra el evento firmado y rechaza el que no', async () => {
  const registrados: EventoEmail[] = []
  const deps = { secreto: SECRETO, registrar: async (e: EventoEmail) => { registrados.push(e); return {} } }
  const cuerpo = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', bounce: { message: 'No existe' } } })

  assertEquals((await handleWebhook(await firmar(cuerpo), cuerpo, deps, AHORA)).status, 200)
  assertEquals(registrados.map(e => e.estado), ['bounced'])
  assertEquals((await handleWebhook({ id: ID, timestamp: TS, signature: 'v1,AAAA' }, cuerpo, deps, AHORA)).status, 401)
  assertEquals(registrados.length, 1)
})

Deno.test('handleWebhook: lo que no se guarda es 200; si la base falla, 500 para que Resend reintente', async () => {
  const abierto = JSON.stringify({ type: 'email.opened', data: { email_id: 'abc' } })
  assertEquals((await handleWebhook(await firmar(abierto), abierto, { secreto: SECRETO, registrar: async () => ({}) }, AHORA)).status, 200)
  const rebote = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc' } })
  assertEquals((await handleWebhook(await firmar(rebote), rebote, { secreto: SECRETO, registrar: async () => ({ error: 'x' }) }, AHORA)).status, 500)
  assertEquals((await handleWebhook(await firmar(rebote), rebote, { secreto: undefined, registrar: async () => ({}) }, AHORA)).status, 500)
})
