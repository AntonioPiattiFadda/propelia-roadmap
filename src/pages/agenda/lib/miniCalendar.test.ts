import { describe, it, expect } from 'vitest'
import { buildMiniCalendarGrid } from './miniCalendar'

describe('buildMiniCalendarGrid', () => {
  it('agosto 2026 arranca el lunes 27 de julio y tiene 42 días', () => {
    const grid = buildMiniCalendarGrid(new Date(2026, 7, 15))
    expect(grid).toHaveLength(42)
    expect(grid[0]).toEqual({ ymd: '2026-07-27', dayOfMonth: 27, isCurrentMonth: false })
  })

  it('marca isCurrentMonth solo para los días de agosto', () => {
    const grid = buildMiniCalendarGrid(new Date(2026, 7, 15))
    const august = grid.filter(day => day.isCurrentMonth)
    expect(august).toHaveLength(31)
    expect(august[0]).toEqual({ ymd: '2026-08-01', dayOfMonth: 1, isCurrentMonth: true })
    expect(august[august.length - 1]).toEqual({ ymd: '2026-08-31', dayOfMonth: 31, isCurrentMonth: true })
  })

  it('el mes de referencia cuyo día 1 cae lunes no agrega días previos innecesarios', () => {
    // Marzo 2027 arranca lunes (verificado con `date -d`)
    const grid = buildMiniCalendarGrid(new Date(2027, 2, 10))
    expect(grid[0]).toEqual({ ymd: '2027-03-01', dayOfMonth: 1, isCurrentMonth: true })
  })
})
