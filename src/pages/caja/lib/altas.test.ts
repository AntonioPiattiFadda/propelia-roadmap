import { describe, expect, it } from 'vitest'
import type { Etiqueta } from '../types'
import { nuevaEtiqueta, nuevoGastoFijo, nuevoGastoVariable } from './altas'

const et = (o: Partial<Etiqueta> = {}): Etiqueta => ({
  id: 'e1', name: 'Vercel Pro', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 20, due_day: 15,
  created_at: '2026-08-10T12:00:00Z', deleted_at: null, ...o,
})

describe('nuevoGastoFijo', () => {
  it('siempre PAID y MONTHLY, con el nombre de la etiqueta y el período que se le pasa', () => {
    expect(nuevoGastoFijo(et(), { amount: 25, date: '2026-11-02', period: '2026-10' })).toEqual({
      preset_id: 'e1', expense_name: 'Vercel Pro', expense_type: 'FIXED', amount: 25, date: '2026-11-02',
      period: '2026-10', recurrence: 'MONTHLY', status: 'PAID',
    })
  })
  it('rechaza una etiqueta variable', () => {
    expect(() => nuevoGastoFijo(et({ expense_type: 'VARIABLE' }), { amount: 1, date: '2026-10-02', period: '2026-10' })).toThrow()
  })
  it.each([0, -1, NaN])('rechaza el monto %s', amount => {
    expect(() => nuevoGastoFijo(et(), { amount, date: '2026-10-02', period: '2026-10' })).toThrow('caja_monto_invalido')
  })
})

describe('nuevoGastoVariable', () => {
  const v = et({ id: 'e2', name: 'Café', expense_type: 'VARIABLE', recurrence: 'ONE_TIME' })
  it('ONE_TIME, período de la fecha y notas vacías como null', () => {
    expect(nuevoGastoVariable(v, { amount: 3.5, date: '2026-10-09', status: 'PENDING', notes: '  ' })).toEqual({
      preset_id: 'e2', expense_name: 'Café', expense_type: 'VARIABLE', amount: 3.5, date: '2026-10-09',
      period: '2026-10', recurrence: 'ONE_TIME', status: 'PENDING', notes: null,
    })
  })
  it('recorta las notas', () => {
    expect(nuevoGastoVariable(v, { amount: 1, date: '2026-10-09', status: 'PAID', notes: ' hola ' }).notes).toBe('hola')
  })
  it('rechaza una etiqueta fija', () => {
    expect(() => nuevoGastoVariable(et(), { amount: 1, date: '2026-10-09', status: 'PAID' })).toThrow()
  })
})

describe('nuevaEtiqueta', () => {
  it('fijo: MONTHLY, nombre recortado, con monto y vencimiento', () => {
    expect(nuevaEtiqueta({ name: ' Hetzner ', expense_type: 'FIXED', default_amount: 12, due_day: 5 })).toEqual({
      name: 'Hetzner', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 12, due_day: 5,
    })
  })
  it('variable: ONE_TIME y sin vencimiento aunque lo traiga', () => {
    expect(nuevaEtiqueta({ name: 'Café', expense_type: 'VARIABLE', default_amount: null, due_day: 9 })).toEqual({
      name: 'Café', expense_type: 'VARIABLE', recurrence: 'ONE_TIME', default_amount: null, due_day: null,
    })
  })
  it('rechaza el nombre vacío', () => {
    expect(() => nuevaEtiqueta({ name: ' ', expense_type: 'FIXED' })).toThrow('caja_nombre_vacio')
  })
})
