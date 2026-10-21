// Grilla de 6 semanas (42 días, lunes a domingo) para el mini-calendario navegable del
// panel lateral, con días del mes anterior/siguiente para completar la primera/última semana.
// Puro: sin fetch, sin DOM.

import { toLocalYmd } from '@/lib/time'

export interface MiniCalendarDay {
  ymd: string
  dayOfMonth: number
  isCurrentMonth: boolean
}

export const buildMiniCalendarGrid = (monthReference: Date): MiniCalendarDay[] => {
  const year = monthReference.getFullYear()
  const month = monthReference.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay() // 0=domingo..6=sábado
  const mondayOffset = firstWeekday === 0 ? -6 : 1 - firstWeekday

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 + mondayOffset + i)
    return {
      ymd: toLocalYmd(date),
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    }
  })
}
