import { describe, expect, it } from 'vitest'
import { NAV, estaActivo, inicioDe, navDe, puedeEntrar } from './nav'

describe('estaActivo', () => {
  it('la ruta exacta', () => expect(estaActivo('/crm', '/crm')).toBe(true))
  it('una subruta', () => expect(estaActivo('/crm/lead/3', '/crm')).toBe(true))
  it('una ruta que solo empieza igual NO', () => expect(estaActivo('/crm-viejo', '/crm')).toBe(false))
  it('otra ruta', () => expect(estaActivo('/caja', '/crm')).toBe(false))
})

describe('NAV', () => {
  it('son las cinco páginas, en este orden', () => {
    expect(NAV.map(n => n.path)).toEqual(['/roadmap', '/backlog', '/crm', '/equipo', '/caja'])
  })
})

describe('navDe', () => {
  it('un SUPERADMIN ve las cinco', () =>
    expect(navDe('SUPERADMIN').map(n => n.path)).toEqual(['/roadmap', '/backlog', '/crm', '/equipo', '/caja']))
  it('un SDR ve solo el CRM', () => expect(navDe('SDR').map(n => n.path)).toEqual(['/crm']))
})

describe('puedeEntrar', () => {
  it('un SDR entra al CRM y a sus subrutas', () => {
    expect(puedeEntrar('SDR', '/crm')).toBe(true)
    expect(puedeEntrar('SDR', '/crm/lead/3')).toBe(true)
  })
  it('un SDR NO entra al resto', () => {
    for (const p of ['/roadmap', '/backlog', '/equipo', '/caja']) expect(puedeEntrar('SDR', p)).toBe(false)
  })
  it('un SDR NO entra a una ruta que solo empieza como el CRM', () =>
    expect(puedeEntrar('SDR', '/crm-viejo')).toBe(false))
  it('un SUPERADMIN entra a todas', () => {
    for (const n of NAV) expect(puedeEntrar('SUPERADMIN', n.path)).toBe(true)
  })
})

describe('inicioDe', () => {
  it('un SUPERADMIN arranca en el Roadmap', () => expect(inicioDe('SUPERADMIN')).toBe('/roadmap'))
  it('un SDR arranca en el CRM', () => expect(inicioDe('SDR')).toBe('/crm'))
})
