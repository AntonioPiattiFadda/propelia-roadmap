import type { CrmMeeting } from '../types'

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
 * Lo que se le pregunta al agendar una demo —a qué mail va la invitación y quién asiste— va a
 * `crm_meetings.description` porque la tabla no tiene columnas para eso, y así no hizo falta
 * migración. Un renglón por cosa; lo que viene vacío no deja renglón.
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
