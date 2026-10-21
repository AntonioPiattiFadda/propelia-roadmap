import { describe, it, expect } from 'vitest'
import { getWeekRange, toLocalYmd } from '@/lib/time'

describe('toLocalYmd', () => {
  it('formatea con padding de mes y día', () => {
    expect(toLocalYmd(new Date(2026, 7, 3))).toBe('2026-08-03')
  })

  it('sin padding necesario', () => {
    expect(toLocalYmd(new Date(2026, 10, 25))).toBe('2026-11-25')
  })
})

describe('getWeekRange', () => {
  it('desde un martes, arranca el lunes de esa semana', () => {
    const { start, end } = getWeekRange(new Date(2026, 7, 4, 15, 30))
    expect(toLocalYmd(start)).toBe('2026-08-03')
    expect(toLocalYmd(end)).toBe('2026-08-09')
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })

  it('desde el lunes mismo, arranca en el mismo día', () => {
    const { start, end } = getWeekRange(new Date(2026, 7, 3, 8, 0))
    expect(toLocalYmd(start)).toBe('2026-08-03')
    expect(toLocalYmd(end)).toBe('2026-08-09')
  })

  it('desde un domingo, la semana termina ese mismo día (no arranca una nueva)', () => {
    const { start, end } = getWeekRange(new Date(2026, 7, 9, 22, 0))
    expect(toLocalYmd(start)).toBe('2026-08-03')
    expect(toLocalYmd(end)).toBe('2026-08-09')
  })
})
