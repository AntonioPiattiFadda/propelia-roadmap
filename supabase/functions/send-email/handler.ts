/* El envío a mano desde el front, sin Supabase adentro: quién llama, validar y mandar. Hoy lo usa
   solo el formulario de prueba del CRM. Es el `send-email` del producto con una diferencia: allá
   alcanza con tener sesión y acá hace falta ser SUPERADMIN activo, porque lo que sale lleva
   `info@propelia.es` y cualquier texto. Los envíos automáticos del CRM no pasan por acá: llaman
   a `_shared/email.ts` desde el servidor. */

import type { EmailAttachment, EmailMessage } from '../_shared/email.ts'
import {
  camposDesde, datosDeAccesoDesde, nombreEnBandeja, plantillaEmail, problemaDeAcceso, problemaDeCampos, remitenteDe, renderEmail,
  renderEmailDeAcceso, replyToDe,
} from '../_shared/plantillasEmail.ts'

/* Dos formas de llamarla. Con `plantilla` y `campos` el HTML lo arma el servidor
   (`_shared/plantillasEmail.ts`) y de lo que llega solo entra texto escapado: por eso alcanza con
   ser usuario activo, SDR incluido. Sin plantilla es texto libre con adjuntos, y eso sigue siendo
   de SUPERADMIN. Una plantilla con `adjuntos` (el «Mail puntual», 20/10/2026) también los lleva. La firma sale de la fila de `users` de quien llama, no de lo que mande. */
export type SendEmailInput = {
  to: string; subject: string; text: string; attachments: unknown
  plantilla?: string; campos?: unknown
  /** El mail de accesos del onboarding (/clientes, 27/10/2026): `{ nombre, email, contrasena, inmobiliaria }`. */
  acceso?: unknown
}

export type SendEmailDeps = {
  getCaller(id: string): Promise<Caller | null>
  send(msg: EmailMessage): Promise<{ id: string }>
}

/** La fila de `users`; las `firma_*` pueden no venir (antes de la migración). */
export type Caller = { rol: string; activo: boolean } & NonNullable<Parameters<typeof remitenteDe>[0]>

/** `to`, `subject` y `plantilla` son lo que se registra en `crm_emails` (lo arma `index.ts`). */
export type SendEmailResult =
  | { ok: true; id: string; to: string; subject: string; plantilla?: string }
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

/** Los adjuntos validados, o el error a devolver. */
function adjuntosDe(value: unknown): EmailAttachment[] | SendEmailResult {
  const attachments = parseAttachments(value)
  if (!attachments) return fail(400, 'Adjuntos inválidos')
  if (attachments.reduce((n, a) => n + a.content.length, 0) > MAX_ATTACHMENTS_BYTES) {
    return fail(413, 'Los adjuntos pasan los 10MB')
  }
  return attachments
}

export async function handleSendEmail(callerId: string, input: SendEmailInput, deps: SendEmailDeps): Promise<SendEmailResult> {
  const caller = await deps.getCaller(callerId)
  if (input.plantilla !== undefined) return handlePlantilla(caller, input, deps)
  if (input.acceso !== undefined) return handleAcceso(caller, input, deps)
  // La misma regla que `es_superadmin()`: rol y fila activa.
  if (!caller || !caller.activo || caller.rol !== 'SUPERADMIN') return fail(403, 'No autorizado')

  const to = input.to.trim()
  const subject = input.subject.trim()
  if (!EMAIL.test(to)) return fail(400, 'La casilla de destino no es válida')
  if (!subject) return fail(400, 'Falta el asunto')
  if (!input.text.trim()) return fail(400, 'Falta el mensaje')

  const attachments = adjuntosDe(input.attachments)
  if (!Array.isArray(attachments)) return attachments

  const { id } = await deps.send({ to, subject, text: input.text, ...(attachments.length ? { attachments } : {}) })
  return { ok: true, id, to, subject }
}

async function handlePlantilla(
  caller: Caller | null,
  input: SendEmailInput,
  deps: SendEmailDeps,
): Promise<SendEmailResult> {
  // La misma regla que `es_usuario()`: fila activa, cualquier rol.
  if (!caller || !caller.activo) return fail(403, 'No autorizado')

  const to = input.to.trim()
  if (!EMAIL.test(to)) return fail(400, 'La casilla de destino no es válida')
  const plantilla = plantillaEmail(input.plantilla ?? '')
  if (!plantilla) return fail(400, 'Plantilla desconocida')
  const campos = camposDesde(input.campos)
  if (!campos) return fail(400, 'Campos inválidos')
  const problema = problemaDeCampos(plantilla.id, campos)
  if (problema) return fail(400, problema)
  const attachments = adjuntosDe(input.attachments)
  if (!Array.isArray(attachments)) return attachments
  if (attachments.length && !plantilla.adjuntos) return fail(400, 'Esta plantilla no lleva adjuntos')

  const remitente = remitenteDe(caller)
  const { subject, html, text } = renderEmail(plantilla.id, campos, remitente)
  const replyTo = replyToDe(remitente)
  const fromName = nombreEnBandeja(remitente)
  const { id } = await deps.send({
    fromName, to, subject, html, text, ...(replyTo ? { replyTo } : {}), ...(attachments.length ? { attachments } : {}),
  })
  return { ok: true, id, to, subject, plantilla: plantilla.id }
}

/* El mail de accesos del paso 1 de /clientes: usuario y contraseña temporal de una persona del
   equipo del cliente. SUPERADMIN, como el texto libre: lleva una contraseña. Sale siempre al email
   de la cuenta (`acceso.email`), nunca a otro `to`: no hay cómo mandarle la clave de alguien a
   otra casilla. El HTML lo arma `renderEmailDeAcceso`. */
async function handleAcceso(caller: Caller | null, input: SendEmailInput, deps: SendEmailDeps): Promise<SendEmailResult> {
  if (!caller || !caller.activo || caller.rol !== 'SUPERADMIN') return fail(403, 'No autorizado')
  const datos = datosDeAccesoDesde(input.acceso)
  if (!datos) return fail(400, 'Datos de acceso inválidos')
  const problema = problemaDeAcceso(datos)
  if (problema) return fail(400, problema)

  const remitente = remitenteDe(caller)
  const to = datos.email.trim()
  const { subject, html, text } = renderEmailDeAcceso(datos, remitente)
  const replyTo = replyToDe(remitente)
  const { id } = await deps.send({ fromName: nombreEnBandeja(remitente), to, subject, html, text, ...(replyTo ? { replyTo } : {}) })
  return { ok: true, id, to, subject, plantilla: 'acceso' }
}
