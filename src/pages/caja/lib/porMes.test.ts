import { describe, expect, it } from 'vitest'
import type { Etiqueta, FilaCaja, Gasto, Pagador } from '../types'
import { mesesDeLaCaja, totalesPorPagador } from './porMes'

const pagadores: Pagador[] = [
  { id: 'u1', nombre: 'Lorenzo', iniciales: 'LP', color: '#000', activo: true },
  { id: 'u2', nombre: 'Antonio', iniciales: 'AP', color: '#111', activo: true },
]

const gasto = (g: Partial<Gasto>): Gasto => ({
  id: 'g', preset_id: null, expense_name: 'x', expense_type: 'VARIABLE', amount: 10, date: '2026-10-01',
  period: '2026-10', recurrence: 'ONE_TIME', status: 'PAID', notes: null, paid_by: 'u1',
  created_at: '2026-10-01T00:00:00Z', deleted_at: null, ...g,
})

const etiqueta = (e: Partial<Etiqueta>): Etiqueta => ({
  id: 'e', name: 'x', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 10, due_day: 5,
  created_at: '2026-01-01T00:00:00Z', deleted_at: null, ...e,
})

const fila = (f: Partial<FilaCaja>): FilaCaja => ({
  kind: 'VARIABLE', fecha: '2026-10-01', nombre: 'x', sub: '', status: 'PAID', amount: 10,
  gasto: gasto({}), etiqueta: null, period: '2026-10', ...f,
})

describe('mesesDeLaCaja', () => {
  it('sin filas no hay meses', () => {
    expect(mesesDeLaCaja([], pagadores)).toEqual([])
  })

  it('los meses van del más viejo al más nuevo', () => {
    const meses = mesesDeLaCaja([
      fila({ period: '2026-10', fecha: '2026-10-03' }),
      fila({ period: '2026-08', fecha: '2026-08-03' }),
      fila({ period: '2026-09', fecha: '2026-09-03' }),
    ], pagadores)
    expect(meses.map(m => m.period)).toEqual(['2026-08', '2026-09', '2026-10'])
  })

  it('agrupa por el mes imputado y no por la fecha de pago', () => {
    // El fijo de septiembre pagado el 2 de octubre sigue siendo de septiembre.
    const meses = mesesDeLaCaja([fila({ kind: 'FIXED', period: '2026-09', fecha: '2026-10-02' })], pagadores)
    expect(meses.map(m => m.period)).toEqual(['2026-09'])
  })

  it('separa los fijos mensuales de los variables', () => {
    const [mes] = mesesDeLaCaja([
      fila({ kind: 'VARIABLE', nombre: 'Taxi' }),
      fila({ kind: 'FIXED', nombre: 'Hetzner', gasto: gasto({ expense_type: 'FIXED', recurrence: 'MONTHLY' }) }),
    ], pagadores)
    expect(mes.fijos.map(f => f.nombre)).toEqual(['Hetzner'])
    expect(mes.variables.map(f => f.nombre)).toEqual(['Taxi'])
  })

  it('un fijo pendiente (sin gasto) cuenta como fijo por su etiqueta', () => {
    const [mes] = mesesDeLaCaja([fila({ kind: 'FIXED', status: 'NONE', gasto: null, etiqueta: etiqueta({}) })], pagadores)
    expect(mes.fijos).toHaveLength(1)
  })

  it('un fijo de una sola vez no va con los mensuales', () => {
    const [mes] = mesesDeLaCaja([
      fila({ kind: 'FIXED', nombre: 'Viejo', gasto: gasto({ expense_type: 'FIXED', recurrence: 'ONE_TIME' }) }),
    ], pagadores)
    expect(mes.fijos).toEqual([])
    expect(mes.variables.map(f => f.nombre)).toEqual(['Viejo'])
  })

  it('adentro de cada grupo, de la fecha más vieja a la más nueva y después por nombre', () => {
    const [mes] = mesesDeLaCaja([
      fila({ nombre: 'C', fecha: '2026-10-20' }),
      fila({ nombre: 'B', fecha: '2026-10-05' }),
      fila({ nombre: 'A', fecha: '2026-10-05' }),
    ], pagadores)
    expect(mes.variables.map(f => f.nombre)).toEqual(['A', 'B', 'C'])
  })

  it('el variable dice quién lo pagó, y las notas detrás', () => {
    const [mes] = mesesDeLaCaja([
      fila({ nombre: 'Taxi', gasto: gasto({ paid_by: 'u2', notes: 'al aeropuerto' }), sub: 'al aeropuerto' }),
    ], pagadores)
    expect(mes.variables[0].sub).toBe('Pagó Antonio · al aeropuerto')
  })

  it('el variable pendiente dice que nadie lo pagó todavía', () => {
    const [mes] = mesesDeLaCaja([
      fila({ status: 'PENDING', gasto: gasto({ status: 'PENDING', paid_by: null }), sub: '' }),
    ], pagadores)
    expect(mes.variables[0].sub).toBe('Sin pagar')
  })

  it('los fijos también dicen quién los pagó, delante de su «Mensual · vence el 5»', () => {
    const [mes] = mesesDeLaCaja([
      fila({ kind: 'FIXED', fecha: '2026-10-01', sub: 'Mensual · vence el 5', gasto: gasto({ expense_type: 'FIXED', recurrence: 'MONTHLY', paid_by: 'u2' }) }),
      fila({ kind: 'FIXED', fecha: '2026-10-05', status: 'NONE', gasto: null, etiqueta: etiqueta({}), sub: 'Mensual · vence el 5' }),
    ], pagadores)
    expect(mes.fijos.map(f => f.sub)).toEqual(['Pagó Antonio · Mensual · vence el 5', 'Sin pagar · Mensual · vence el 5'])
  })

  it('totales por mes, por fijos y por variables, redondeados a centavos', () => {
    const [mes] = mesesDeLaCaja([
      fila({ kind: 'FIXED', amount: 0.1, gasto: gasto({ expense_type: 'FIXED', recurrence: 'MONTHLY' }) }),
      fila({ kind: 'VARIABLE', amount: 0.2 }),
      fila({ kind: 'VARIABLE', amount: 1 }),
    ], pagadores)
    expect(mes.totalFijos).toBe(0.1)
    expect(mes.totalVariables).toBe(1.2)
    expect(mes.total).toBe(1.3)
  })
})

