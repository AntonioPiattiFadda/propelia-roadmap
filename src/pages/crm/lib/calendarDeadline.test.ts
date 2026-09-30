import { describe, it, expect } from 'vitest'
import { calendarDeadline } from './calendarDeadline'

describe('calendarDeadline', () => {
  it('tolerancia de 1 día: vence a la medianoche del día siguiente, sin importar la hora de referencia', () => {
    const morning = new Date(2026, 6, 13, 0, 0, 0, 0).getTime()
    const night = new Date(2026, 6, 13, 23, 59, 59, 999).getTime()
    const expected = new Date(2026, 6, 14, 0, 0, 0, 0).getTime()

    expect(calendarDeadline(morning, 24)).toBe(expected)
    expect(calendarDeadline(night, 24)).toBe(expected)
  })

  it('tolerancia menor a 24h se redondea hacia arriba a 1 día completo', () => {
    const ref = new Date(2026, 6, 13, 10, 0, 0, 0).getTime()
    const expected = new Date(2026, 6, 14, 0, 0, 0, 0).getTime()

    expect(calendarDeadline(ref, 10)).toBe(expected)
  })

  it('tolerancia de 1 semana (168h): vence 7 días calendario después', () => {
    const ref = new Date(2026, 6, 13, 12, 0, 0, 0).getTime()
    const expected = new Date(2026, 6, 20, 0, 0, 0, 0).getTime()

    expect(calendarDeadline(ref, 168)).toBe(expected)
  })

  it('corrimiento de año: referencia el 31 de diciembre, tolerancia 1 día vence el 1 de enero del año siguiente', () => {
    const ref = new Date(2026, 11, 31, 18, 0, 0, 0).getTime()
    const expected = new Date(2027, 0, 1, 0, 0, 0, 0).getTime()

    expect(calendarDeadline(ref, 24)).toBe(expected)
  })

  it('corrimiento de mes: 720h (1 mes) desde el 30 de enero vence el 1 de marzo', () => {
    const ref = new Date(2026, 0, 30, 18, 0, 0, 0).getTime()
    const expected = new Date(2026, 2, 1, 0, 0, 0, 0).getTime()

    expect(calendarDeadline(ref, 720)).toBe(expected)
  })
})
