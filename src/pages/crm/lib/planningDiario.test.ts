import { describe, expect, it } from 'vitest'
import { horarioDeEspana } from './planningDiario'

describe('horarioDeEspana', () => {
  it('es verano entre el último domingo de marzo y el último de octubre', () => {
    expect(horarioDeEspana(new Date('2026-10-16T12:00:00Z'))).toBe('verano')
    expect(horarioDeEspana(new Date('2026-03-30T12:00:00Z'))).toBe('verano')
  })

  it('es invierno fuera de esa franja', () => {
    expect(horarioDeEspana(new Date('2026-10-26T12:00:00Z'))).toBe('invierno')
    expect(horarioDeEspana(new Date('2026-03-28T12:00:00Z'))).toBe('invierno')
    expect(horarioDeEspana(new Date('2026-01-10T12:00:00Z'))).toBe('invierno')
  })

  it('cambia justo a la hora del cambio de España (01:00 UTC)', () => {
    expect(horarioDeEspana(new Date('2026-10-25T00:59:00Z'))).toBe('verano')
    expect(horarioDeEspana(new Date('2026-10-25T01:00:00Z'))).toBe('invierno')
  })
})
