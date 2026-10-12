import { describe, expect, it } from 'vitest'
import { dueDate, mesesDelRango, periodOf, periodoDeInstante, tituloDePeriodo } from './periodos'

describe('periodOf', () => {
  it('corta el mes de un día calendario', () => {
    expect(periodOf('2026-10-11')).toBe('2026-10')
  })
})

describe('dueDate', () => {
  it('el día pedido dentro del mes', () => {
    expect(dueDate('2026-10', 15)).toBe('2026-10-15')
  })
  it('sin día de vencimiento, el 1', () => {
    expect(dueDate('2026-10', null)).toBe('2026-10-01')
  })
  it('un 31 en febrero cae el último día', () => {
    expect(dueDate('2027-02', 31)).toBe('2027-02-28')
    expect(dueDate('2028-02', 31)).toBe('2028-02-29')
  })
  it('un 31 en un mes de 30', () => {
    expect(dueDate('2026-04', 31)).toBe('2026-04-30')
  })
})

describe('mesesDelRango', () => {
  it('un día = un mes', () => {
    expect(mesesDelRango({ from: '2026-10-11', to: '2026-10-11' })).toEqual(['2026-10'])
  })
  it('varios meses, cruzando el año', () => {
    expect(mesesDelRango({ from: '2026-11-20', to: '2027-02-03' })).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('tituloDePeriodo', () => {
  it('es-ES, en minúscula', () => {
    expect(tituloDePeriodo('2026-10')).toBe('octubre de 2026')
  })
})

describe('periodoDeInstante', () => {
  it('usa el mes LOCAL, no el del string UTC', () => {
    // Medianoche y media del 1/oct en hora local: en una zona al este de UTC el ISO dice setiembre.
    const instante = new Date(2026, 9, 1, 0, 30).toISOString()
    expect(periodoDeInstante(instante)).toBe('2026-10')
    // Y el otro borde: 23:30 del 30/sep local, en una zona al oeste el ISO ya dice octubre.
    expect(periodoDeInstante(new Date(2026, 8, 30, 23, 30).toISOString())).toBe('2026-09')
  })
  it('entiende el formato de Postgres con espacio y +00', () => {
    const d = new Date('2026-09-16T12:00:00Z')
    expect(periodoDeInstante('2026-09-16 12:00:00+00')).toBe(periodOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`))
  })
})
