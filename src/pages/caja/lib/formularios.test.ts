import { describe, expect, it } from 'vitest'
import type { Etiqueta, Gasto } from '../types'
import { hayGastoDelMes, moverIndice, prefillDePagarFijo, validarEtiquetaForm, validarGasto, validarPago } from './formularios'

const et = (o: Partial<Etiqueta> = {}): Etiqueta => ({
  id: 'e1', name: 'Vercel Pro', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 20, due_day: 15,
  created_at: '2026-08-10T12:00:00Z', deleted_at: null, ...o,
})
const variable = et({ id: 'e2', name: 'Café', expense_type: 'VARIABLE', recurrence: 'ONE_TIME', default_amount: null, due_day: null })

describe('moverIndice', () => {
  it('da la vuelta en los dos sentidos', () => {
    expect(moverIndice(0, 3, 'ArrowDown')).toBe(1)
    expect(moverIndice(2, 3, 'ArrowDown')).toBe(0)
    expect(moverIndice(0, 3, 'ArrowUp')).toBe(2)
  })
  it('sin opciones se queda en 0', () => {
    expect(moverIndice(0, 0, 'ArrowDown')).toBe(0)
  })
})

describe('validarGasto', () => {
  const base = { etiqueta: et(), monto: '25,50', fecha: '2026-10-02', period: '2026-10', estado: 'PAID' as const, notas: '', yaPagado: false }
  it('sin etiqueta pide elegirla o crearla', () => {
    expect(validarGasto({ ...base, etiqueta: null })).toEqual({ error: 'Elegí una etiqueta o creala.' })
  })
  it('monto ilegible o cero', () => {
    expect(validarGasto({ ...base, monto: 'abc' })).toEqual({ error: 'El monto tiene que ser mayor que cero.' })
    expect(validarGasto({ ...base, monto: '0' })).toEqual({ error: 'El monto tiene que ser mayor que cero.' })
  })
  it('un fijo sin período o sin fecha', () => {
    expect(validarGasto({ ...base, period: '' })).toEqual({ error: 'Falta el período que cubre.' })
    expect(validarGasto({ ...base, fecha: '' })).toEqual({ error: 'Falta la fecha.' })
  })
  it('un período que no es YYYY-MM se rechaza (type=month cae a texto en algunos navegadores)', () => {
    const esperado = { error: 'El período tiene que ser un mes válido (AAAA-MM).' }
    for (const period of ['2026-13', '2026-1', 'octubre', '2026-10-01', '2026-00']) {
      expect(validarGasto({ ...base, period })).toEqual(esperado)
    }
  })
  it('un fijo con el mes ya pagado dice cuál', () => {
    expect(validarGasto({ ...base, yaPagado: true })).toEqual({ error: 'Octubre de 2026 ya está pagado para Vercel Pro.' })
  })
  it('un fijo arma su insert con el builder (siempre PAID)', () => {
    const r = validarGasto({ ...base, estado: 'PENDING' })
    expect(r).toMatchObject({ insert: { expense_type: 'FIXED', status: 'PAID', amount: 25.5, period: '2026-10', date: '2026-10-02' } })
  })
  it('un variable toma estado y notas, y el período sale de la fecha', () => {
    const r = validarGasto({ ...base, etiqueta: variable, estado: 'PENDING', notas: ' hola ', period: '', yaPagado: true })
    expect(r).toMatchObject({ insert: { expense_type: 'VARIABLE', status: 'PENDING', notes: 'hola', period: '2026-10' } })
  })
})

describe('validarPago', () => {
  it('valida monto y fecha', () => {
    expect(validarPago('', '2026-10-01')).toEqual({ error: 'El monto tiene que ser mayor que cero.' })
    expect(validarPago('10', '')).toEqual({ error: 'Falta la fecha de pago.' })
    expect(validarPago('10,5', '2026-10-01')).toEqual({ amount: 10.5, date: '2026-10-01' })
  })
})

describe('validarEtiquetaForm', () => {
  const vivas = [et(), variable]
  it('nombre vacío o repetido en cualquier tipo', () => {
    expect(validarEtiquetaForm({ name: ' ', tipo: 'FIXED', monto: '', dia: '' }, vivas)).toMatchObject({ error: expect.any(String) })
    expect(validarEtiquetaForm({ name: 'café', tipo: 'FIXED', monto: '', dia: '' }, vivas)).toEqual({ error: 'Ya existe una etiqueta con ese nombre.' })
  })
  it('al editar, su propio nombre no cuenta como repetido', () => {
    expect(validarEtiquetaForm({ name: 'Vercel Pro', tipo: 'FIXED', monto: '', dia: '' }, vivas, 'e1')).not.toHaveProperty('error')
  })
  it('fijo: monto y día opcionales, fuera de rango = null', () => {
    expect(validarEtiquetaForm({ name: 'Nueva', tipo: 'FIXED', monto: '12,5', dia: '10' }, vivas))
      .toEqual({ valores: { name: 'Nueva', expense_type: 'FIXED', default_amount: 12.5, due_day: 10 } })
    expect(validarEtiquetaForm({ name: 'Nueva', tipo: 'FIXED', monto: 'x', dia: '40' }, vivas))
      .toEqual({ valores: { name: 'Nueva', expense_type: 'FIXED', default_amount: null, due_day: null } })
  })
  it('variable: ni monto ni día', () => {
    expect(validarEtiquetaForm({ name: 'Nueva', tipo: 'VARIABLE', monto: '12', dia: '3' }, vivas))
      .toEqual({ valores: { name: 'Nueva', expense_type: 'VARIABLE', default_amount: null, due_day: null } })
  })
})

describe('prefillDePagarFijo', () => {
  it('etiqueta, monto habitual y período', () => {
    expect(prefillDePagarFijo(et(), '2026-09')).toEqual({ tipo: 'FIXED', etiqueta: et(), monto: '20', period: '2026-09' })
  })
  it('sin monto habitual, vacío', () => {
    expect(prefillDePagarFijo(et({ default_amount: null }), '2026-09').monto).toBe('')
  })
})

describe('hayGastoDelMes', () => {
  const g = (o: Partial<Gasto> = {}): Gasto => ({
    id: 'g1', preset_id: 'e1', expense_name: 'Vercel Pro', expense_type: 'FIXED', amount: 20, date: '2026-10-02',
    period: '2026-10', recurrence: 'MONTHLY', status: 'PAID', notes: null, created_at: '2026-10-02T10:00:00Z',
    deleted_at: null, ...o,
  })
  it('mira etiqueta + período entre los vivos', () => {
    expect(hayGastoDelMes([g()], 'e1', '2026-10')).toBe(true)
    expect(hayGastoDelMes([g()], 'e1', '2026-11')).toBe(false)
    expect(hayGastoDelMes([g()], 'e2', '2026-10')).toBe(false)
    expect(hayGastoDelMes([g({ deleted_at: '2026-10-03T00:00:00Z' })], 'e1', '2026-10')).toBe(false)
  })
})
