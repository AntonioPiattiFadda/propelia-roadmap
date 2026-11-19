import { describe, expect, it } from 'vitest'
import { horasYMinutos, tonoSinLlamar } from './minutosSinLlamar'

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
    expect(tonoSinLlamar(0)).toBe('bien')
    expect(tonoSinLlamar(29)).toBe('bien')
    expect(tonoSinLlamar(30)).toBe('atento')
    expect(tonoSinLlamar(60)).toBe('atento')
    expect(tonoSinLlamar(61)).toBe('mal')
  })
  it('sin dato no tiene tono', () => {
    expect(tonoSinLlamar(null)).toBeNull()
    expect(tonoSinLlamar(undefined)).toBeNull()
  })
})
