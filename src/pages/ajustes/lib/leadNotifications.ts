/**
 * Espejo de `AVAILABLE_CHANNELS` de supabase/functions/_shared/leadNotifications/channels.ts.
 * SMS y WhatsApp están cableados pero apagados: se muestran deshabilitados ("Próximamente").
 * Activar uno = agregarlo acá Y en el archivo de _shared. Copiado de `propelia-frontend`
 * (`src/constants/leadNotifications.ts`, 21/10/2026), con las demos en lugar de las visitas.
 */
export type LeadNotificationChannel = 'email' | 'sms' | 'whatsapp'

export const LEAD_NOTIFICATION_CHANNELS: readonly LeadNotificationChannel[] = ['email', 'sms', 'whatsapp']

export const AVAILABLE_LEAD_NOTIFICATION_CHANNELS: readonly LeadNotificationChannel[] = ['email']

export const isLeadNotificationChannelAvailable = (channel: LeadNotificationChannel) =>
  AVAILABLE_LEAD_NOTIFICATION_CHANNELS.includes(channel)

/** Mismos valores que el CHECK de lead_notification_preferences.event_type. */
export type LeadNotificationEventType =
  | 'demo_scheduled'
  | 'demo_rescheduled'
  | 'demo_cancelled'
  | 'demo_reminder_day_before'
  | 'demo_reminder_same_day'
  | 'demo_review_request'

export type LeadNotificationEventDef = {
  type: LeadNotificationEventType
  group: 'Demos'
  label: string
  /** Un SUPERADMIN lo puede prender. Los que no, se muestran "Próximamente". */
  configurable: boolean
}

/**
 * Los tres configurables tienen handler (`_shared/leadNotifications/handlers/`); el resto se muestra
 * "Próximamente", como en el producto. El grupo «Propiedad» (vendida / alquilada) no existe acá:
 * no hay inmuebles.
 */
export const LEAD_NOTIFICATION_EVENTS: readonly LeadNotificationEventDef[] = [
  { type: 'demo_scheduled', group: 'Demos', label: 'Demo agendada', configurable: true },
  { type: 'demo_rescheduled', group: 'Demos', label: 'Demo reprogramada', configurable: true },
  { type: 'demo_cancelled', group: 'Demos', label: 'Demo cancelada', configurable: true },
  { type: 'demo_reminder_day_before', group: 'Demos', label: 'Recordatorio día antes', configurable: false },
  { type: 'demo_reminder_same_day', group: 'Demos', label: 'Recordatorio mismo día', configurable: false },
  { type: 'demo_review_request', group: 'Demos', label: 'Pedido de reseña', configurable: false },
]
