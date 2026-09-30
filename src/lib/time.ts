// Horarios cada 15 min (00:00 a 23:45) — mismo patrón visual que el selector de
// horario de Google Calendar (lista desplegable, formato 12h am/pm).
// El VALOR interno sigue siendo 24h "HH:MM" (lo que ya espera handleSave/Date), solo
// la etiqueta visible cambia a 12h am/pm.
export const TIME_VALUES = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = String(Math.floor(i / 4)).padStart(2, '0')
  const minutes = String((i % 4) * 15).padStart(2, '0')
  return `${hours}:${minutes}`
})

export const formatTime12h = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h < 12 ? 'am' : 'pm'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')}${period}`
}

export const toLocalYmd = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Semana calendario lunes a domingo (horario local) que contiene `reference`.
// Alineado a semana (no "próximos 7 días") para poder agregar navegación por semana después sin tocar esta función.
export const getWeekRange = (reference: Date): { start: Date; end: Date } => {
  const day = reference.getDay() // 0=domingo..6=sábado
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + mondayOffset)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999)
  return { start, end }
}
