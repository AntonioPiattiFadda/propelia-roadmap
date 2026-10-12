import { describe, expect, it } from 'vitest'
import type { FilaCaja } from '../types'
import { resumenDeFilas, subtotalesPorMes } from './resumen'

const fila = (o: Partial<FilaCaja>): FilaCaja => ({
  kind: 'VARIABLE', fecha: '2026-10-05', nombre: 'x', sub: '', status: 'PAID', amount: 10, gasto: null, etiqueta: null, period: '2026-10', ...o,
})

describe('resumenDeFilas', () => {
  it('sin filas, todo en cero', () => {
    expect(resumenDeFilas([])).toEqual({
      total: 0, pagado: 0, porPagar: 0, nGastos: 0, nPagados: 0, nPendientes: 0, nFijosSinPagar: 0, fijos: 0, variables: 0,
    })
  })
  it('reparte pagado / por pagar y cuenta los fijos sin pagar', () => {
    const r = resumenDeFilas([
      fila({ kind: 'FIXED', status: 'PAID', amount: 36 }),
      fila({ kind: 'FIXED', status: 'NONE', amount: 280 }),
      fila({ kind: 'VARIABLE', status: 'PENDING', amount: 300 }),
      fila({ kind: 'VARIABLE', status: 'PAID', amount: 46.5 }),
    ])
    expect(r).toEqual({
      total: 662.5, pagado: 82.5, porPagar: 580, nGastos: 4, nPagados: 2, nPendientes: 2, nFijosSinPagar: 1, fijos: 316, variables: 346.5,
    })
  })
  it('no arrastra el error de coma flotante', () => {
    expect(resumenDeFilas([fila({ amount: 0.1 }), fila({ amount: 0.2 })]).total).toBe(0.3)
  })
})

describe('subtotalesPorMes', () => {
  it('uno por mes de la fecha de la fila, del más nuevo al más viejo', () => {
    const s = subtotalesPorMes([
      fila({ fecha: '2026-11-02', amount: 5 }),
      fila({ fecha: '2026-10-20', amount: 10 }),
      fila({ fecha: '2026-10-02', amount: 2.5 }),
    ])
    expect(s).toEqual([{ period: '2026-11', total: 5, n: 1 }, { period: '2026-10', total: 12.5, n: 2 }])
  })
  it('sin filas, vacío', () => {
    expect(subtotalesPorMes([])).toEqual([])
  })
})
