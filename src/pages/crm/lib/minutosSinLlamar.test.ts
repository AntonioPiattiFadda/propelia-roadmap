import { describe, expect, it } from 'vitest'
import { avisoSinLlamar, haceCuanto, horasYMinutos, tonoSinLlamar } from './minutosSinLlamar'

describe('horasYMinutos', () => {
  it('escribe horas y minutos con dos cifras', () => {
    expect(horasYMinutos(60)).toBe('1:00')
    expect(horasYMinutos(37)).toBe('0:37')
    expect(horasYMinutos(125)).toBe('2:05')
    expect(horasYMinutos(0)).toBe('0:00')
  })
  it('sin dato es una raya, no cero', () => {
    expect(horasYMinutos(null)).toBe('–')
    expect(horasYMinutos(undefined)).toBe('–')
  })
})

describe('tonoSinLlamar', () => {
  it('menos de 30 es verde, hasta una hora amarillo y más rojo', () => {
    expect(tonoSinLlamar(0)).toBe('verde')
    expect(tonoSinLlamar(29)).toBe('verde')
    expect(tonoSinLlamar(30)).toBe('amarillo')
    expect(tonoSinLlamar(60)).toBe('amarillo')
    expect(tonoSinLlamar(61)).toBe('rojo')
  })
  it('sin dato no tiene tono', () => {
    expect(tonoSinLlamar(null)).toBeNull()
    expect(tonoSinLlamar(undefined)).toBeNull()
  })
})

describe('avisoSinLlamar', () => {
  it('solo avisa en rojo, pasada la hora', () => {
    expect(avisoSinLlamar(60)).toBeNull()
    expect(avisoSinLlamar(null)).toBeNull()
    expect(avisoSinLlamar(61)).not.toBeNull()
  })
  it('dice el tiempo y pide contactar a Lorenzo Piatti', () => {
    const aviso = avisoSinLlamar(72)!
    expect(aviso.titulo).toContain('1:12')
    expect(aviso.texto).toContain('Lorenzo Piatti')
    expect(aviso.texto).toMatch(/problemas técnicos/)
  })
})

describe('haceCuanto', () => {
  const ahora = new Date('2026-11-19T20:00:00Z')
  it('elige minutos, horas o días', () => {
    expect(haceCuanto('2026-11-19T19:59:40Z', ahora)).toBe('recién')
    expect(haceCuanto('2026-11-19T19:55:00Z', ahora)).toBe('hace 5 min')
    expect(haceCuanto('2026-11-19T17:00:00Z', ahora)).toBe('hace 3 h')
    expect(haceCuanto('2026-11-17T18:00:00Z', ahora)).toBe('hace 2 d')
  })
  it('sin dato, roto o del futuro no dice nada', () => {
    expect(haceCuanto(null, ahora)).toBeNull()
    expect(haceCuanto('basura', ahora)).toBeNull()
    expect(haceCuanto('2026-11-19T21:00:00Z', ahora)).toBeNull()
  })
})
