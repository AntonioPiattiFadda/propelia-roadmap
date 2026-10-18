/* Único código que habla con Resend. Copiado de `_shared/channels/email.ts` y
   `_shared/emailSender.ts` de `propelia-frontend` (ver su `docs/emailSystem.md`), con un solo
   remitente: acá no hay flujos por inmobiliaria, todo sale de `info@propelia.es`.

   El `from` lo decide el servidor y nunca quien llama: un endpoint donde cualquiera elige el
   remitente es un agujero de spam, y Resend rechaza igual un dominio que no esté verificado.
   La I/O entra por `EmailDeps` para testearlo sin red. No sabe de leads: los envíos
   automáticos del CRM arman su mensaje y llaman a esto. */

export const SENDER = 'info@propelia.es'
const SENDER_NAME = 'Propelia'

/** `content` va en base64. Resend acepta hasta 40MB por mail, contando el base64. */
export type EmailAttachment = { filename: string; content: string }

export type EmailMessage = {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string
  attachments?: EmailAttachment[]
  /** Resend dedupe 24h: misma key + mismo payload devuelve la respuesta original sin reenviar. */
  idempotencyKey?: string
}

export type EmailDeps = {
  env: (key: string) => string | undefined
  fetch: typeof fetch
}

export class EmailConfigError extends Error {}
export class EmailProviderError extends Error {}
/** Resend ya procesó esta Idempotency-Key (409 invalid_idempotent_request): el mail ya salió. */
export class EmailAlreadySentError extends Error {
  override name = 'EmailAlreadySentError'
}

const defaultDeps = (): EmailDeps => ({ env: key => Deno.env.get(key), fetch })

export async function sendEmail(msg: EmailMessage, deps: EmailDeps = defaultDeps()): Promise<{ id: string }> {
  const apiKey = deps.env('RESEND_API_KEY')
  if (!apiKey) throw new EmailConfigError('Email service is not configured')

  const res = await deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(msg.idempotencyKey ? { 'Idempotency-Key': msg.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: `"${SENDER_NAME}" <${SENDER}>`,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      reply_to: msg.replyTo,
      attachments: msg.attachments?.length ? msg.attachments : undefined,
    }),
  })

  const raw = await res.text()
  let data: { message?: string; id?: string; name?: string; code?: string } = {}
  try {
    data = JSON.parse(raw)
  } catch {
    // cuerpo no JSON: se queda con los defaults
  }
  if (res.status === 409 && (data.name === 'invalid_idempotent_request' || data.code === 'invalid_idempotent_request')) {
    throw new EmailAlreadySentError(data.message ?? 'Email already sent')
  }
  if (!res.ok || !data.id) throw new EmailProviderError(data.message ?? `Email provider error (${res.status})`)
  return { id: data.id }
}
