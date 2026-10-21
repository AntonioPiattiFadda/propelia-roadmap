import type { EmailMessage } from '../emailMessage.ts'
import type { LeadNotificationChannel } from './channels.ts'

/** Fila de lead_notification_events tal como la devuelve claim_lead_notification_events.
 *  Copiado de `propelia-frontend` (21/10/2026), sin `organization_id`: acá no hay organizaciones. */
export type LeadNotificationEvent = {
  id: string
  type: string
  subject_id: string
  actor_user_id: string
  attempts: number
  /** Datos del momento en que se encoló (p. ej. el horario anterior de una reprogramación). */
  payload?: Record<string, unknown>
}

/** Config por vía que recibe el render. Hoy siempre `{}`: las preferencias no guardan config. */
export type ChannelConfig = Record<string, unknown>

export type LoadResult<Ctx> = { skip: string } | { ctx: Ctx }
export type RecipientResult = { to: string } | { skip: string }

/**
 * Un tipo de evento. El orquestador no sabe nada del evento: le pide al handler los datos
 * (load), el destinatario por canal (recipient) y el mensaje (render).
 * Un evento nuevo = un handler nuevo + su entrada en handlers/index.ts.
 */
export interface LeadNotificationHandler<Ctx> {
  type: string
  load(event: LeadNotificationEvent, now: Date): Promise<LoadResult<Ctx>>
  recipient(channel: LeadNotificationChannel, ctx: Ctx): RecipientResult
  // Hoy sólo email. Al activar SMS: `EmailMessage | SmsMessage`.
  render(channel: LeadNotificationChannel, ctx: Ctx, config: ChannelConfig, to: string): EmailMessage
}
