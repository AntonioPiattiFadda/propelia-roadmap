import { expect, it } from 'vitest'
// Portado de los Deno.test del producto: mismos asserts, sobre vitest (acá no hay Deno).
const assertEquals = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected)

import { type DeliveryWrite, dispatchLeadNotifications, type DispatchDb, type EventPatch, MAX_ATTEMPTS } from '../../../../supabase/functions/_shared/leadNotifications/dispatch'
import type { ChannelConfig, LeadNotificationEvent, LeadNotificationHandler } from '../../../../supabase/functions/_shared/leadNotifications/types'
import type { EmailMessage } from '../../../../supabase/functions/_shared/emailMessage'

const NOW = new Date('2030-01-01T00:00:00Z')

const ev = (over: Partial<LeadNotificationEvent> = {}): LeadNotificationEvent => ({
  id: 'ev1', type: 'demo_scheduled', subject_id: 'v1', actor_user_id: 'u1', attempts: 1, ...over,
})

type Ctx = { email: string | null }

const handler = (over: Partial<LeadNotificationHandler<Ctx>> = {}): LeadNotificationHandler<Ctx> => ({
  type: 'demo_scheduled',
  load: () => Promise.resolve({ ctx: { email: 'ana@example.com' } }),
  recipient: (_c, ctx) => (ctx.email ? { to: ctx.email } : { skip: 'no_email' }),
  render: (_c, _ctx, config, to) => ({ to, subject: 's', html: 'h', replyTo: config.reply_to as string | undefined }),
  ...over,
})

function makeDb(opts: {
  events: LeadNotificationEvent[]
  channels?: { channel: string; config: ChannelConfig }[]
  finished?: string[]
}) {
  const deliveries: DeliveryWrite[] = []
  const patches: { id: string; patch: EventPatch }[] = []
  const db: DispatchDb = {
    claimEvents: () => Promise.resolve(opts.events),
    enabledChannels: () => Promise.resolve(opts.channels ?? [{ channel: 'email', config: {} }]),
    finishedChannels: () => Promise.resolve(opts.finished ?? []),
    upsertDelivery: (d) => { deliveries.push(d); return Promise.resolve() },
    updateEvent: (id, patch) => { patches.push({ id, patch }); return Promise.resolve() },
  }
  return { db, deliveries, patches }
}

function emailSender(fail?: string) {
  const sent: EmailMessage[] = []
  const send = (msg: EmailMessage) => {
    if (fail) return Promise.reject(new Error(fail))
    sent.push(msg)
    return Promise.resolve({ id: `re_${sent.length}` })
  }
  return { send, sent }
}

const run = (db: DispatchDb, h: LeadNotificationHandler<Ctx>, send: (m: EmailMessage) => Promise<{ id: string }>) =>
  dispatchLeadNotifications({ db, handlers: { demo_scheduled: h }, senders: { email: send }, now: NOW })

it('camino feliz: manda el email, registra sent y cierra done', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev()], channels: [{ channel: 'email', config: { reply_to: 'j@d.co' } }] })
  const s = emailSender()
  const result = await run(db, handler(), s.send)
  assertEquals(result, { claimed: 1, done: 1, retried: 0, failed: 0 })
  assertEquals(s.sent[0].to, 'ana@example.com')
  assertEquals(s.sent[0].replyTo, 'j@d.co')
  assertEquals(deliveries, [{ event_id: 'ev1', channel: 'email', status: 'sent', recipient: 'ana@example.com', provider_message_id: 're_1', error: null }])
  assertEquals(patches[0].patch.status, 'done')
  assertEquals(patches[0].patch.processed_at, NOW.toISOString())
  assertEquals(patches[0].patch.last_error, null)
  assertEquals(s.sent[0].idempotencyKey, 'lead-notif:ev1:email')
})

it('Resend ya procesó la key (EmailAlreadySentError): delivery sent idempotent_conflict, done sin reintento', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev()] })
  const err = new Error('dup')
  err.name = 'EmailAlreadySentError'
  const result = await run(db, handler(), () => Promise.reject(err))
  assertEquals(result, { claimed: 1, done: 1, retried: 0, failed: 0 })
  assertEquals(deliveries, [{ event_id: 'ev1', channel: 'email', status: 'sent', recipient: 'ana@example.com', provider_message_id: null, error: 'idempotent_conflict' }])
  assertEquals(patches[0].patch.status, 'done')
  assertEquals(patches[0].patch.last_error, null)
})

it('pide las vías del equipo para el tipo de este evento', async () => {
  const { db } = makeDb({ events: [ev({ type: 'demo_scheduled', actor_user_id: 'agente-7' })] })
  const asked: string[] = []
  const original = db.enabledChannels
  db.enabledChannels = (eventType) => { asked.push(eventType); return original(eventType) }
  await run(db, handler(), emailSender().send)
  assertEquals(asked, ['demo_scheduled'])
})

it('equipo sin canales prendidos: done sin envíos', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev()], channels: [] })
  const s = emailSender()
  await run(db, handler(), s.send)
  assertEquals(s.sent.length, 0)
  assertEquals(deliveries.length, 0)
  assertEquals(patches[0].patch.status, 'done')
  assertEquals(patches[0].patch.last_error, 'skip:no_channels')
})

