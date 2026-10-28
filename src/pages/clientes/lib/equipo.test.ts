import { describe, expect, it } from 'vitest'
import { contrasenaInicial, estadoDelAlta, linkDeAlta, normalizarWeb } from './equipo'

describe('contrasenaInicial', () => {
  it('nombre.apellido sin tildes ni espacios', () =>
    expect(contrasenaInicial('María José', 'Fernández')).toBe('mariajose.fernandez'))
  it('si no llega a 6 se le suma el año', () => expect(contrasenaInicial('Li', 'Wu', 2026)).toBe('li.wu2026'))
  it('la ñ pierde la virgulilla', () => expect(contrasenaInicial('Íñigo', 'Peña')).toBe('inigo.pena'))
})

describe('linkDeAlta', () => {
  it('la página pública de propelia-frontend con el token', () =>
    expect(linkDeAlta('7f3a9c2e-b41d-4e8a-9d5f-2c6b1a0e8f73')).toBe('https://crm.propelia.es/alta/7f3a9c2e-b41d-4e8a-9d5f-2c6b1a0e8f73'))
})

describe('estadoDelAlta', () => {
  it('sin enviar', () => expect(estadoDelAlta({ submitted_at: null }, [{}])).toEqual({ enviado: false }))
  it('enviado: cuándo y cuántas personas', () =>
    expect(estadoDelAlta({ submitted_at: '2026-10-27T10:00:00Z' }, [{}, {}, {}])).toEqual({ enviado: true, el: '2026-10-27T10:00:00Z', personas: 3 }))
})

describe('normalizarWeb', () => {
  it('vacía es null', () => expect(normalizarWeb('  ')).toBeNull())
  it('sin esquema le suma https', () => expect(normalizarWeb(' fincasribera.es ')).toBe('https://fincasribera.es'))
  it('con esquema queda como está, sin barra final', () => expect(normalizarWeb('http://fincas.es/pisos')).toBe('http://fincas.es/pisos'))
  it('sin dominio, con espacios o con otro esquema no vale', () => {
    expect(normalizarWeb('fincasribera')).toBeUndefined()
    expect(normalizarWeb('fincas ribera.es')).toBeUndefined()
    expect(normalizarWeb('javascript:alert(1)')).toBeUndefined()
  })
})
