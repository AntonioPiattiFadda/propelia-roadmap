import { enlaceDeWhatsapp } from './whatsapp'

/** A dónde se avisa cada demo nueva (23/10/2026, por pedido): el WhatsApp de Propelia, el mismo
 *  del «Contactar» de los avisos a leads (`WHATSAPP_CONTACTO` de `demoScheduledEmail.ts`). */
export const WHATSAPP_AVISO_DE_DEMO = '+34 675 24 91 46'

/** Lo que se sabe de la demo recién agendada: la reunión y su registro de actividad. */
export type DemoAgendada = {
  inmobiliaria: string | null
  ciudad: string | null
  inicio: string
  fin: string
  responsable: string | null
  agendadaPor: string | null
  emailCliente: string
  asistentes: string[]
  decisor: string
  etapa: string | null
  notas: string
}

// La hora va en la de España: es donde se da la demo, aunque la agende alguien desde Venezuela.
const ZONA = 'Europe/Madrid'
const dia = (iso: string) => {
  const s = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const hora = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

/** El mensaje alegre del aviso, en renglones: lo que falta no deja renglón. */
export function mensajeDeDemoAgendada(d: DemoAgendada): string {
  const inmobiliaria = d.inmobiliaria?.trim() || 'Inmobiliaria sin nombre'
  const ciudad = d.ciudad?.trim()
  const notas = d.notas.trim()
  const datos = [
    `🏢 ${inmobiliaria}${ciudad ? ` (${ciudad})` : ''}`,
    `📅 ${dia(d.inicio)}`,
    `🕙 ${hora(d.inicio)} a ${hora(d.fin)} (hora de España)`,
    d.responsable && `👤 Responsable: ${d.responsable}`,
    d.agendadaPor && d.agendadaPor !== d.responsable && `✍️ La agendó: ${d.agendadaPor}`,
    d.emailCliente.trim() && `📧 Invitación: ${d.emailCliente.trim()}`,
    d.asistentes.length > 0 && `🙋 Asisten: ${d.asistentes.join(', ')}`,
    d.decisor.trim() && `⭐ Decisor: ${d.decisor.trim()}`,
    d.etapa && `📍 El lead queda en: ${d.etapa}`,
    notas && `📝 ${notas}`,
  ].filter(Boolean)
  return ['🎉 ¡Nueva demo agendada! 🎉', '', ...datos, '', '¡A por ella! 💪'].join('\n')
}

/** El chat con el WhatsApp de Propelia y el aviso ya escrito. Con `web` (el ordenador) va directo a
 *  WhatsApp Web: por wa.me los emojis del aviso llegaban rotos. */
export function enlaceDeAvisoDeDemo(d: DemoAgendada, { web = false } = {}): string {
  // El número es fijo y válido: el `!` no puede saltar.
  return enlaceDeWhatsapp(WHATSAPP_AVISO_DE_DEMO, mensajeDeDemoAgendada(d), { web })!
}
