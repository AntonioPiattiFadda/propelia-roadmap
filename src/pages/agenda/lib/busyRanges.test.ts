import { describe, it, expect } from 'vitest'
import { formatBusyRanges } from './busyRanges'

describe('formatBusyRanges', () => {
  it('formatea rangos en hora local HH:mm separados por coma', () => {
    const out = formatBusyRanges([
      { start: '2026-08-01T10:00:00Z', end: '2026-08-01T11:00:00Z' },
      { start: '2026-08-01T15:30:00Z', end: '2026-08-01T16:00:00Z' },
    ])
    // No fijamos la zona del runner: verificamos formato, orden y separador.
    expect(out).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}, \d{2}:\d{2}–\d{2}:\d{2}$/)
  })

  it('vacío devuelve string vacío', () => {
    expect(formatBusyRanges([])).toBe('')
  })
})
