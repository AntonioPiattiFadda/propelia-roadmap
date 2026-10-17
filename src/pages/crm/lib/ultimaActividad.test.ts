import { describe, expect, it } from 'vitest'
import { fmtUltimaActividad } from './ultimaActividad'

// Jueves 15/10/2026, 18:00 hora local.
const ahora = new Date(2026, 9, 15, 18, 0)
const iso = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString()

describe('fmtUltimaActividad', () => {
  it('hoy, aunque sea a primera hora', () => {
    expect(fmtUltimaActividad(iso(2026, 10, 15, 0), ahora)).toBe('Hoy')
  })

  it('ayer', () => {
    expect(fmtUltimaActividad(iso(2026, 10, 14, 23), ahora)).toBe('Ayer')
  })

  it('otro día de esta semana (desde el lunes): el nombre del día', () => {
    expect(fmtUltimaActividad(iso(2026, 10, 12), ahora)).toBe('Lunes')
    expect(fmtUltimaActividad(iso(2026, 10, 13), ahora)).toBe('Martes')
  })

  it('de la semana pasada para atrás: la fecha', () => {
    expect(fmtUltimaActividad(iso(2026, 10, 11), ahora)).toBe('11/10')
    expect(fmtUltimaActividad(iso(2026, 9, 2), ahora)).toBe('02/09')
  })

  it('de otro año: la fecha con el año', () => {
    expect(fmtUltimaActividad(iso(2025, 12, 30), ahora)).toBe('30/12/25')
  })

  it('el lunes, ayer es el domingo de la semana pasada y gana «Ayer»', () => {
    const lunes = new Date(2026, 9, 12, 9)
    expect(fmtUltimaActividad(iso(2026, 10, 11), lunes)).toBe('Ayer')
    expect(fmtUltimaActividad(iso(2026, 10, 10), lunes)).toBe('10/10')
  })

  it('sin ningún registro, «Sin contactar»', () => {
    expect(fmtUltimaActividad(null, ahora)).toBe('Sin contactar')
    expect(fmtUltimaActividad(undefined, ahora)).toBe('Sin contactar')
  })
})
