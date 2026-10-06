import { describe, expect, it } from 'vitest'
import { NAV, entradaActiva, estaActivo, inicioDe, navDe, puedeEntrar, type NavItem } from './nav'

describe('estaActivo', () => {
  it('la ruta exacta', () => expect(estaActivo('/crm', '/crm')).toBe(true))
  it('una subruta', () => expect(estaActivo('/crm/lead/3', '/crm')).toBe(true))
  it('una ruta que solo empieza igual NO', () => expect(estaActivo('/crm-viejo', '/crm')).toBe(false))
  it('otra ruta', () => expect(estaActivo('/caja', '/crm')).toBe(false))
})

describe('NAV', () => {
  it('son las cuatro páginas de primer nivel, en este orden', () => {
    expect(NAV.map(n => n.path)).toEqual(['/roadmap', '/crm', '/equipo', '/caja'])
  })
  it('el backlog cuelga del roadmap', () => {
    const roadmap = NAV.find(n => n.id === 'roadmap')
    expect(roadmap?.hijos?.map(h => h.path)).toEqual(['/roadmap/backlog'])
  })
})

describe('entradaActiva', () => {
  const roadmap = NAV.find(n => n.id === 'roadmap')!
  it('en el tablero se marca el roadmap', () => expect(entradaActiva('/roadmap', roadmap)).toBe(true))
  it('en el backlog se marca el hijo y NO el padre', () => expect(entradaActiva('/roadmap/backlog', roadmap)).toBe(false))
  it('en otra página, ninguno', () => expect(entradaActiva('/crm', roadmap)).toBe(false))
})

describe('navDe', () => {
  it('un SUPERADMIN ve las cuatro de primer nivel', () =>
    expect(navDe('SUPERADMIN').map(n => n.path)).toEqual(['/roadmap', '/crm', '/equipo', '/caja']))
  it('un SUPERADMIN ve el backlog colgando del roadmap', () =>
    expect(navDe('SUPERADMIN')[0].hijos?.map(h => h.path)).toEqual(['/roadmap/backlog']))
  it('un SDR ve solo el CRM', () => expect(navDe('SDR').map(n => n.path)).toEqual(['/crm']))
})

describe('puedeEntrar', () => {
  it('un SDR entra al CRM y a sus subrutas', () => {
    expect(puedeEntrar('SDR', '/crm')).toBe(true)
    expect(puedeEntrar('SDR', '/crm/lead/3')).toBe(true)
  })
  it('un SDR NO entra al resto', () => {
    for (const p of ['/roadmap', '/roadmap/backlog', '/equipo', '/caja']) expect(puedeEntrar('SDR', p)).toBe(false)
  })
  it('un SDR NO entra a una ruta que solo empieza como el CRM', () =>
    expect(puedeEntrar('SDR', '/crm-viejo')).toBe(false))
  it('un SUPERADMIN entra a todas, hijos incluidos', () => {
    const todas = NAV.flatMap((n: NavItem) => [n, ...(n.hijos ?? [])])
    for (const n of todas) expect(puedeEntrar('SUPERADMIN', n.path)).toBe(true)
  })
  it('una ruta que no es de nadie no la abre nadie', () =>
    expect(puedeEntrar('SUPERADMIN', '/backlog')).toBe(false))
})

describe('inicioDe', () => {
  it('un SUPERADMIN arranca en el Roadmap', () => expect(inicioDe('SUPERADMIN')).toBe('/roadmap'))
  it('un SDR arranca en el CRM', () => expect(inicioDe('SDR')).toBe('/crm'))
})
