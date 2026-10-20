import type { CrmClient, CrmEmail } from '../types'

/* Los emails que no llegaron (20/10/2026). El estado lo escribe el webhook de Resend
   (`resend-webhook` → `crm_email_evento()`); acá se decide qué se muestra y cómo se dice. */

export const ESTADOS_QUE_NO_LLEGARON = ['bounced', 'failed', 'suppressed', 'complained'] as const

export const noLlego = (e: Pick<CrmEmail, 'status'>) =>
  (ESTADOS_QUE_NO_LLEGARON as readonly string[]).includes(e.status)

const ROTULOS: Record<string, string> = {
  bounced: 'Rebotó',
  failed: 'No se pudo enviar',
  suppressed: 'No se envió',
  complained: 'Lo marcaron como spam',
}

export const rotuloDelEstado = (status: string) => ROTULOS[status] ?? status

/* Resend explica en inglés, largo y con su jerga («hard bounce», «suppression list»). Nunca se
   muestra crudo: se clasifica y se dice en una frase en español. El original queda en
   `status_detail`, para el tooltip. */
export function motivoLegible(e: Pick<CrmEmail, 'status' | 'status_detail'>): string | null {
  const d = e.status_detail?.trim() ?? ''
  if (e.status === 'suppressed' || /suppression list/i.test(d)) {
    return 'Esta dirección ya rebotó antes y no se le vuelve a mandar. Revisá que esté bien escrita.'
  }
  if (e.status === 'complained') return 'El destinatario lo marcó como spam.'
  if (e.status === 'failed') {
    return /quota|limit/i.test(d) ? 'Se llegó al tope de envíos del día.' : 'No se pudo enviar. Probá de nuevo en un rato.'
  }
  if (e.status === 'bounced') {
    if (/mailbox (is )?full|over quota|quota exceeded|insufficient storage/i.test(d)) return 'La casilla del destinatario está llena.'
    if (/spam|block|blacklist|policy|reject(ed)? (by|due)|content/i.test(d)) return 'El servidor del destinatario lo rechazó.'
    return 'La dirección no existe o no recibe correo. Revisá que esté bien escrita.'
  }
  return null
}

/** Los míos que no llegaron y todavía no vi: lo que cuenta la campana. Más nuevo primero. */
export function avisosSinVer<T extends CrmEmail>(emails: readonly T[], yo: string | null): T[] {
  if (!yo) return []
  return emails.filter(e => e.sent_by === yo && noLlego(e) && !e.seen_at)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}

/** Los que no llegaron de un lead, más nuevo primero. */
export function noLlegaronDelLead<T extends CrmEmail>(emails: readonly T[], leadId: string): T[] {
  return emails.filter(e => e.lead_id === leadId && noLlego(e))
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}

/** Si la dirección que falló sigue cargada en el perfil: entonces hay algo para corregir. */
export function sigueEnElPerfil(to: string, client: Pick<CrmClient, 'email' | 'alternative_phone_1_email' | 'alternative_phone_2_email'> | null): boolean {
  if (!client) return false
  const a = to.trim().toLowerCase()
  return [client.email, client.alternative_phone_1_email, client.alternative_phone_2_email]
    .some(e => !!e && e.trim().toLowerCase() === a)
}

/** «hoy 10:32», «ayer 18:05» o «12/10 09:00», en la hora de este navegador. */
export function cuandoSeMando(iso: string, ahora = new Date()): string {
  const d = new Date(iso)
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((dia(ahora) - dia(d)) / 86_400_000)
  if (dias === 0) return `hoy ${hora}`
  if (dias === 1) return `ayer ${hora}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hora}`
}

export type TonoDelEnvio = 'pendiente' | 'ok' | 'aviso' | 'error'

/** La pastilla al lado de «Enviar email». `null`: la fila todavía no se leyó (recién mandado).
 *  `final`: no hace falta seguir preguntando (un `complained` puede llegar después de entregado,
 *  pero eso lo trae el realtime). */
export function estadoDelEnvio(status: string | null): { texto: string; tono: TonoDelEnvio; final: boolean } {
  if (!status || status === 'sent') return { texto: 'Enviado, esperando confirmación…', tono: 'pendiente', final: false }
  if (status === 'delivery_delayed') return { texto: 'Demorado: Resend lo sigue intentando', tono: 'aviso', final: false }
  if (status === 'delivered') return { texto: 'Entregado', tono: 'ok', final: true }
  return { texto: rotuloDelEstado(status), tono: 'error', final: true }
}
