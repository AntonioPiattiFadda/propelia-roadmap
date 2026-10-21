// Horarios cada 15 min (00:00 a 23:45) — mismo patrón visual que el selector de
// horario de Google Calendar (lista desplegable, formato 12h am/pm).
// El VALOR interno sigue siendo 24h "HH:MM" (lo que ya espera handleSave/Date), solo
// la etiqueta visible cambia a 12h am/pm.
export const TIME_VALUES = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = String(Math.floor(i / 4)).padStart(2, '0')
  const minutes = String((i % 4) * 15).padStart(2, '0')
  return `${hours}:${minutes}`
})

// Horarios sugeridos al agendar: sin noche ni madrugada (07:00 a 22:00). Cualquier otro
// horario se escribe a mano en el mismo selector.
export const SUGGESTED_TIME_VALUES = TIME_VALUES.filter(t => t >= '07:00' && t <= '22:00')

// Interpreta lo que el usuario escribe como hora y devuelve "HH:MM" en 24h, o null si
// no es una hora válida. Acepta "9", "9:10", "0910", "910", "21.30", "9:10pm", "9 am".
export const parseTimeInput = (raw: string): string | null => {
  const text = raw.trim().toLowerCase().replace(/\s+/g, '')
  const match = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(text)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = match[2] ? Number(match[2]) : 0
  const period = match[3]?.[0]
  if (minutes > 59) return null
  if (period) {
    if (hours < 1 || hours > 12) return null
    if (period === 'a' && hours === 12) hours = 0
    if (period === 'p' && hours !== 12) hours += 12
  }
  if (hours > 23) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const formatTime12h =(hhmm: string): string => {
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
