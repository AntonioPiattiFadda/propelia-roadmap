import { describe, expect, it } from 'vitest'
import { alturaDeBloque, horarioDeEspana, JORNADAS } from './planningDiario'

describe('JORNADAS', () => {
  it('cada bloque sabe cuántos minutos dura, hasta el siguiente o el fin', () => {
    expect(JORNADAS.verano.bloques.map(b => b.minutos)).toEqual([30, 195, 15, 60, 30, 200, 10])
  })

  it('en verano Venezuela va 6 h atrás de España', () => {
    expect(JORNADAS.verano.bloques.map(b => b.vzla)).toEqual(['04:00', '04:30', '07:45', '08:00', '09:00', '09:30', '12:50'])
    expect(JORNADAS.verano.fin).toEqual({ vzla: '13:00', espana: '19:00' })
  })

  it('en invierno Venezuela va 5 h atrás de España', () => {
    expect(JORNADAS.invierno.bloques.map(b => b.vzla)).toEqual(['05:00', '05:30', '08:45', '09:00', '10:00', '10:30', '13:50'])
    expect(JORNADAS.invierno.fin).toEqual({ vzla: '14:00', espana: '19:00' })
  })
})

describe('alturaDeBloque', () => {
  it('crece con la duración: un bloque largo se ve más grande que uno corto', () => {
    expect(alturaDeBloque(195)).toBeGreaterThan(alturaDeBloque(60))
    expect(alturaDeBloque(60)).toBeGreaterThan(alturaDeBloque(30))
    expect(alturaDeBloque(30)).toBeGreaterThan(alturaDeBloque(15))
  })

  it('no es proporcional: 3 h 15 no mide 6,5 veces lo que 30 min, y lo corto sigue legible', () => {
    const ratio = alturaDeBloque(195) / alturaDeBloque(30)
    expect(ratio).toBeGreaterThan(2)
    expect(ratio).toBeLessThan(3.5)
    expect(alturaDeBloque(10)).toBeGreaterThanOrEqual(30)
  })

  it('la jornada entera entra en pantalla sin scroll', () => {
    const total = JORNADAS.verano.bloques.reduce((s, b) => s + alturaDeBloque(b.minutos), 0)
    expect(total).toBeLessThanOrEqual(520)
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
