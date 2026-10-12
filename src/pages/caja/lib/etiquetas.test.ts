import { describe, expect, it } from 'vitest'
import type { Etiqueta, Gasto } from '../types'
import {
  cambiosDeEtiqueta, etiquetasVivas, gastosAPropagar, metaDeEtiqueta, mismoNombre, nombreRepetido, opcionesDeEtiqueta,
} from './etiquetas'

const et = (o: Partial<Etiqueta> = {}): Etiqueta => ({
  id: 'e1', name: 'Vercel Pro', expense_type: 'FIXED', recurrence: 'MONTHLY', default_amount: 20, due_day: 15,
  created_at: '2026-08-10T12:00:00Z', deleted_at: null, ...o,
})
const gasto = (id: string, period: string, o: Partial<Gasto> = {}): Gasto => ({
  id, preset_id: 'e1', expense_name: 'Vercel Pro', expense_type: 'FIXED', amount: 20, date: `${period}-15`, period,
  recurrence: 'MONTHLY', status: 'PAID', notes: null, created_at: '2026-08-10T12:00:00Z', deleted_at: null, ...o,
})

describe('mismoNombre / nombreRepetido', () => {
  it('ignora mayúsculas y espacios de los bordes', () => {
    expect(mismoNombre('  vercel pro ', 'Vercel Pro')).toBe(true)
    expect(mismoNombre('Vercel', 'Vercel Pro')).toBe(false)
  })
  it('solo cuentan las vivas', () => {
    const ets = [et({ id: 'a', name: 'Supabase', deleted_at: '2026-10-01T00:00:00Z' }), et({ id: 'b', name: 'Vercel' })]
    expect(nombreRepetido(ets, 'supabase')).toBe(false)
    expect(nombreRepetido(ets, ' VERCEL ')).toBe(true)
  })
  it('exceptoId deja editar una etiqueta sin chocar con ella misma', () => {
    const ets = [et({ id: 'b', name: 'Vercel' })]
    expect(nombreRepetido(ets, 'vercel', 'b')).toBe(false)
    expect(nombreRepetido(ets, 'vercel', 'otra')).toBe(true)
  })
  it('un nombre vacío nunca está repetido', () => {
    expect(nombreRepetido([et({ name: '' })], '  ')).toBe(false)
  })
})

describe('etiquetasVivas', () => {
  it('por tipo, sin borradas', () => {
    const ets = [et({ id: 'a' }), et({ id: 'b', expense_type: 'VARIABLE' }), et({ id: 'c', deleted_at: '2026-10-01T00:00:00Z' })]
    expect(etiquetasVivas(ets, 'FIXED').map(e => e.id)).toEqual(['a'])
    expect(etiquetasVivas(ets, 'VARIABLE').map(e => e.id)).toEqual(['b'])
  })
})

describe('metaDeEtiqueta', () => {
  it('monto, vencimiento y cantidad', () => {
    expect(metaDeEtiqueta(et(), 2).replace(/\u00a0/g, ' ')).toBe('20,00 € · vence el 15 · 2 gastos')
  })
  it('singular, y sin monto ni vencimiento', () => {
    expect(metaDeEtiqueta(et({ default_amount: null, due_day: null }), 1)).toBe('1 gasto')
  })
  it('cero gastos se dice', () => {
    expect(metaDeEtiqueta(et({ default_amount: null, due_day: null, expense_type: 'VARIABLE' }), 0)).toBe('0 gastos')
  })
})

describe('cambiosDeEtiqueta', () => {
  it('sin cambios, nada', () => {
    expect(cambiosDeEtiqueta(et(), { name: 'Vercel Pro', expense_type: 'FIXED' })).toEqual({ campos: [], cambios: {} })
  })
  it('solo el monto o el día no pide propagar', () => {
    expect(cambiosDeEtiqueta(et(), { name: ' Vercel Pro ', expense_type: 'FIXED' }).campos).toEqual([])
  })
  it('el nombre, recortado', () => {
    expect(cambiosDeEtiqueta(et(), { name: '  Vercel Team ', expense_type: 'FIXED' })).toEqual({
      campos: ['el nombre'], cambios: { expense_name: 'Vercel Team' },
    })
  })
  it('cambiar solo el tipo no pide nada: los gastos ya cargados conservan el suyo', () => {
    expect(cambiosDeEtiqueta(et(), { name: 'Vercel Pro', expense_type: 'VARIABLE' })).toEqual({ campos: [], cambios: {} })
  })
  it('nombre y tipo juntos: solo se propaga el nombre', () => {
    const antes = et({ expense_type: 'VARIABLE', recurrence: 'ONE_TIME' })
    expect(cambiosDeEtiqueta(antes, { name: 'Otro', expense_type: 'FIXED' })).toEqual({
      campos: ['el nombre'], cambios: { expense_name: 'Otro' },
    })
  })
})

describe('gastosAPropagar', () => {
  const gs = [
    gasto('viejo', '2026-08'),
    gasto('actual', '2026-10'),
    gasto('futuro', '2026-12'),
    gasto('borrado', '2026-11', { deleted_at: '2026-10-02T00:00:00Z' }),
    gasto('ajeno', '2026-11', { preset_id: 'otra' }),
  ]
  it('forward: period >= mes actual', () => {
    expect(gastosAPropagar(gs, 'e1', 'forward', '2026-10').map(g => g.id)).toEqual(['actual', 'futuro'])
  })
  it('all: todos los vivos de la etiqueta', () => {
    expect(gastosAPropagar(gs, 'e1', 'all', '2026-10').map(g => g.id)).toEqual(['viejo', 'actual', 'futuro'])
  })
  it('none: ninguno', () => {
    expect(gastosAPropagar(gs, 'e1', 'none', '2026-10')).toEqual([])
  })
})

describe('opcionesDeEtiqueta', () => {
  const ets = [
    et({ id: 'a', name: 'Vercel Pro' }), et({ id: 'b', name: 'Supabase' }), et({ id: 'c', name: 'Borrada', deleted_at: '2026-10-01T00:00:00Z' }),
    et({ id: 'd', name: 'Anuncios', expense_type: 'VARIABLE' }),
  ]
  it('sin texto lista las vivas del tipo y no ofrece crear', () => {
    const r = opcionesDeEtiqueta(ets, 'FIXED', '')
    expect(r.items.map(e => e.id)).toEqual(['a', 'b'])
    expect(r).toMatchObject({ hayExacta: false, mostrarCrear: false })
  })
  it('filtra por contenido sin mayúsculas y ofrece crear', () => {
    const r = opcionesDeEtiqueta(ets, 'FIXED', 'ERCEL')
    expect(r.items.map(e => e.id)).toEqual(['a'])
    expect(r).toMatchObject({ hayExacta: false, mostrarCrear: true })
  })
  it('con coincidencia exacta no ofrece crear', () => {
    const r = opcionesDeEtiqueta(ets, 'FIXED', ' vercel pro ')
    expect(r).toMatchObject({ hayExacta: true, mostrarCrear: false })
  })
  it('sin resultados ofrece crear', () => {
    const r = opcionesDeEtiqueta(ets, 'VARIABLE', 'zzz')
    expect(r.items).toEqual([])
    expect(r.mostrarCrear).toBe(true)
  })
  it('un texto en blanco no es texto', () => {
    expect(opcionesDeEtiqueta(ets, 'FIXED', '   ').mostrarCrear).toBe(false)
  })
})
