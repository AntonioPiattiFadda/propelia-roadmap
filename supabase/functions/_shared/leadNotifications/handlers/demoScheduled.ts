import type { ChannelConfig, LeadNotificationEvent, LeadNotificationHandler, LoadResult, RecipientResult } from '../types.ts'
import type { LeadNotificationChannel } from '../channels.ts'
import type { EmailMessage } from '../../emailMessage.ts'
import { nombreEnBandeja, remitenteDe, replyToDe } from '../../plantillasEmail.ts'
import { demoRecipientEmail, type DemoScheduledRow } from '../demoQuery.ts'
import {
  PROPELIA_ORG,
  renderDemoCancelledEmail,
  renderDemoRescheduledEmail,
  renderDemoScheduledEmail,
  type DemoScheduledCtx,
} from '../templates/demoScheduledEmail.ts'

/* `visitScheduled` de `propelia-frontend` (21/10/2026), para las demos (`crm_meetings` con lead).
   Lo que cambia: no hay organización (la marca es Propelia), quien firma sale de `remitenteDe` como
   en las plantillas de «Mensajes» (nombre de firma, email solo si es @propelia.es, teléfono), y el
   destinatario es el mail de la invitación de la demo antes que el de la inmobiliaria. */

export interface DemoScheduledDb {
  loadDemo(id: string): Promise<DemoScheduledRow | null>
  /** Los emails del equipo: no son el lead aunque estén invitados. */
  teamEmails(): Promise<string[]>
}

type DemoDeps = {
  db: DemoScheduledDb
  /** Base pública de los PNG del mail (íconos y decoración). */
  assetsBaseUrl: string
}

type Ctx = DemoScheduledCtx & { event: LeadNotificationEvent; replyTo?: string; fromName: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const validEmail = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return EMAIL_RE.test(trimmed) ? trimmed : undefined
}

/** Lead, inmobiliaria y quien la tiene: lo que tiene que estar vivo para avisarle al lead. */
function peopleSkip(row: DemoScheduledRow): string | null {
  if (!row.has_lead) return 'no_lead'
  if (row.lead_deleted_at) return 'lead_deleted'
  if (!row.client || row.client.deleted_at) return 'no_client'
  if (!row.agent) return 'missing_data'
  if (!row.agent.activo) return 'agent_inactive'
  return null
}

function demoCtx(row: DemoScheduledRow, recipient: string | null, deps: DemoDeps, event: LeadNotificationEvent): Ctx {
  const remitente = remitenteDe(row.agent)
  const fullName = row.agent!.firma_nombre?.trim()
    ? remitente.nombre
    : [row.agent!.nombre, row.agent!.last_name].filter(p => p && p.trim()).join(' ')
  return {
    startsAt: row.starts_at,
    companyName: row.client!.company_name,
    clientFirstName: row.client!.first_name,
    clientEmail: recipient,
    agent: { firstName: fullName, lastName: '', email: remitente.email, phone: remitente.telefono || null },
    org: PROPELIA_ORG,
    assetsBaseUrl: deps.assetsBaseUrl,
    event,
    replyTo: replyToDe(remitente),
    fromName: nombreEnBandeja(remitente),
  }
}

/** Destinatario por email del lead: lo comparten todos los avisos al lead. */
export function emailRecipient(channel: LeadNotificationChannel, clientEmail: string | null | undefined): RecipientResult {
  if (channel !== 'email') return { skip: 'channel_not_supported' }
  const to = validEmail(clientEmail)
  return to ? { to } : { skip: 'no_email' }
}

const emailMessage = (to: string, ctx: Ctx, rendered: { subject: string; html: string }): EmailMessage => ({
  to,
  subject: rendered.subject,
  html: rendered.html,
  fromName: ctx.fromName,
  replyTo: ctx.replyTo,
})

function demoHandler(
  type: string,
  deps: DemoDeps,
  load: (row: DemoScheduledRow | null, event: LeadNotificationEvent, now: Date) => string | null,
  render: (ctx: DemoScheduledCtx, event: LeadNotificationEvent) => { subject: string; html: string },
): LeadNotificationHandler<Ctx> {
  return {
    type,
    async load(event, now): Promise<LoadResult<Ctx>> {
      const row = await deps.db.loadDemo(event.subject_id)
      const skip = load(row, event, now) ?? peopleSkip(row!)
      if (skip) return { skip }
      const recipient = demoRecipientEmail(row!, await deps.db.teamEmails())
      return { ctx: demoCtx(row!, recipient, deps, event) }
    },
    recipient: (channel, ctx) => emailRecipient(channel, ctx.clientEmail),
    render: (_channel, ctx, _config: ChannelConfig, to) => emailMessage(to, ctx, render(ctx, ctx.event)),
  }
}

const isPast = (iso: string, now: Date) => new Date(iso).getTime() < now.getTime()

export function createDemoScheduledHandler(deps: DemoDeps) {
  return demoHandler('demo_scheduled', deps, (row, _event, now) => {
    if (!row || row.deleted_at || row.status === 'cancelled') return 'demo_deleted'
    // Después de una caída no se manda "agendada" de una demo que ya empezó.
    if (isPast(row.starts_at, now)) return 'demo_in_past'
    return null
  }, (ctx) => renderDemoScheduledEmail(ctx))
}

/**
 * Reprogramada. El trigger encola uno por horario nuevo (dedupe_key = starts_at); si la demo
 * se volvió a mover antes de que salga, éste se saltea y sale sólo el del último horario.
 */
export function createDemoRescheduledHandler(deps: DemoDeps) {
  return demoHandler('demo_rescheduled', deps, (row, event, now) => {
    if (!row || row.deleted_at || row.status !== 'scheduled') return 'demo_deleted'
    const target = typeof event.payload?.starts_at === 'string' ? event.payload.starts_at : null
    if (target && new Date(target).getTime() !== new Date(row.starts_at).getTime()) return 'superseded'
    if (isPast(row.starts_at, now)) return 'demo_in_past'
    return null
  }, (ctx, event) => {
    const previous = event.payload?.previous_starts_at
    return renderDemoRescheduledEmail(ctx, typeof previous === 'string' ? previous : null)
  })
}

/** Cancelada. Si la demo se reactivó antes de que salga el aviso, no se manda. */
export function createDemoCancelledHandler(deps: DemoDeps) {
  return demoHandler('demo_cancelled', deps, (row, _event, now) => {
    if (!row || row.deleted_at) return 'demo_deleted'
    if (row.status !== 'cancelled') return 'not_cancelled'
    if (isPast(row.starts_at, now)) return 'demo_in_past'
    return null
  }, (ctx) => renderDemoCancelledEmail(ctx))
}
