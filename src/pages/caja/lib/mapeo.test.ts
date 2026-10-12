import { describe, expect, it } from 'vitest'
import type { Tables } from '@/types/database.types'
import { aEtiqueta, aGasto } from './mapeo'

const filaGasto = (o: Partial<Tables<'expenses'>> = {}): Tables<'expenses'> => ({
  id: 'g1', preset_id: 'e1', expense_name: 'Vercel', expense_type: 'FIXED', amount: 20, date: '2026-10-15',
  period: '2026-10', recurrence: 'MONTHLY', status: 'PAID', notes: null, created_by: null,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null, ...o,
})
const filaEtiqueta = (o: Partial<Tables<'expense_presets'>> = {}): Tables<'expense_presets'> => ({
  id: 'e1', name: 'Vercel', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 20, due_day: 15,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', deleted_at: null, ...o,
})

describe('aGasto', () => {
  it('angosta los strings a las uniones y deja afuera las columnas de auditoría', () => {
    const g = aGasto(filaGasto())
    expect(g.expense_type).toBe('FIXED')
    expect(g).not.toHaveProperty('updated_at')
    expect(g).not.toHaveProperty('created_by')
  })
  it('convierte el monto a número', () => {
    expect(aGasto(filaGasto({ amount: '12.5' as unknown as number })).amount).toBe(12.5)
  })
  it.each([['expense_type', 'OTRO'], ['status', 'IGNORED'], ['recurrence', 'YEARLY']])('rechaza %s desconocido', (campo, valor) => {
    expect(() => aGasto(filaGasto({ [campo]: valor }))).toThrow('caja_valor_desconocido')
  })
})

describe('aEtiqueta', () => {
  it('angosta y convierte el monto por defecto', () => {
    expect(aEtiqueta(filaEtiqueta({ default_amount: '20' as unknown as number })).default_amount).toBe(20)
    expect(aEtiqueta(filaEtiqueta({ default_amount: null })).default_amount).toBeNull()
  })
  it('rechaza un tipo desconocido', () => {
    expect(() => aEtiqueta(filaEtiqueta({ expense_type: 'X' }))).toThrow('caja_valor_desconocido')
  })
})
