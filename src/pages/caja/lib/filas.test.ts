import { describe, expect, it } from 'vitest'
import type { Etiqueta, Gasto } from '../types'
import { filasDelRango } from './filas'

// Instante a mediodía local: el mes local nunca depende de la zona de quien corre el test.
const instante = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString()

let n = 0
const etiqueta = (o: Partial<Etiqueta> = {}): Etiqueta => ({
  id: `e${++n}`, name: 'Vercel', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 20, due_day: 15,
  created_at: instante(2026, 8, 10), deleted_at: null, ...o,
})
const gasto = (o: Partial<Gasto> = {}): Gasto => ({
  id: `g${++n}`, preset_id: null, expense_name: 'Freelance', expense_type: 'VARIABLE', amount: 100, date: '2026-10-09',
  period: '2026-10', recurrence: 'ONE_TIME', status: 'PAID', notes: null, paid_by: 'u1', created_at: instante(2026, 10, 9), deleted_at: null, ...o,
})
const OCT = { from: '2026-10-01', to: '2026-10-31' }

describe('filasDelRango', () => {
  it('un fijo sin gasto en el mes es una fila virtual pendiente con el monto habitual', () => {
    const v = etiqueta()
    const filas = filasDelRango([], [v], OCT, true)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      kind: 'FIXED', fecha: '2026-10-15', nombre: 'Vercel', sub: 'Mensual · vence el 15', status: 'NONE',
      amount: 20, gasto: null, etiqueta: v, period: '2026-10',
    })
  })

  it('sin monto habitual el pendiente vale 0 y sin vencimiento dice solo Mensual', () => {
    const [f] = filasDelRango([], [etiqueta({ default_amount: null, due_day: null })], OCT, true)
    expect(f.amount).toBe(0)
    expect(f.sub).toBe('Mensual')
    expect(f.fecha).toBe('2026-10-01')
  })

  it('con el gasto cargado ya no hay pendiente: sale la fila del gasto, pagada', () => {
    const v = etiqueta()
    const g = gasto({ preset_id: v.id, expense_name: 'Vercel', expense_type: 'FIXED', amount: 22, date: '2026-10-14', recurrence: 'MONTHLY' })
    const filas = filasDelRango([g], [v], OCT, true)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ status: 'PAID', amount: 22, fecha: '2026-10-14', gasto: g, sub: 'Mensual · vence el 15' })
  })

  it('un fijo cargado sin fecha cae en su vencimiento', () => {
    const v = etiqueta()
    const g = gasto({ preset_id: v.id, expense_type: 'FIXED', date: null, period: '2026-10' })
    expect(filasDelRango([g], [v], OCT, true)[0].fecha).toBe('2026-10-15')
  })

  it('un fijo pagado en otro mes que su período cae en el mes del pago', () => {
    const v = etiqueta()
    const g = gasto({ preset_id: v.id, expense_type: 'FIXED', date: '2026-11-02', period: '2026-10' })
    expect(filasDelRango([g], [v], OCT, true).filter(f => f.gasto)).toHaveLength(0)
    // En noviembre además está el pendiente de noviembre (virtual): se busca la del gasto.
    const nov = filasDelRango([g], [v], { from: '2026-11-01', to: '2026-11-30' }, true)
    expect(nov.find(f => f.gasto)).toMatchObject({ fecha: '2026-11-02', gasto: g })
  })

  it('el fijo cargado sobrevive a que borren la etiqueta, con el nombre del gasto, y no genera pendiente', () => {
    const v = etiqueta({ deleted_at: instante(2026, 10, 2) })
    const g = gasto({ preset_id: v.id, expense_name: 'Vercel viejo', expense_type: 'FIXED', date: '2026-10-14' })
    const filas = filasDelRango([g], [v], OCT, true)
    expect(filas).toHaveLength(1)
    expect(filas[0].nombre).toBe('Vercel viejo')
  })

  it('una etiqueta borrada no genera pendientes', () => {
    expect(filasDelRango([], [etiqueta({ deleted_at: instante(2026, 9, 1) })], OCT, true)).toEqual([])
  })

  it('un fijo cargado sobrevive a que la etiqueta pase a variable', () => {
    const v = etiqueta({ expense_type: 'VARIABLE', recurrence: 'ONE_TIME' })
    const g = gasto({ preset_id: v.id, expense_type: 'FIXED', date: '2026-10-14' })
    expect(filasDelRango([g], [v], OCT, true)).toHaveLength(1)
  })

  it('una etiqueta variable nunca genera pendientes', () => {
    expect(filasDelRango([], [etiqueta({ expense_type: 'VARIABLE' })], OCT, true)).toEqual([])
  })

  it('un gasto borrado no cuenta: el pendiente vuelve', () => {
    const v = etiqueta()
    const g = gasto({ preset_id: v.id, expense_type: 'FIXED', deleted_at: instante(2026, 10, 3) })
    const filas = filasDelRango([g], [v], OCT, true)
    expect(filas).toHaveLength(1)
    expect(filas[0].status).toBe('NONE')
  })

  it('la etiqueta aparece desde el mes de su creación, no antes', () => {
    const v = etiqueta({ created_at: instante(2026, 11, 3) })
    expect(filasDelRango([], [v], OCT, true)).toEqual([])
    expect(filasDelRango([], [v], { from: '2026-11-01', to: '2026-11-30' }, true)).toHaveLength(1)
  })

  it('el mes de creación se lee en hora local, no del string UTC', () => {
    // 00:30 local del 1/nov: en una zona al este de UTC el ISO empieza con 2026-10.
    const v = etiqueta({ created_at: new Date(2026, 10, 1, 0, 30).toISOString() })
    expect(filasDelRango([], [v], OCT, true)).toEqual([])
    expect(filasDelRango([], [v], { from: '2026-11-01', to: '2026-11-30' }, true)).toHaveLength(1)
  })

  it('un 31 en febrero vence el último día', () => {
    const v = etiqueta({ due_day: 31, created_at: instante(2027, 1, 1) })
    expect(filasDelRango([], [v], { from: '2027-02-01', to: '2027-02-28' }, true)[0].fecha).toBe('2027-02-28')
  })

  it('un rango de un día solo trae lo que cae ese día', () => {
    const v = etiqueta()
    const g = gasto({ date: '2026-10-09' })
    expect(filasDelRango([g], [v], { from: '2026-10-15', to: '2026-10-15' }, true).map(f => f.nombre)).toEqual(['Vercel'])
    expect(filasDelRango([g], [v], { from: '2026-10-09', to: '2026-10-09' }, true).map(f => f.nombre)).toEqual(['Freelance'])
    expect(filasDelRango([g], [v], { from: '2026-10-10', to: '2026-10-14' }, true)).toEqual([])
  })

  it('un rango de varios meses trae un pendiente por mes sin gasto', () => {
    const v = etiqueta()
    const g = gasto({ preset_id: v.id, expense_type: 'FIXED', date: '2026-09-15', period: '2026-09' })
    const filas = filasDelRango([g], [v], { from: '2026-09-01', to: '2026-11-30' }, true)
    expect(filas.map(f => [f.period, f.status])).toEqual([['2026-11', 'NONE'], ['2026-10', 'NONE'], ['2026-09', 'PAID']])
  })

  it('el rango corta por la fecha de la fila, no por el mes', () => {
    const v = etiqueta({ due_day: 25 })
    expect(filasDelRango([], [v], { from: '2026-10-01', to: '2026-10-20' }, true)).toEqual([])
  })

  it('un variable sin fecha o fuera del rango no sale', () => {
    expect(filasDelRango([gasto({ date: null }), gasto({ date: '2026-09-30' })], [], OCT, true)).toEqual([])
  })

  it('un variable pendiente se dibuja con su fecha esperada y las notas de sub', () => {
    const g = gasto({ status: 'PENDING', notes: 'factura recibida' })
    expect(filasDelRango([g], [], OCT, true)[0]).toMatchObject({ kind: 'VARIABLE', status: 'PENDING', sub: 'factura recibida', fecha: '2026-10-09', gasto: g, etiqueta: null })
  })

  it('con pendientes apagado quedan solo los PAID', () => {
    const v = etiqueta()
    const filas = filasDelRango([gasto({ status: 'PENDING' }), gasto({ date: '2026-10-02' })], [v], OCT, false)
    expect(filas).toHaveLength(1)
    expect(filas[0].status).toBe('PAID')
  })

  it('orden: fecha descendente y nombre ascendente', () => {
    const gs = [
      gasto({ expense_name: 'Zeta', date: '2026-10-05' }),
      gasto({ expense_name: 'Alfa', date: '2026-10-05' }),
      gasto({ expense_name: 'Medio', date: '2026-10-20' }),
    ]
    expect(filasDelRango(gs, [], OCT, true).map(f => f.nombre)).toEqual(['Medio', 'Alfa', 'Zeta'])
  })
})
