import { describe, expect, it } from 'vitest'
import { horarioDeEspana, JORNADAS } from './planningDiario'

describe('JORNADAS', () => {
  it('en verano Venezuela va 6 h atrás de España', () => {
    expect(JORNADAS.verano.bloques.map(b => b.vzla)).toEqual(['04:00', '06:30', '07:00', '08:00', '09:00', '09:20', '09:40', '10:10'])
    expect(JORNADAS.verano.fin).toEqual({ vzla: '13:00', espana: '19:00' })
  })

  it('en invierno Venezuela va 5 h atrás de España', () => {
    expect(JORNADAS.invierno.bloques.map(b => b.vzla)).toEqual(['05:00', '07:30', '08:00', '09:00', '10:00', '10:20', '10:40', '11:10'])
    expect(JORNADAS.invierno.fin).toEqual({ vzla: '14:00', espana: '19:00' })
  })
})

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
