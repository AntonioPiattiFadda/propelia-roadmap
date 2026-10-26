import { momentoDeLaTarea, ZONA_ESPANA } from '@/pages/crm/lib/alarmas'
import type { AgendaEvent } from './agendaEvents'

/* La demo se agenda en hora de España (26/10/2026, por pedido): las inmobiliarias están allá y
   parte del equipo agenda desde Venezuela. Elegir las 10:00 son las 10:00 de Madrid, sea cual sea
   la zona del navegador. Vale para el formulario de la demo y para su «Seleccionar día y hora»;
   la página /agenda sigue en la hora de cada uno. */

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_ESPANA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** Qué día y qué hora marca el reloj de España en ese instante. */
export function relojDeEspana(instante: Date | string): { ymd: string; hora: string; minutos: number } {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(instante)).map(x => [x.type, x.value]))
  const h = Number(p.hour) % 24
  return { ymd: `${p.year}-${p.month}-${p.day}`, hora: `${String(h).padStart(2, '0')}:${p.minute}`, minutos: h * 60 + Number(p.minute) }
}

/** El instante del día + hora del formulario: de España con `enEspana`, si no del navegador. */
export function instanteDelFormulario(ymd: string, hora: string, enEspana: boolean): Date {
  return (enEspana ? momentoDeLaTarea(ymd, hora) : null) ?? new Date(`${ymd}T${hora}`)
}

/** La hora de ese instante en la zona de quien agenda («05:00», «20:30 (día anterior)»), para
 *  mostrarla al lado de la de España. `null` si es la misma: quien está en España no la necesita. */
export function horaEnTuZona(
  instante: Date,
  ymdEnEspana: string,
  zona = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | null {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante).map(x => [x.type, x.value]))
  const ymd = `${p.year}-${p.month}-${p.day}`
  const hora = `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`
  if (ymd === ymdEnEspana && hora === relojDeEspana(instante).hora) return null
  const dia = ymd < ymdEnEspana ? ' (día anterior)' : ymd > ymdEnEspana ? ' (día siguiente)' : ''
  return `${hora}${dia}`
}

/** El reloj de España escrito sin zona («2026-11-10T10:00:00»): `new Date()` lo lee como hora
 *  local con esos mismos números y `slice(0, 10)` da el día de España, que es lo que `WeekGrid` y
 *  `groupEventsByDay` miran. Así la grilla dibuja la semana de España sin saber de zonas. */
const sinZona = (iso: string) => {
  const r = relojDeEspana(iso)
  return `${r.ymd}T${r.hora}:00`
}

export const eventosEnHoraDeEspana = (eventos: AgendaEvent[]): AgendaEvent[] =>
  eventos.map(e => (e.isAllDay ? e : { ...e, startIso: sinZona(e.startIso), endIso: sinZona(e.endIso) }))
