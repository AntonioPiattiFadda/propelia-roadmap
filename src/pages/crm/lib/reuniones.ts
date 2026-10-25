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

/** Invitados fijos de toda demo, además de la inmobiliaria: Lorenzo (21/10/2026) e info@propelia.es
 *  (23/10/2026), por pedido. Ninguno es «el mail del cliente». Su espejo en el servidor es
 *  `INVITADOS_DE_TODA_DEMO` de `_shared/leadNotifications/supabaseAdapters.ts`. */
export const INVITADOS_DE_TODA_DEMO = ['lorenzopiattifadda@gmail.com', 'info@propelia.es']

export const esInvitadoFijo = (email: string) => INVITADOS_DE_TODA_DEMO.includes(email.trim().toLowerCase())

/**
 * Los invitados con los que nace la demo (23/10/2026: se agenda en la ventana de registrar
 * actividad): el mail de la inmobiliaria y el fijo, en minúscula y sin duplicados. Uno inválido no
 * entra.
 */
export function invitadosDeLaDemo(email: string | null): string[] {
  const cliente = email && !esInvitadoFijo(email) ? email : ''
  const emails = [cliente, ...INVITADOS_DE_TODA_DEMO].map(e => e.trim().toLowerCase()).filter(esEmailValido)
  return [...new Set(emails)]
}

/** La descripción con la que nace la demo (23/10/2026, por pedido). Va al evento de Google y la lee
 *  el cliente, que está invitado: se escribe para él, en «tú» (las inmobiliarias son de España). */
export const DESCRIPCION_DE_DEMO = 'Demo de Propelia: te enseñamos cómo funciona la plataforma y cómo puede ayudar a tu inmobiliaria. Si necesitas cambiar el horario, responde a esta invitación.'

/** El título con el que nace la demo (23/10/2026, por pedido; era «Demo» a secas). Es el del evento
 *  de Google y lo ve el cliente en su calendario: dice de quién es y con qué inmobiliaria. */
export function tituloDeLaDemo(inmobiliaria: string | null | undefined): string {
  const nombre = inmobiliaria?.trim()
  return nombre ? `Demo de Propelia · ${nombre}` : 'Demo de Propelia'
}

/** Si el título es el que se puso solo (el viejo «Demo» o `tituloDeLaDemo`): la actividad no lo repite. */
export function esTituloDeDemoDeFabrica(titulo: string | null | undefined): boolean {
  return titulo === 'Demo' || titulo === 'Demo de Propelia' || !!titulo?.startsWith('Demo de Propelia · ')
}

/** El recordatorio con el que nace la demo, en minutos antes (23/10/2026, por pedido). */
export const RECORDATORIO_DE_DEMO = 10

/** Lo que se venía escribiendo en otra actividad y pasa a la demo al cambiar a «Agendar demo». */
export type RegistroInicialDeDemo = {
  con: string[]; nuevos: string[]; decisor: string
  /** La respuesta al «¿Es decisor?» (`null` = sin contestar). */
  esDecisor: boolean | null
  texto: string; etapa: string | null
}

/**
 * Pasar de una llamada o una nota a «Agendar demo» no pierde lo escrito (23/10/2026, por pedido):
 * con quién (los escritos a mano incluidos), el decisor apuntado, si es decisor, el texto y la etapa.
 * Descartado no pasa: la demo no lo ofrece.
 */
export function registroDeDemoDesdeLaActividad(
  a: { con: string[]; nuevos: string[]; decisorApuntado: string; esDecisor: boolean | null; texto: string; etapa: string | null },
  descartadaId: string | undefined,
): RegistroInicialDeDemo {
  return {
    con: a.con, nuevos: a.nuevos, decisor: a.decisorApuntado, esDecisor: a.esDecisor, texto: a.texto,
    etapa: a.etapa && a.etapa !== descartadaId ? a.etapa : null,
  }
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
    email: reunion.guest_emails.find(e => !esInvitadoFijo(e)) ?? '',
    asistentes: registro.con,
    notas: [
      registro.decisorApuntado && `Decisor: ${registro.decisorApuntado}`,
      registro.texto !== TEXTO_DE_DEMO && registro.texto,
    ].filter(Boolean).join('\n'),
  }
}
