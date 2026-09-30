import { describe, expect, it } from 'vitest'
import { mensajeDeLogin } from './mensajeDeLogin'

describe('mensajeDeLogin', () => {
  it('credenciales malas', () => {
    expect(mensajeDeLogin(new Error('Invalid login credentials'))).toBe('Email o contraseña incorrectos.')
  })

  it('cuenta sin confirmar', () => {
    expect(mensajeDeLogin(new Error('Email not confirmed'))).toBe('La cuenta todavía no está confirmada.')
  })

  it('sin red', () => {
    expect(mensajeDeLogin(new TypeError('Failed to fetch'))).toBe('No hay conexión con el servidor. Probá de nuevo.')
  })

  it('sin red en Safari', () => {
    expect(mensajeDeLogin(new TypeError('Load failed'))).toBe('No hay conexión con el servidor. Probá de nuevo.')
  })

  it('cualquier otro error muestra su texto', () => {
    expect(mensajeDeLogin(new Error('Algo raro'))).toBe('Algo raro')
  })

  it('algo que no es un error', () => {
    expect(mensajeDeLogin(undefined)).toBe('No se pudo iniciar sesión.')
  })
})
