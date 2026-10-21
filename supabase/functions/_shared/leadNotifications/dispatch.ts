import type { EmailMessage } from '../emailMessage.ts'
import { isAvailableChannel, type LeadNotificationChannel } from './channels.ts'
import type { ChannelConfig, LeadNotificationEvent, LeadNotificationHandler } from './types.ts'

export const MAX_ATTEMPTS = 3
export const CLAIM_LIMIT = 20

export type DeliveryWrite = {
  event_id: string
  channel: LeadNotificationChannel
  status: 'sent' | 'failed' | 'skipped'
  recipient: string | null
  provider_message_id: string | null
  error: string | null
}

export type EventPatch = {
  status: 'pending' | 'done' | 'failed'
  locked_at: null
  last_error: string | null
  processed_at?: string
  next_attempt_at?: string
}

export interface DispatchDb {
  claimEvents(limit: number): Promise<LeadNotificationEvent[]>
  /** Vías prendidas por un SUPERADMIN para este evento (lead_notification_preferences, del equipo). */
  enabledChannels(eventType: string): Promise<{ channel: string; config: ChannelConfig }[]>
  /** Canales con delivery `sent` o `skipped`: no se vuelven a intentar. */
  finishedChannels(eventId: string): Promise<string[]>
  upsertDelivery(delivery: DeliveryWrite): Promise<void>
  updateEvent(id: string, patch: EventPatch): Promise<void>
}

export type Senders = Partial<Record<LeadNotificationChannel, (msg: EmailMessage) => Promise<{ id: string }>>>

export type DispatchResult = { claimed: number; done: number; retried: number; failed: number }

type Outcome = { kind: 'ok'; note?: string } | { kind: 'retry'; error: string } | { kind: 'fatal'; error: string }

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function dispatchLeadNotifications(opts: {
  db: DispatchDb
  // deno-lint-ignore no-explicit-any
  handlers: Record<string, LeadNotificationHandler<any>>
  senders: Senders
  now: Date
  limit?: number
}): Promise<DispatchResult> {
  const events = await opts.db.claimEvents(opts.limit ?? CLAIM_LIMIT)
  const result: DispatchResult = { claimed: events.length, done: 0, retried: 0, failed: 0 }

  for (const event of events) {
    const outcome = await processEvent(event, opts).catch((e): Outcome => ({ kind: 'retry', error: errorMessage(e) }))
    const patch = closeEvent(event, outcome, opts.now)
    try {
      await opts.db.updateEvent(event.id, patch)
    } catch (e) {
      // Queda en processing: el claim lo recupera a los 10 minutos.
      console.error(`lead-notifications: no se pudo cerrar el evento ${event.id}: ${errorMessage(e)}`)
      continue
    }
    if (patch.status === 'done') result.done++
    else if (patch.status === 'pending') result.retried++
    else result.failed++
  }
  return result
}

async function processEvent(
  event: LeadNotificationEvent,
  // deno-lint-ignore no-explicit-any
  { db, handlers, senders, now }: { db: DispatchDb; handlers: Record<string, LeadNotificationHandler<any>>; senders: Senders; now: Date },
): Promise<Outcome> {
  const handler = handlers[event.type]
  if (!handler) return { kind: 'fatal', error: 'unknown_type' }

  const loaded = await handler.load(event, now)
  if ('skip' in loaded) return { kind: 'ok', note: `skip:${loaded.skip}` }

  const channels = (await db.enabledChannels(event.type))
    .filter((c): c is { channel: LeadNotificationChannel; config: ChannelConfig } =>
      isAvailableChannel(c.channel) && !!senders[c.channel as LeadNotificationChannel]
    )
  if (channels.length === 0) return { kind: 'ok', note: 'skip:no_channels' }

  const finished = new Set(await db.finishedChannels(event.id))
  const errors: string[] = []

  for (const { channel, config } of channels) {
    if (finished.has(channel)) continue
    const base = { event_id: event.id, channel }

    const target = handler.recipient(channel, loaded.ctx)
    if ('skip' in target) {
      await db.upsertDelivery({ ...base, status: 'skipped', recipient: null, provider_message_id: null, error: target.skip })
      continue
    }

    // Sólo fallos reales de render/envío caen acá.
    // Idempotency-Key estable por evento+canal: Resend dedupe los reenvíos durante 24h.
    let id: string | null
    let deliveryError: string | null = null
    try {
      const message = handler.render(channel, loaded.ctx, config, target.to)
      ;({ id } = await senders[channel]!({ ...message, idempotencyKey: `lead-notif:${event.id}:${channel}` }))
    } catch (e) {
      // Se chequea por `name` para no acoplar el orquestador al módulo del proveedor de email.
      if (e instanceof Error && e.name === 'EmailAlreadySentError') {
        // Resend ya había procesado esta key: el mail salió, se registra como enviado.
        id = null
        deliveryError = 'idempotent_conflict'
      } else {
        const message = errorMessage(e)
        errors.push(`${channel}: ${message}`)
        await db.upsertDelivery({ ...base, status: 'failed', recipient: target.to, provider_message_id: null, error: message })
        continue
      }
    }
    // At-least-once: el mail ya salió. Si registrar 'sent' falla y además falla cerrar el evento,
    // el reclaim (10 min) puede reenviar, pero con la Idempotency-Key Resend dedupe los duplicados
    // dentro de las 24h. No se empuja a errors: reintentar duplicaría el envío.
    try {
      await db.upsertDelivery({ ...base, status: 'sent', recipient: target.to, provider_message_id: id, error: deliveryError })
    } catch (e) {
      console.error(`lead-notifications: no se pudo registrar el envío ${channel} del evento ${event.id}: ${errorMessage(e)}`)
    }
  }

  return errors.length ? { kind: 'retry', error: errors.join('; ') } : { kind: 'ok' }
}

function closeEvent(event: LeadNotificationEvent, outcome: Outcome, now: Date): EventPatch {
  if (outcome.kind === 'ok') {
    return { status: 'done', locked_at: null, last_error: outcome.note ?? null, processed_at: now.toISOString() }
  }
  if (outcome.kind === 'fatal' || event.attempts >= MAX_ATTEMPTS) {
    return { status: 'failed', locked_at: null, last_error: outcome.error, processed_at: now.toISOString() }
  }
  // attempts ya viene incrementado por el claim: 1 → 2 min, 2 → 4 min.
  return {
    status: 'pending',
    locked_at: null,
    last_error: outcome.error,
    next_attempt_at: new Date(now.getTime() + 2 ** event.attempts * 60_000).toISOString(),
  }
}
