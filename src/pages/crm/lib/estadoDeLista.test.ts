import { describe, expect, it } from 'vitest'
import { estadoDeLista } from './estadoDeLista'

describe('estadoDeLista', () => {
  it('cargando por primera vez', () =>
    expect(estadoDeLista({ cargando: true, error: null, total: undefined, visibles: 0 })).toBe('cargando'))
  // La misma regla que accesoDe(): un error de red NO es «no tenés leads».
  it('error sin datos: error, no lista vacía', () =>
    expect(estadoDeLista({ cargando: false, error: new TypeError('Failed to fetch'), total: undefined, visibles: 0 })).toBe('error'))
  it('un refresco que falla con datos en pantalla no los tapa', () =>
    expect(estadoDeLista({ cargando: false, error: new Error('x'), total: 5, visibles: 5 })).toBe('ok'))
  // Review Focus 3: un SDR sin nada cargado ve «todavía no tenés leads», no un error.
  it('cartera vacía', () =>
    expect(estadoDeLista({ cargando: false, error: null, total: 0, visibles: 0 })).toBe('sin-leads'))
  it('hay leads pero los filtros los esconden', () =>
    expect(estadoDeLista({ cargando: false, error: null, total: 4, visibles: 0 })).toBe('sin-resultados'))
})
