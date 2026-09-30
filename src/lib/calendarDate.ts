// Calendar-date helpers for `date` columns (due_date, planned_for).
//
// These columns hold a plain 'YYYY-MM-DD' calendar day, not an instant. They
// must never go through `new Date(str)`: JS parses a date-only string as UTC
// midnight, so in any timezone behind UTC the day shifts backwards. Format and
// compare them as strings instead — string order matches calendar order.
// Copiado de propelia-frontend (src/lib/calendarDate.ts), sin la recurrencia ni el tablero de
// objetivos, que el CRM de acá no tiene. Las columnas `date` se comparan como string: nunca
// pasan por `new Date(str)`, que las leería como medianoche UTC y las correría un día.

/** Today in the user's local timezone, as 'YYYY-MM-DD'. */
export function localTodayIso(): string {
  const now = new Date()
  return toIsoDate(now)
}

/** A local Date to its 'YYYY-MM-DD' calendar day. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 'YYYY-MM-DD' (or an ISO timestamp) rendered as 'DD/MM'. */
export function fmtDayMonth(dateStr: string): string {
  const [, month, day] = dateStr.slice(0, 10).split('-')
  return `${day}/${month}`
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Same calendar day shifted by N days, as 'YYYY-MM-DD'. */
export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  // Mediodía, no medianoche: evita que un cambio de horario de verano corra el día.
  const date = new Date(y, m - 1, d, 12)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/**
 * Etiqueta legible de un vencimiento: relativa cuando está cerca ("Hoy",
 * "Mañana", "Ayer") y '12 ago' cuando no. Una fecha cruda como '12/08' obliga
 * al usuario a calcular; una relativa se entiende de un vistazo.
 */
export function fmtDueLabel(dateStr: string, today = localTodayIso()): string {
  const iso = dateStr.slice(0, 10)
  if (iso === today) return 'Hoy'
  if (iso === shiftIsoDate(today, 1)) return 'Mañana'
  if (iso === shiftIsoDate(today, -1)) return 'Ayer'

  const [year, month, day] = iso.split('-')
  const label = `${Number(day)} ${MONTHS_ES[Number(month) - 1]}`
  return year === today.slice(0, 4) ? label : `${label} ${year.slice(2)}`
}

/** A deadline is overdue only once the day has fully passed — today still counts. */
export function isOverdue(dueDate: string | null, completed: boolean): boolean {
  return !completed && dueDate != null && dueDate.slice(0, 10) < localTodayIso()
}

/** First day of the month containing `iso`. */
export function startOfMonthIso(iso = localTodayIso()): string {
  return `${iso.slice(0, 7)}-01`
}

/**
 * Local-midnight boundaries of a period, as instants, for querying `timestamptz`
 * columns. `end` is exclusive so a row stamped at 23:59:59 still counts.
 */
export function periodBounds(startIso: string, days: number): { start: string; end: string } {
  const [y, m, d] = startIso.slice(0, 10).split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end = new Date(y, m - 1, d, 0, 0, 0, 0)
  end.setDate(end.getDate() + days)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Number of days in the month starting at `startIso`. */
export function daysInMonth(startIso: string): number {
  const [y, m] = startIso.slice(0, 10).split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
