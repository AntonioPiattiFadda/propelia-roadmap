import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtDueLabel, isOverdue, localTodayIso, periodBounds, shiftIsoDate, startOfMonthIso, daysInMonth } from './calendarDate'

afterEach(() => { vi.useRealTimers() })

describe('localTodayIso', () => {
  // El caso que muerde: a las 23:30 en Buenos Aires ya es mañana en UTC. «Hoy» es el de quien mira.
  it('a las 23:30 hora local sigue siendo hoy, no el día UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 30))
    expect(localTodayIso()).toBe('2026-09-30')
  })
  // El espejo: a las 00:30 al este de UTC todavía es ayer en UTC. Con los dos casos, un bug de
  // `toISOString()` se atrapa en cualquier huso, al este o al oeste.
  it('a las 00:30 hora local ya es hoy, no el día UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 0, 30))
    expect(localTodayIso()).toBe('2026-09-30')
  })
})

describe('isOverdue', () => {
  it('una tarea que vence hoy NO está vencida; la de ayer sí; la completada nunca', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59))
    expect(isOverdue('2026-09-30', false)).toBe(false)
    expect(isOverdue('2026-09-29', false)).toBe(true)
    expect(isOverdue('2026-09-29', true)).toBe(false)
    expect(isOverdue(null, false)).toBe(false)
  })
})

describe('shiftIsoDate y fmtDueLabel', () => {
  it('cruza de mes sin correrse por el horario de verano', () => {
    expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('relativa cerca, fecha corta lejos', () => {
    expect(fmtDueLabel('2026-09-30', '2026-09-30')).toBe('Hoy')
    expect(fmtDueLabel('2026-10-01', '2026-09-30')).toBe('Mañana')
    expect(fmtDueLabel('2026-09-29', '2026-09-30')).toBe('Ayer')
    expect(fmtDueLabel('2026-10-12', '2026-09-30')).toBe('12 oct')
  })
})

describe('el mes', () => {
  it('primer día, cantidad de días y bordes locales', () => {
    expect(startOfMonthIso('2026-09-30')).toBe('2026-09-01')
    expect(daysInMonth('2026-09-01')).toBe(30)
    const { start, end } = periodBounds('2026-09-01', 30)
    expect(new Date(start).getDate()).toBe(1)
    expect(new Date(end).getMonth()).toBe(9) // 1 de octubre, exclusivo
  })
})
