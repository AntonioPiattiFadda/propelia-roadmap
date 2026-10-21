/* El mensaje que manda `email.ts`. Aparte y sin `Deno` (21/10/2026): lo importan también los avisos
   a leads (`leadNotifications/`), cuyos módulos puros se prueban desde el front con vitest. */

/** `content` va en base64. Resend acepta hasta 40MB por mail, contando el base64. */
export type EmailAttachment = { filename: string; content: string }

export type EmailMessage = {
  /** El nombre que se ve en la bandeja («Antonio de Propelia»). La dirección no cambia nunca. */
  fromName?: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  attachments?: EmailAttachment[]
  /** Resend dedupe 24h: misma key + mismo payload devuelve la respuesta original sin reenviar. */
  idempotencyKey?: string
}
