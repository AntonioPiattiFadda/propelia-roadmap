import { describe, expect, it } from 'vitest'
import { mensajeDeError } from './errores'

describe('mensajeDeError', () => {
  it('etiqueta repetida', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "expense_presets_name_key"' }, 'x'))
      .toBe('Ya existe una etiqueta con ese nombre.')
  })
  it('mes ya pagado', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "expenses_preset_period_key"' }, 'x'))
      .toBe('Ese mes ya está pagado.')
  })
  it('un fijo se carga pagado', () => {
    const m = mensajeDeError({ code: '23514', message: 'new row for relation "expenses" violates check constraint "expenses_fixed_paid_check"' }, 'x')
    expect(m).toMatch(/fijo/i)
    expect(m).toMatch(/pagad/i)
  })
  it('otro 23505 cae en el texto por defecto', () => {
    expect(mensajeDeError({ code: '23505', message: 'otra_restriccion' }, 'No se pudo.')).toBe('No se pudo.')
  })
  it('permisos y red', () => {
    expect(mensajeDeError({ code: '42501', message: 'new row violates row-level security policy' }, 'x')).toMatch(/permiso/)
    expect(mensajeDeError(new TypeError('Failed to fetch'), 'x')).toBe('No hay conexión. Probá de nuevo.')
  })
  it('lo desconocido, el fallback; undefined no rompe', () => {
    expect(mensajeDeError(new Error('boom'), 'Fallback')).toBe('Fallback')
    expect(mensajeDeError(undefined, 'Fallback')).toBe('Fallback')
  })
  it('un update que la RLS dejó en cero filas es falta de permiso', () => {
    expect(mensajeDeError(new Error('caja_sin_fila'), 'x')).toMatch(/permiso/)
  })
})
