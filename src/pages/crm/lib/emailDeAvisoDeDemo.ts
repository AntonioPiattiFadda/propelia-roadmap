import { demoRecipientEmail } from '../../../../supabase/functions/_shared/leadNotifications/demoQuery.ts'
import { firmaDeLaDemo } from '../../../../supabase/functions/_shared/leadNotifications/handlers/demoScheduled.ts'
import {
  PROPELIA_ORG, renderDemoCancelledEmail, renderDemoRescheduledEmail, renderDemoScheduledEmail,
} from '../../../../supabase/functions/_shared/leadNotifications/templates/demoScheduledEmail.ts'
import { emailAssetsBaseUrl } from '../../../../supabase/functions/_shared/leadNotifications/assets.ts'
import { INVITADOS_DE_TODA_DEMO } from './reuniones'

/* «Ver email» de los avisos a leads (4/11/2026, por pedido): la vista previa de «Demo agendada /
   reprogramada / cancelada» con las MISMAS piezas del dispatcher (`handlers/demoScheduled.ts` y
   `templates/demoScheduledEmail.ts`): quién firma (`firmaDeLaDemo`), a quién le llega
   (`demoRecipientEmail`) y el render. Puro: lo usan Ajustes › Avisos a leads (con datos de ejemplo),
   el formulario de reunión y las dos cancelaciones (con los del lead). */

export type AvisoDeDemo = 'demo_scheduled' | 'demo_rescheduled' | 'demo_cancelled'

export const AVISOS_DE_DEMO: readonly AvisoDeDemo[] = ['demo_scheduled', 'demo_rescheduled', 'demo_cancelled']
export const esAvisoDeDemo = (tipo: string): tipo is AvisoDeDemo => (AVISOS_DE_DEMO as readonly string[]).includes(tipo)

/** La fila de `users` del responsable (lo que lee `DEMO_SCHEDULED_SELECT`), o null si no se sabe. */
export type FirmanteDeAviso = Parameters<typeof firmaDeLaDemo>[0]

export type DatosDelAviso = {
  /** El horario que lleva el mail (el nuevo, al reprogramar). */
  inicio: string
  /** Solo reprogramada: el que tenía. */
  inicioAnterior?: string | null
  inmobiliaria: string | null
  nombreDelCliente: string | null
  firmante: FirmanteDeAviso
  /** Base de los íconos: `emailAssetsBaseUrl(undefined, origin)`, la de producción con APP_BASE_URL. */
  assets: string
}

/** Los íconos del mail tal como los sirve esta app (`public/email/avisos/`). */
export const assetsDeLosAvisos = (origen: string) => emailAssetsBaseUrl(undefined, origen)

/** El mail de ese aviso y el nombre con el que llega a la bandeja. */
export function renderAvisoDeDemo(tipo: AvisoDeDemo, d: DatosDelAviso): { subject: string; html: string; from: string } {
  const { agent, fromName } = firmaDeLaDemo(d.firmante)
  const ctx = {
    startsAt: d.inicio,
    companyName: d.inmobiliaria,
    clientFirstName: d.nombreDelCliente,
    agent,
    org: PROPELIA_ORG,
    assetsBaseUrl: d.assets,
  }
  const r = tipo === 'demo_rescheduled' ? renderDemoRescheduledEmail(ctx, d.inicioAnterior ?? null)
    : tipo === 'demo_cancelled' ? renderDemoCancelledEmail(ctx)
    : renderDemoScheduledEmail(ctx)
  return { ...r, from: fromName }
}

/** El «De:» de la bandeja: el nombre de quien firma y, siempre, info@propelia.es (`_shared/email.ts`). */
export const deLaBandeja = (firmante: FirmanteDeAviso) => `${firmaDeLaDemo(firmante).fromName} <info@propelia.es>`

/** A quién le llega: el mail de la invitación (el primer invitado que no es del equipo) o el de la
    inmobiliaria. `equipo` son los emails de `users`; los fijos de toda demo se suman acá, como en
    `createSupabaseDemoScheduledDb`. */
export function destinatarioDelAviso(invitados: string[], emailDeLaInmobiliaria: string | null | undefined, equipo: string[]): string | null {
  return demoRecipientEmail(
    { guest_emails: invitados, client: { first_name: null, company_name: null, email: emailDeLaInmobiliaria ?? null, deleted_at: null } },
    [...equipo, ...INVITADOS_DE_TODA_DEMO],
  )
}

export const CLIENTE_DE_EJEMPLO = { nombre: 'Ana', inmobiliaria: 'Inmobiliaria Serrano', email: 'ana@inmoserrano.es' }

/** Pasado mañana a las 09:00 UTC (las 10 u 11 de Madrid según la época: es un ejemplo), y el día
    anterior a la tarde como horario viejo de la reprogramada. */
export function inicioDeEjemplo(ahora = new Date()): { inicio: string; anterior: string } {
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 2, 9, 0))
  const anterior = new Date(d)
  anterior.setUTCDate(anterior.getUTCDate() - 1)
  anterior.setUTCHours(15)
  return { inicio: d.toISOString(), anterior: anterior.toISOString() }
}

/** El aviso de Ajustes › Avisos a leads: con quien mira como responsable y una inmobiliaria de ejemplo. */
export function muestraDeAvisoDeDemo(tipo: AvisoDeDemo, firmante: FirmanteDeAviso, assets: string, ahora = new Date()) {
  const { inicio, anterior } = inicioDeEjemplo(ahora)
  return renderAvisoDeDemo(tipo, {
    inicio, inicioAnterior: anterior, inmobiliaria: CLIENTE_DE_EJEMPLO.inmobiliaria,
    nombreDelCliente: CLIENTE_DE_EJEMPLO.nombre, firmante, assets,
  })
}
