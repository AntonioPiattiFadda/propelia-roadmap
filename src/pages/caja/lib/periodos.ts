import { toCalendarDay, type CalendarDay } from '@/lib/dates'
import type { Rango } from '../types'

/* Un período es 'YYYY-MM': el mes al que se imputa un gasto. Todo acá es aritmética de strings o
   de Date con el constructor numérico (local), nunca `new Date('YYYY-MM-DD')`, que parsea en UTC
   y en una zona al oeste de Greenwich corre el día. */

export const periodOf = (day: CalendarDay): string => day.slice(0, 7)

/** Día de vencimiento dentro del período. Un 31 en febrero cae el último día; sin día, el 1. */
export function dueDate(period: string, dueDay: number | null): CalendarDay {
  const [y, m] = period.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return toCalendarDay(new Date(y, m - 1, Math.min(dueDay || 1, ultimo)))
}

/** Los períodos que toca el rango, del más viejo al más nuevo. */
export function mesesDelRango(rango: Rango): string[] {
  const [y0, m0] = periodOf(rango.from).split('-').map(Number)
  const [y1, m1] = periodOf(rango.to).split('-').map(Number)
  const meses: string[] = []
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, (m = 1)) : m++) {
    meses.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return meses
}

/**
 * «octubre de 2026». Locale es-ES (la moneda y los números de la Caja también son es-ES) y en
 * minúscula: capitalizarlo es de quien lo pinta (el mock lo hace en el separador de mes).
 */
export function tituloDePeriodo(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

/**
 * Día calendario LOCAL de un instante (timestamptz). `created_at.slice(0, 10)` es el día en UTC:
 * una etiqueta creada a las 00:30 del 1/nov en Madrid dice «2026-10-31». Postgres devuelve
 * «2026-09-16 01:30:00+00», que Safari no parsea: se normaliza como en `@/lib/dates`.
 */
export function diaLocalDeInstante(instante: string): CalendarDay {
  const iso = instante.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return toCalendarDay(new Date(iso))
}

export const periodoDeInstante = (instante: string): string => periodOf(diaLocalDeInstante(instante))
