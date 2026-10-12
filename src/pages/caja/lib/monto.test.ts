import { describe, expect, it } from 'vitest'
import { eur, montoAInput, parseMonto } from './monto'

describe('parseMonto', () => {
  it('formato español completo', () => {
    expect(parseMonto('1.234,50')).toBe(1234.5)
    expect(parseMonto('1.234.567,89')).toBe(1234567.89)
  })
  it('coma decimal', () => {
    expect(parseMonto('12,5')).toBe(12.5)
    expect(parseMonto('0,99')).toBe(0.99)
  })
  it('punto decimal de un teclado numérico', () => {
    expect(parseMonto('12.5')).toBe(12.5)
    expect(parseMonto('12.50')).toBe(12.5)
    expect(parseMonto('0.5')).toBe(0.5)
  })
  it('un punto con grupos de tres exactos son miles', () => {
    expect(parseMonto('1.234')).toBe(1234)
    expect(parseMonto('12.345')).toBe(12345)
    expect(parseMonto('1.234.567')).toBe(1234567)
  })
  it('enteros, con espacios y con el símbolo', () => {
    expect(parseMonto('20')).toBe(20)
    expect(parseMonto('  20 ')).toBe(20)
    expect(parseMonto('20 €')).toBe(20)
  })
  it('basura, vacío y negativos son NaN', () => {
    for (const x of ['', '  ', 'abc', '1,2,3', '1.2.3', '12,5,', '-5', '1e3', ',5', '.5', '1.234,5.6']) {
      expect(parseMonto(x), x).toBeNaN()
    }
  })
})

describe('eur', () => {
  it('es-ES, euros, dos decimales', () => {
    expect(eur(20).replace(/\u00a0/g, ' ')).toBe('20,00 €')
    expect(eur(46.5).replace(/\u00a0/g, ' ')).toBe('46,50 €')
  })
})

describe('montoAInput', () => {
  it('coma decimal y sin ceros inventados', () => {
    expect(montoAInput(12.5)).toBe('12,5')
    expect(montoAInput(20)).toBe('20')
  })
  it('null es vacío', () => {
    expect(montoAInput(null)).toBe('')
  })
  it('ida y vuelta con parseMonto', () => {
    expect(parseMonto(montoAInput(1234.56))).toBe(1234.56)
  })
})
