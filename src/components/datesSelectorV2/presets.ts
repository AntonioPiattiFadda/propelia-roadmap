import { addDays, parseCalendarDay, toCalendarDay, todayLocal, type CalendarDay } from '@/lib/dates'
import type { DatesMode, DayRange } from './types'

/**
 * Atajos del selector. Cada uno resuelve a `{ from, to }` EN EL MOMENTO en que se
 * clickea: por eso `resolve` es una función y no un valor precalculado. El
 * `periodUtils.ts` viejo hace `export const PERIOD_OPTIONS = buildPeriodOptions()`,
 * que se congela al importar el módulo — una pestaña abierta desde ayer ofrece los
 * meses de ayer.
 *
 * El nombre del atajo nunca sale del componente: lo que viaja son las dos fechas.
 */

/**
 * Cada atajo pertenece a un modo y solo a uno. 'Hoy' en modo Rango sería un rango de un
 * día: para eso está el modo Día, y ofrecer dos caminos para lo mismo solo confunde.
 */
export type PresetScope = 'single' | 'range'

export interface DatePreset {
  key: string
  label: string
  scope: PresetScope
  resolve: () => DayRange
  /**
  * Si está y devuelve `false`, el atajo no se ofrece HOY. Se evalúa cuando se llama a
  * `presetsForMode`, por la misma razón que `resolve` es una función: un atajo que
  * depende del día de la semana no se puede decidir al importar el módulo.
  *
  * Es una propiedad de la LISTA que se ofrece, no del atajo en sí: `findPreset` lo
  * sigue encontrando y resolviendo aunque hoy no se muestre.
  */
  available?: () => boolean
}

/** Primer día del mes al que pertenece `day`. */
export function monthStart(day: CalendarDay): CalendarDay {
  const d = parseCalendarDay(day)
  return toCalendarDay(new Date(d.getFullYear(), d.getMonth(), 1))
}

/** Último día del mes al que pertenece `day`. Día 0 del mes siguiente. */
export function monthEnd(day: CalendarDay): CalendarDay {
  const d = parseCalendarDay(day)
  return toCalendarDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/**
 * Lunes de la semana de `day`, misma convención que `buildWeekOptions` en
 * periodUtils.ts. Ojo con el domingo: `getDay()` lo devuelve como 0, así que sin
 * el `+6` el domingo se iría al lunes SIGUIENTE.
 */
export function mondayOf(day: CalendarDay): CalendarDay {
  const weekday = parseCalendarDay(day).getDay()
  return addDays(day, -((weekday + 6) % 7))
}

function quarterRange(day: CalendarDay): DayRange {
  const d = parseCalendarDay(day)
  const firstMonth = Math.floor(d.getMonth() / 3) * 3
  return {
    from: toCalendarDay(new Date(d.getFullYear(), firstMonth, 1)),
    to: toCalendarDay(new Date(d.getFullYear(), firstMonth + 3, 0)),
  }
}

function yearRange(day: CalendarDay): DayRange {
  const year = parseCalendarDay(day).getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

const oneDay = (day: CalendarDay): DayRange => ({ from: day, to: day })

const weekFrom = (monday: CalendarDay): DayRange => ({ from: monday, to: addDays(monday, 6) })

export const DATE_PRESETS: DatePreset[] = [
  { key: 'hoy', label: 'Hoy', scope: 'single', resolve: () => oneDay(todayLocal()) },
  { key: 'ayer', label: 'Ayer', scope: 'single', resolve: () => oneDay(addDays(todayLocal(), -1)) },
  { key: 'anteayer', label: 'Anteayer', scope: 'single', resolve: () => oneDay(addDays(todayLocal(), -2)) },
  {
    key: 'haceUnaSemana',
    label: 'Hace una semana',
    scope: 'single',
    resolve: () => oneDay(addDays(todayLocal(), -7)),
  },
  { key: 'estaSemana', label: 'Esta semana', scope: 'range', resolve: () => weekFrom(mondayOf(todayLocal())) },
  {
    // Week-to-date: el gemelo de `esteMesHastaHoy`. 'Esta semana' entera arrastra días
    // futuros sin datos y eso rompe cualquier promedio diario.
    //
    // Un lunes resolvería a lunes→lunes, o sea un día suelto: para eso está el modo Día,
    // y ofrecer dos caminos para lo mismo solo confunde. Por eso ese día no se ofrece.
    key: 'estaSemanaHastaHoy',
    label: 'Esta semana hasta hoy',
    scope: 'range',
    available: () => {
      const today = todayLocal()
      return mondayOf(today) !== today
    },
    resolve: () => {
      const today = todayLocal()
      return { from: mondayOf(today), to: today }
    },
  },
  {
    key: 'semanaPasada',
    label: 'Semana pasada',
    scope: 'range',
    resolve: () => weekFrom(addDays(mondayOf(todayLocal()), -7)),
  },
  {
    key: 'ultimos7',
    label: 'Últimos 7 días',
    scope: 'range',
    resolve: () => {
      const today = todayLocal()
      return { from: addDays(today, -6), to: today }
    },
  },
  {
    key: 'ultimos30',
    label: 'Últimos 30 días',
    scope: 'range',
    resolve: () => {
      const today = todayLocal()
      return { from: addDays(today, -29), to: today }
    },
  },
  {
    key: 'esteMes',
    label: 'Este mes entero',
    scope: 'range',
    resolve: () => {
      const today = todayLocal()
      return { from: monthStart(today), to: monthEnd(today) }
    },
  },
  {
    // Month-to-date. 'Entero' arrastra días futuros sin datos, y eso rompe cualquier
    // promedio diario o comparación contra un mes ya cerrado.
    key: 'esteMesHastaHoy',
    label: 'Este mes hasta hoy',
    scope: 'range',
    resolve: () => {
      const today = todayLocal()
      return { from: monthStart(today), to: today }
    },
  },
  {
    key: 'mesPasado',
    label: 'Mes pasado',
    scope: 'range',
    resolve: () => {
      const lastDayOfPrevMonth = addDays(monthStart(todayLocal()), -1)
      return { from: monthStart(lastDayOfPrevMonth), to: monthEnd(lastDayOfPrevMonth) }
    },
  },
  { key: 'esteTrimestre', label: 'Este trimestre', scope: 'range', resolve: () => quarterRange(todayLocal()) },
  { key: 'esteAnio', label: 'Este año', scope: 'range', resolve: () => yearRange(todayLocal()) },
]

export function findPreset(key: string): DatePreset | undefined {
  return DATE_PRESETS.find((preset) => preset.key === key)
}

/**
 * Los atajos que tienen sentido en un modo HOY. `compare` usa los mismos que `range`.
 *
 * `activePresetKey` cuelga de esta función a propósito: un atajo que no se está ofreciendo
 * tampoco puede quedar marcado como activo.
 */
export function presetsForMode(mode: DatesMode): DatePreset[] {
  const wanted: PresetScope = mode === 'single' ? 'single' : 'range'
  return DATE_PRESETS.filter((preset) => preset.scope === wanted && (preset.available?.() ?? true))
}

/** Qué atajo coincide exactamente con el rango actual, para marcarlo activo. */
export function activePresetKey(range: DayRange, mode: DatesMode): string | null {
  const match = presetsForMode(mode).find((preset) => {
    const resolved = preset.resolve()
    return resolved.from === range.from && resolved.to === range.to
  })
  return match?.key ?? null
}
