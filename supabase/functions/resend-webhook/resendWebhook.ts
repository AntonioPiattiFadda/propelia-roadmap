/* Lo que hace el webhook de Resend, sin Supabase adentro: verificar la firma y traducir el evento a
   un estado de `crm_emails`. Resend firma con svix: `svix-id`, `svix-timestamp` y `svix-signature`
   (`v1,<base64>` separados por espacio), HMAC-SHA256 de `id.timestamp.cuerpo` con el secreto
   `whsec_<base64>` del panel de Resend. Se verifica a mano con WebCrypto para no traer la librería. */

/** Más viejo que esto (o del futuro) se rechaza: una firma vieja reenviada no vale. */
export const TOLERANCIA_SEGUNDOS = 5 * 60

const b64ABytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
const bytesAB64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

function igualesSinApuro(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function firmaValida(
  secreto: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  cuerpo: string,
  ahoraSegundos = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers
  if (!secreto || !id || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(ahoraSegundos - ts) > TOLERANCIA_SEGUNDOS) return false
  let clave: Uint8Array
  try {
    clave = b64ABytes(secreto.replace(/^whsec_/, ''))
  } catch {
    return false
  }
  const key = await crypto.subtle.importKey('raw', clave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperada = bytesAB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${cuerpo}`)))
  return signature.split(' ').some(s => {
    const [version, firma] = s.split(',')
    return version === 'v1' && !!firma && igualesSinApuro(firma, esperada)
  })
}

export type EstadoEmail = 'sent' | 'delivery_delayed' | 'delivered' | 'bounced' | 'failed' | 'suppressed' | 'complained'

const ESTADO_DEL_EVENTO: Record<string, EstadoEmail> = {
  'email.sent': 'sent',
  'email.delivery_delayed': 'delivery_delayed',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
  'email.complained': 'complained',
}

export type EventoEmail = { resendId: string; estado: EstadoEmail; detalle: string | null; at: string | null }

type Payload = {
  type?: unknown
  created_at?: unknown
  data?: {
    email_id?: unknown
    bounce?: { message?: unknown }
    failed?: { reason?: unknown }
    suppressed?: { message?: unknown }
  }
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** `null` si el evento no es de los que se guardan (abierto, clic, recibido…) o no trae el id. */
export function eventoDe(payload: unknown): EventoEmail | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Payload
  const estado = typeof p.type === 'string' ? ESTADO_DEL_EVENTO[p.type] : undefined
  const resendId = texto(p.data?.email_id)
  if (!estado || !resendId) return null
  const d = p.data!
  const detalle = texto(d.bounce?.message) ?? texto(d.failed?.reason) ?? texto(d.suppressed?.message)
  return { resendId, estado, detalle, at: texto(p.created_at) }
}

export type WebhookDeps = {
  secreto: string | undefined
  registrar(evento: EventoEmail): Promise<{ error?: string }>
}

export type WebhookRespuesta = { status: number; body: Record<string, unknown> }

export async function handleWebhook(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  cuerpo: string,
  deps: WebhookDeps,
  ahoraSegundos?: number,
): Promise<WebhookRespuesta> {
  if (!deps.secreto) return { status: 500, body: { error: 'Falta RESEND_WEBHOOK_SECRET' } }
  if (!(await firmaValida(deps.secreto, headers, cuerpo, ahoraSegundos))) return { status: 401, body: { error: 'Firma inválida' } }
  let payload: unknown
  try {
    payload = JSON.parse(cuerpo)
  } catch {
    return { status: 400, body: { error: 'Cuerpo inválido' } }
  }
  const evento = eventoDe(payload)
  // Un evento que no se guarda se contesta 200: si no, Resend lo reintenta durante horas.
  if (!evento) return { status: 200, body: { ignorado: true } }
  const { error } = await deps.registrar(evento)
  // 500 y no 200: así Resend lo reintenta.
  if (error) return { status: 500, body: { error } }
  return { status: 200, body: { ok: true } }
}
