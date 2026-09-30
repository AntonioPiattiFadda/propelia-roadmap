import { describe, expect, it } from 'vitest'
import { NAV, estaActivo } from './nav'

describe('estaActivo', () => {
  it('la ruta exacta', () => expect(estaActivo('/crm', '/crm')).toBe(true))
  it('una subruta', () => expect(estaActivo('/crm/lead/3', '/crm')).toBe(true))
  it('una ruta que solo empieza igual NO', () => expect(estaActivo('/crm-viejo', '/crm')).toBe(false))
  it('otra ruta', () => expect(estaActivo('/caja', '/crm')).toBe(false))
})

describe('NAV', () => {
  it('son las cuatro páginas, en este orden', () => {
    expect(NAV.map(n => n.path)).toEqual(['/roadmap', '/backlog', '/crm', '/caja'])
  })
})
