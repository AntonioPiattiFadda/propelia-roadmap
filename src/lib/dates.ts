/**
 * Días calendario ("YYYY-MM-DD", sin hora). Copiado de ms-frontend (`src/lib/dates.ts`), solo lo
 * que usan el DatesSelectorV2 y la Caja.
 *
 * Nunca pasar un día crudo por `new Date(str)`: se parsea como UTC y en una zona al oeste de
 * Greenwich queda en el día anterior. Usar parseCalendarDay / formatCalendarDay. Para «hoy»,
 * todayLocal, nunca `new Date().toISOString().slice(0, 10)`.
 *
 * `calendarDate.ts` resuelve lo mismo con otros nombres para el CRM; este archivo existe para que
 * el selector copiado del producto no haya que reescribirlo.
 */

export type CalendarDay = string

const UTC_MIDNIGHT_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?)?)?$/

const pad = (n: number) => String(n).padStart(2, '0')

// Postgres devuelve "2026-09-16 01:30:00+00"; Safari no parsea ese formato.
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  return new Date(value.replace(' ', 'T').replace(/(:\d{2}(?:\.\d+)?[+-]\d{2})$/, '$1:00'))
}

/** Día calendario local de un Date. */
export function toCalendarDay(d: Date): CalendarDay {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Hoy, en la zona local. */
export function todayLocal(): CalendarDay {
  return toCalendarDay(new Date())
}

/** Medianoche local del día calendario. */
export function parseCalendarDay(day: CalendarDay): Date {
  const [y, m, d] = day.substring(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: CalendarDay, n: number): CalendarDay {
  const d = parseCalendarDay(day)
  d.setDate(d.getDate() + n)
  return toCalendarDay(d)
}

/** true si el valor es una fecha-concepto: "YYYY-MM-DD" o medianoche UTC exacta. */
function isUtcMidnight(value: string): boolean {
  return UTC_MIDNIGHT_RE.test(value)
}

/** Una fecha-concepto conserva su día (mediodía local); un instante real se pasa a hora local. */
function toCalendarDate(value: string): Date {
  return isUtcMidnight(value) ? new Date(value.substring(0, 10) + 'T12:00:00') : toDate(value)
}

const DEFAULT_DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'numeric', year: 'numeric' }

/** Muestra un día calendario sin correrlo de día. */
export function formatCalendarDay(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_DAY_FORMAT,
): string {
  if (!value) return '--'
  return toCalendarDate(value).toLocaleDateString('es-AR', options)
}
