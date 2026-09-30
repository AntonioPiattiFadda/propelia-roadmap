import { describe, expect, it } from 'vitest'
import { accesoDe } from './acceso'

const activa = { activo: true }
const inactiva = { activo: false }

describe('accesoDe', () => {
  it('mientras carga y no hay nada, espera', () => {
    expect(accesoDe({ cargando: true, error: null, fila: undefined })).toBe('cargando')
  })

  it('sin fila (la RLS no devolvió nada) no pasa', () => {
    expect(accesoDe({ cargando: false, error: null, fila: null })).toBe('sin-acceso')
  })

  it('con la fila dada de baja no pasa', () => {
    expect(accesoDe({ cargando: false, error: null, fila: inactiva })).toBe('sin-acceso')
  })

  it('con la fila activa pasa', () => {
    expect(accesoDe({ cargando: false, error: null, fila: activa })).toBe('ok')
  })

  it('un error sin fila es un error, NO «sin acceso»', () => {
    expect(accesoDe({ cargando: false, error: new Error('Failed to fetch'), fila: undefined })).toBe('error')
  })

  it('estando adentro, un refresco que falla no te saca', () => {
    expect(accesoDe({ cargando: false, error: new Error('Failed to fetch'), fila: activa })).toBe('ok')
  })

  it('estando adentro, un refresco en curso no te saca', () => {
    expect(accesoDe({ cargando: true, error: null, fila: activa })).toBe('ok')
  })
})