describe('totalesPorPagador', () => {
  const fijo = (amount: number, paid_by: string) =>
    fila({ kind: 'FIXED', amount, gasto: gasto({ expense_type: 'FIXED', recurrence: 'MONTHLY', paid_by }) })

  it('suma solo lo pagado, por quién lo pagó, separando fijos y variables', () => {
    const r = totalesPorPagador([
      fijo(10, 'u1'),
      fila({ amount: 0.1, gasto: gasto({ paid_by: 'u2' }) }),
      fila({ amount: 0.2, gasto: gasto({ paid_by: 'u2' }) }),
      fila({ amount: 99, status: 'PENDING', gasto: gasto({ status: 'PENDING', paid_by: null }) }),
      fila({ amount: 50, status: 'NONE', gasto: null }),
    ], pagadores)
    expect(r).toEqual([
      { pagador: pagadores[0], total: 10, fijos: 10, variables: 0, n: 1 },
      { pagador: pagadores[1], total: 0.3, fijos: 0, variables: 0.3, n: 2 },
    ])
  })

  it('cada pagador activo tiene su resumen aunque no haya pagado nada', () => {
    expect(totalesPorPagador([], pagadores)).toEqual([
      { pagador: pagadores[0], total: 0, fijos: 0, variables: 0, n: 0 },
      { pagador: pagadores[1], total: 0, fijos: 0, variables: 0, n: 0 },
    ])
  })

  it('un inactivo aparece solo si pagó algo', () => {
    const conInactivo = [...pagadores, { id: 'u3', nombre: 'Luis', iniciales: 'L', color: '#222', activo: false }]
    expect(totalesPorPagador([], conInactivo).map(t => t.pagador?.id)).toEqual(['u1', 'u2'])
    expect(totalesPorPagador([fila({ gasto: gasto({ paid_by: 'u3' }) })], conInactivo).map(t => t.pagador?.id))
      .toEqual(['u1', 'u2', 'u3'])
  })

  it('quien pagó y ya no está en la lista de pagadores no se pierde', () => {
    const r = totalesPorPagador([fila({ amount: 7, gasto: gasto({ paid_by: 'u9' }) })], pagadores)
    expect(r.at(-1)).toEqual({ pagador: null, total: 7, fijos: 0, variables: 7, n: 1 })
  })
})
