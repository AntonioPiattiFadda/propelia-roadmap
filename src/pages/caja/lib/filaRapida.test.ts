import { describe, expect, it } from 'vitest'
import type { Etiqueta, Gasto } from '../types'
import { fechaDeFilaRapida, insertDeFilaRapida, prepararFilaRapida, type EntradaRapida } from './filaRapida'

const etiqueta = (e: Partial<Etiqueta>): Etiqueta => ({
  id: 'e', name: 'Vercel', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 20, due_day: 5,
  created_at: '2026-01-01T00:00:00Z', deleted_at: null, ...e,
})

const gasto = (g: Partial<Gasto>): Gasto => ({
  id: 'g', preset_id: 'e', expense_name: 'Vercel', expense_type: 'FIXED', amount: 20, date: '2026-10-05',
  period: '2026-10', recurrence: 'MONTHLY', status: 'PAID', notes: null, paid_by: 'u1',
  created_at: '2026-10-05T00:00:00Z', deleted_at: null, ...g,
})

const entrada = (e: Partial<EntradaRapida>): EntradaRapida => ({
  tipo: 'FIXED', period: '2026-11', texto: 'Vercel', monto: '20', fecha: '2026-11-03', notas: '', pagadoPor: 'u1', ambos: false, ...e,
})

describe('fechaDeFilaRapida', () => {
  it('en el mes de hoy arranca en hoy', () => {
    expect(fechaDeFilaRapida('2026-11', '2026-11-21')).toBe('2026-11-21')
  })
  it('en otro mes arranca el día 1 de ese mes', () => {
    expect(fechaDeFilaRapida('2026-09', '2026-11-21')).toBe('2026-09-01')
  })
})

describe('prepararFilaRapida', () => {
  it('sin concepto no carga nada', () => {
    expect(prepararFilaRapida(entrada({ texto: '  ' }), [], [])).toEqual({ error: 'Escribí el concepto.' })
  })

  it('sin monto válido no carga nada', () => {
    expect(prepararFilaRapida(entrada({ monto: '0' }), [], [])).toEqual({ error: 'El monto tiene que ser mayor que cero.' })
  })

  it('sin quién pagó no carga nada', () => {
    expect(prepararFilaRapida(entrada({ pagadoPor: null }), [], [])).toEqual({ error: 'Elegí quién lo pagó.' })
  })

  it('un concepto nuevo en Fijos pide crear una etiqueta fija con ese monto como habitual', () => {
    expect(prepararFilaRapida(entrada({ texto: ' Notion ', monto: '12,50' }), [], [])).toEqual({
      crear: { name: 'Notion', expense_type: 'FIXED', default_amount: 12.5, due_day: null },
    })
  })

  it('un concepto nuevo en Variables pide crear una etiqueta variable sin monto habitual', () => {
    expect(prepararFilaRapida(entrada({ tipo: 'VARIABLE', texto: 'Taxi' }), [], [])).toEqual({
      crear: { name: 'Taxi', expense_type: 'VARIABLE', default_amount: null, due_day: null },
    })
  })

  it('una etiqueta que ya existe se usa, sin importar mayúsculas', () => {
    const r = prepararFilaRapida(entrada({ texto: 'vercel' }), [etiqueta({})], [])
    expect(r).toMatchObject({ insert: { preset_id: 'e', expense_type: 'FIXED', period: '2026-11', amount: 20, status: 'PAID', paid_by: 'u1' } })
  })

  it('una borrada no cuenta: se crea de nuevo', () => {
    const r = prepararFilaRapida(entrada({}), [etiqueta({ deleted_at: '2026-10-01T00:00:00Z' })], [])
    expect(r).toHaveProperty('crear')
  })

  it('una etiqueta del otro tipo no se carga en este bloque', () => {
    const r = prepararFilaRapida(entrada({ tipo: 'VARIABLE' }), [etiqueta({})], [])
    expect(r).toEqual({ error: '«Vercel» es un gasto fijo: cargalo en Fijos mensuales.' })
  })

  it('un fijo ya pagado ese mes no se repite', () => {
    const r = prepararFilaRapida(entrada({ period: '2026-10', fecha: '2026-10-03' }), [etiqueta({})], [gasto({})])
    expect(r).toHaveProperty('error')
  })
})

describe('insertDeFilaRapida', () => {
  it('«Ambos» lo marca como pagado entre los dos', () => {
    const r = insertDeFilaRapida(etiqueta({}), entrada({ ambos: true }), [])
    expect(r).toMatchObject({ insert: { paid_by: 'u1', paid_by_both: true } })
  })

  it('con una sola persona no manda la marca (anda sin la migración corrida)', () => {
    const r = insertDeFilaRapida(etiqueta({}), entrada({}), [])
    expect(r).toHaveProperty('insert')
    if ('insert' in r) expect(r.insert).not.toHaveProperty('paid_by_both')
  })

  it('un variable sale pagado, con su período de la fecha y la nota', () => {
    const r = insertDeFilaRapida(
      etiqueta({ id: 'v', name: 'Taxi', expense_type: 'VARIABLE', recurrence: 'ONE_TIME' }),
      entrada({ tipo: 'VARIABLE', texto: 'Taxi', fecha: '2026-11-04', notas: ' aeropuerto ' }),
      [],
    )
    expect(r).toMatchObject({ insert: { preset_id: 'v', expense_type: 'VARIABLE', period: '2026-11', status: 'PAID', notes: 'aeropuerto' } })
  })
})