it('SMS prendido se ignora: no está entre los canales disponibles', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev()], channels: [{ channel: 'sms', config: {} }] })
  const s = emailSender()
  await run(db, handler(), s.send)
  assertEquals(s.sent.length, 0)
  assertEquals(deliveries.length, 0)
  assertEquals(patches[0].patch.status, 'done')
})

it('cliente sin email: delivery skipped no_email y done, sin reintento', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev()] })
  const s = emailSender()
  await run(db, handler({ load: () => Promise.resolve({ ctx: { email: null } }) }), s.send)
  assertEquals(s.sent.length, 0)
  assertEquals(deliveries, [{ event_id: 'ev1', channel: 'email', status: 'skipped', recipient: null, provider_message_id: null, error: 'no_email' }])
  assertEquals(patches[0].patch.status, 'done')
})

it('load devuelve skip (visita cancelada): done sin leer canales ni enviar', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev()] })
  const s = emailSender()
  await run(db, handler({ load: () => Promise.resolve({ skip: 'visit_deleted' }) }), s.send)
  assertEquals(s.sent.length, 0)
  assertEquals(deliveries.length, 0)
  assertEquals(patches[0].patch.status, 'done')
  assertEquals(patches[0].patch.last_error, 'skip:visit_deleted')
})

it('no reenvía un canal que ya quedó sent en una corrida anterior', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev({ attempts: 2 })], finished: ['email'] })
  const s = emailSender()
  await run(db, handler(), s.send)
  assertEquals(s.sent.length, 0)
  assertEquals(deliveries.length, 0)
  assertEquals(patches[0].patch.status, 'done')
})

it('fallo del proveedor: failed en la delivery y el evento vuelve a pending con backoff', async () => {
  const { db, deliveries, patches } = makeDb({ events: [ev({ attempts: 1 })] })
  const result = await run(db, handler(), emailSender('Resend caído').send)
  assertEquals(result, { claimed: 1, done: 0, retried: 1, failed: 0 })
  assertEquals(deliveries[0].status, 'failed')
  assertEquals(deliveries[0].recipient, 'ana@example.com')
  assertEquals(deliveries[0].error, 'Resend caído')
  assertEquals(patches[0].patch.status, 'pending')
  // 2^1 minutos después de NOW
  assertEquals(patches[0].patch.next_attempt_at, new Date(NOW.getTime() + 2 * 60_000).toISOString())
  assertEquals(patches[0].patch.last_error, 'email: Resend caído')
})

it(`al intento ${MAX_ATTEMPTS} el fallo es definitivo`, async () => {
  const { db, patches } = makeDb({ events: [ev({ attempts: MAX_ATTEMPTS })] })
  const result = await run(db, handler(), emailSender('Resend caído').send)
  assertEquals(result.failed, 1)
  assertEquals(patches[0].patch.status, 'failed')
})

it('tipo desconocido: failed sin reintento', async () => {
  const { db, patches } = makeDb({ events: [ev({ type: 'algo_nuevo', attempts: 1 })] })
  await run(db, handler(), emailSender().send)
  assertEquals(patches[0].patch, { status: 'failed', locked_at: null, last_error: 'unknown_type', processed_at: NOW.toISOString() })
})

it('un evento que explota no corta los demás', async () => {
  const { db, patches } = makeDb({ events: [ev({ id: 'ev-roto', subject_id: 'roto' }), ev({ id: 'ev-ok', subject_id: 'ok' })] })
  const s = emailSender()
  const h = handler({
    load: (e) => e.subject_id === 'roto' ? Promise.reject(new Error('DB timeout')) : Promise.resolve({ ctx: { email: 'ana@example.com' } }),
  })
  const result = await run(db, h, s.send)
  assertEquals(result, { claimed: 2, done: 1, retried: 1, failed: 0 })
  assertEquals(patches.find((p) => p.id === 'ev-roto')!.patch.last_error, 'DB timeout')
  assertEquals(patches.find((p) => p.id === 'ev-ok')!.patch.status, 'done')
  assertEquals(s.sent.length, 1)
})

it('si falla registrar el envío (sent), no reenvía y cierra done', async () => {
  const { db, patches } = makeDb({ events: [ev()] })
  const original = db.upsertDelivery
  db.upsertDelivery = (d) => (d.status === 'sent' ? Promise.reject(new Error('db down')) : original(d))
  const s = emailSender()
  const result = await run(db, handler(), s.send)
  assertEquals(s.sent.length, 1)
  assertEquals(result, { claimed: 1, done: 1, retried: 0, failed: 0 })
  assertEquals(patches[0].patch.status, 'done')
})

it('si falla guardar el estado de un evento, sigue con el siguiente', async () => {
  const { db, patches } = makeDb({ events: [ev({ id: 'a' }), ev({ id: 'b', subject_id: 'v2' })] })
  const original = db.updateEvent
  db.updateEvent = (id, patch) => (id === 'a' ? Promise.reject(new Error('write failed')) : original(id, patch))
  const result = await run(db, handler(), emailSender().send)
  assertEquals(result.claimed, 2)
  assertEquals(patches.map((p) => p.id), ['b'])
})
