import { toLocalYmd } from '@/lib/time'

/* Lo puro del «Seleccionar día y hora» (23/10/2026, por pedido): el formulario de la reunión abre
   la semana de la Agenda y el horario que se toca vuelve al formulario. */

const pad2 = (n: number) => String(n).padStart(2, '0')
const aMinutos = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const aHora = (mins: number) => {
  const tope = Math.min(Math.max(mins, 0), 23 * 60 + 45)
  return `${pad2(Math.floor(tope / 60))}:${pad2(tope % 60)}`
}

type Rango = { time: string; endTime: string }
const duracion = ({ time, endTime }: Rango) => time !== '' && endTime !== '' ? aMinutos(endTime) - aMinutos(time) : 0

/** Al mover el «desde», el «hasta» lo sigue con la misma duración; sin rango cargado, 60 minutos. */
export function finConLaMismaDuracion(inicio: string, actual: Rango): string {
  const d = duracion(actual)
  return aHora(aMinutos(inicio) + (d > 0 ? d : 60))
}

/** El slot tocado en la grilla, al formulario: su día y su inicio; el fin conserva la duración
 *  que ya tenía el formulario y, si no tenía, es el del slot. */
export function horarioDelSlot(
  slot: { ymd: string; startTime: string; endTime: string },
  actual: Rango,
): { date: string; time: string; endTime: string } {
  return {
    date: slot.ymd,
    time: slot.startTime,
    endTime: duracion(actual) > 0 ? finConLaMismaDuracion(slot.startTime, actual) : slot.endTime,
  }
}

/** En qué semana abre el selector: la del día ya elegido o, sin día, la de hoy. Al mediodía, para
 *  que un cambio de horario no la corra de día. */
export const fechaParaAbrir = (date: string, hoy: Date): Date => (date ? new Date(`${date}T12:00:00`) : hoy)

/** Los siete `YYYY-MM-DD` de la semana que arranca en `inicio`. */
export const diasDeLaSemana = (inicio: Date): string[] =>
  Array.from({ length: 7 }, (_, i) => toLocalYmd(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)))
