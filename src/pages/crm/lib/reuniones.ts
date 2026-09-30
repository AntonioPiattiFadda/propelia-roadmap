import type { CrmMeeting } from '../types'

/** Día y hora que eligió quien agenda, en SU zona, a instantes para las columnas timestamptz. */
export function armarReunion(fecha: string, hora: string, minutos: number): { starts_at: string; ends_at: string } {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const inicio = new Date(y, m - 1, d, h, mi, 0, 0)
  return { starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + minutos * 60_000).toISOString() }
}

/**
 * Próximas = agendadas que todavía no terminaron, la más cercana primero (es lo que se viene a
 * mirar). Todo lo demás —ya pasó, completada, cancelada— va abajo, la más nueva primero.
 */
export function agruparReuniones(reuniones: CrmMeeting[], now: number): { proximas: CrmMeeting[]; pasadas: CrmMeeting[] } {
  const vivas = reuniones.filter(r => r.deleted_at == null)
  const esProxima = (r: CrmMeeting) => r.status === 'scheduled' && Date.parse(r.ends_at) > now
  return {
    proximas: vivas.filter(esProxima).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)),
    pasadas: vivas.filter(r => !esProxima(r)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at)),
  }
}
