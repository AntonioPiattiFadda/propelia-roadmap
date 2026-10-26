export interface GoogleAgendaItem {
  id: string
  summary: string
  start: string
  end: string
  isAllDay: boolean
  /** Me invitaron y todavía no contesté. Solo va cuando es true (y sin la edge function nueva, nunca). */
  sinAceptar?: true
}

// Agrupa eventos ya traídos contra una lista fija de días (yyyy-mm-dd, ver getWeekRange/toLocalYmd en @/lib/time).
// Eventos de días fuera de la lista se descartan (no debería pasar si el rango pedido al backend coincide).
export const groupAgendaByDay = (items: GoogleAgendaItem[], days: string[]): Record<string, GoogleAgendaItem[]> => {
  const grouped: Record<string, GoogleAgendaItem[]> = Object.fromEntries(days.map((day) => [day, []]))
  for (const item of items) {
    const dayKey = item.isAllDay ? item.start : item.start.slice(0, 10)
    if (dayKey in grouped) grouped[dayKey].push(item)
  }
  return grouped
}
