/**
 * Canales de aviso a leads. `LeadNotificationChannel` son los que existen en la tabla;
 * `AVAILABLE_CHANNELS` es la LLAVE GLOBAL: el orquestador sólo despacha lo que está acá.
 * SMS y WhatsApp están cableados (tabla, UI, contrato) pero apagados: activar uno = implementar
 * su envío, agregarlo acá y en `src/pages/ajustes/lib/leadNotifications.ts`. Copiado de `propelia-frontend`.
 */
export type LeadNotificationChannel = 'email' | 'sms' | 'whatsapp'

export const AVAILABLE_CHANNELS: readonly LeadNotificationChannel[] = ['email']

export function isAvailableChannel(channel: string): channel is LeadNotificationChannel {
  return (AVAILABLE_CHANNELS as readonly string[]).includes(channel)
}
