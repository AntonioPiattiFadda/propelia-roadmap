import type { CrmMeeting } from '../types'
import { TEXTO_DE_DEMO } from './actividad'

/** Día y hora que eligió quien agenda, en SU zona, a instantes para las columnas timestamptz. */
export function armarReunion(fecha: string, hora: string, minutos: number): { starts_at: string; ends_at: string } {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const inicio = new Date(y, m - 1, d, h, mi, 0, 0)
  return { starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + minutos * 60_000).toISOString() }
}

// La misma forma que pide la importación del Excel: algo@algo.algo, sin espacios.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const esEmailValido = (email: string) => EMAIL.test(email.trim())

/**
 * Cómo se guardaban la invitación y quién asiste en `crm_meetings.description` hasta el 22/10/2026.
 * Ya no se escribe así (eso va al registro de actividad del lead): queda para documentar el formato
 * que lee `leerDescripcionDeDemo()` en las demos viejas.
 */
export function descripcionDeDemo({ email, asistentes, notas }: { email: string; asistentes: string[]; notas: string }): string {
  return [
    `Invitación a: ${email.trim()}`,
    asistentes.length ? `Asisten: ${asistentes.join(', ')}` : '',
    notas.trim(),
  ].filter(Boolean).join('\n')
}

/**
 * Próximas = agendadas que todavía no terminaron, la más cercana primero (es lo que se viene a
 * mirar). Todo lo demás —ya pasó, completada, cancelada— va abajo, la más nueva primero.
 */
export function agruparReuniones<T extends CrmMeeting>(reuniones: T[], now: number): { proximas: T[]; pasadas: T[] } {
  const vivas = reuniones.filter(r => r.deleted_at == null)
  const esProxima = (r: T) => r.status === 'scheduled' && Date.parse(r.ends_at) > now
  return {
    proximas: vivas.filter(esProxima).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    pasadas: vivas.filter(r => !esProxima(r)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
  }
}

/**
 * El camino de vuelta de `descripcionDeDemo()`, para la tabla de Demos: cada renglón marcado va a
 * su campo y lo que sobra son las notas. Una descripción escrita a mano (una reunión del perfil,
 * sin marcas) entra entera como notas.
 */
export function leerDescripcionDeDemo(descripcion: string | null): { email: string; asistentes: string[]; notas: string } {
  let email = ''
  let asistentes: string[] = []
  const notas: string[] = []
  for (const renglon of (descripcion ?? '').split('\n')) {
    if (!email && renglon.startsWith('Invitación a: ')) email = renglon.slice('Invitación a: '.length).trim()
    else if (!asistentes.length && renglon.startsWith('Asisten: ')) asistentes = renglon.slice('Asisten: '.length).split(',').map(s => s.trim()).filter(Boolean)
    else notas.push(renglon)
  }
  return { email, asistentes, notas: notas.join('\n').trim() }
}

/** Invitado fijo de toda demo (21/10/2026, por pedido), además de la inmobiliaria. */
export const INVITADO_DE_TODA_DEMO = 'lorenzopiattifadda@gmail.com'

/**
 * El enlace a /agenda para agendar una demo (22/10/2026: se abre en otra pestaña). La Agenda lee el
 * lead por `leadId` y con `demo=1` muestra al lado de la reunión el registro de actividad (quién
 * asiste, decisor, lo escrito y la etapa). El título, el responsable y los invitados (el mail de la
 * inmobiliaria y el fijo) van en la URL, como el «Agendar visita» del producto: el formulario nace
 * con ellos. Los mails van en `guestEmail` repetido, en minúscula y sin duplicados; uno inválido no
 * entra.
 */
export function enlaceParaAgendarDemo(d: { leadId: string; assignedTo: string; email: string | null }): string {
  const p = new URLSearchParams({ leadId: d.leadId, assignedTo: d.assignedTo, title: 'Demo', demo: '1' })
  const emails = [d.email ?? '', INVITADO_DE_TODA_DEMO].map(e => e.trim().toLowerCase()).filter(esEmailValido)
  for (const e of new Set(emails)) p.append('guestEmail', e)
  return `/agenda?${p.toString()}`
}

/** Lo que la demo dejó en el registro de actividad del lead (ver `useRegistroDeDemo`). */
export type RegistroDeLaDemo = { con: string[]; decisorApuntado?: string; texto: string }

/**
 * Lo que la tabla de Demos muestra de cada una. Desde el 22/10/2026 quién asiste, el decisor y las
 * notas salen del registro de actividad, y el mail de la invitación es el invitado que no es el
 * fijo. Las demos de antes no tienen registro: lo traen en `description` (`leerDescripcionDeDemo`).
 */
export function datosDeLaDemo(
  reunion: Pick<CrmMeeting, 'description' | 'guest_emails'>, registro: RegistroDeLaDemo | null,
): { email: string; asistentes: string[]; notas: string } {
  if (!registro) return leerDescripcionDeDemo(reunion.description)
  return {
    email: reunion.guest_emails.find(e => e.toLowerCase() !== INVITADO_DE_TODA_DEMO) ?? '',
    asistentes: registro.con,
    notas: [
      registro.decisorApuntado && `Decisor: ${registro.decisorApuntado}`,
      registro.texto !== TEXTO_DE_DEMO && registro.texto,
    ].filter(Boolean).join('\n'),
  }
}
