/* El envío a mano desde el front, sin Supabase adentro: quién llama, validar y mandar. Hoy lo usa
   solo el formulario de prueba del CRM. Es el `send-email` del producto con una diferencia: allá
   alcanza con tener sesión y acá hace falta ser SUPERADMIN activo, porque lo que sale lleva
   `info@propelia.es` y cualquier texto. Los envíos automáticos del CRM no pasan por acá: llaman
   a `_shared/email.ts` desde el servidor. */

import type { EmailAttachment, EmailMessage } from '../_shared/email.ts'

export type SendEmailInput = { to: string; subject: string; text: string; attachments: unknown }

export type SendEmailDeps = {
  getCaller(id: string): Promise<{ rol: string; activo: boolean } | null>
  send(msg: EmailMessage): Promise<{ id: string }>
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
/* Medido sobre el base64, que es lo que viaja. Resend acepta 40MB, pero el cuerpo entero pasa
   por la edge function en memoria: con 10MB alcanza para probar y para lo que va a mandar el CRM. */
export const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024

const fail = (status: number, error: string): SendEmailResult => ({ ok: false, status, error })

/** `null` si la forma no es la esperada: una lista de `{ filename, content }` con content en base64. */
export function parseAttachments(value: unknown): EmailAttachment[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null
  const out: EmailAttachment[] = []
  for (const a of value) {
    if (!a || typeof a !== 'object') return null
    const { filename, content } = a as Record<string, unknown>
    if (typeof filename !== 'string' || !filename.trim()) return null
    if (typeof content !== 'string' || !content || !BASE64.test(content)) return null
    out.push({ filename: filename.trim(), content })
  }
  return out
}

export async function handleSendEmail(callerId: string, input: SendEmailInput, deps: SendEmailDeps): Promise<SendEmailResult> {
  // La misma regla que `es_superadmin()`: rol y fila activa.
  const caller = await deps.getCaller(callerId)
  if (!caller || !caller.activo || caller.rol !== 'SUPERADMIN') return fail(403, 'No autorizado')

  const to = input.to.trim()
  const subject = input.subject.trim()
  if (!EMAIL.test(to)) return fail(400, 'La casilla de destino no es válida')
  if (!subject) return fail(400, 'Falta el asunto')
  if (!input.text.trim()) return fail(400, 'Falta el mensaje')

  const attachments = parseAttachments(input.attachments)
  if (!attachments) return fail(400, 'Adjuntos inválidos')
  if (attachments.reduce((n, a) => n + a.content.length, 0) > MAX_ATTACHMENTS_BYTES) {
    return fail(413, 'Los adjuntos pasan los 10MB')
  }

  const { id } = await deps.send({ to, subject, text: input.text, ...(attachments.length ? { attachments } : {}) })
  return { ok: true, id }
}
