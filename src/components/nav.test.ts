import { describe, expect, it } from 'vitest'
import { NAV, entradaActiva, estaActivo, hrefDe, inicioDe, navDe, puedeEntrar, soloSuperadmin, type NavItem } from './nav'

describe('estaActivo', () => {
  it('la ruta exacta', () => expect(estaActivo('/crm', '/crm')).toBe(true))
  it('una subruta', () => expect(estaActivo('/crm/lead/3', '/crm')).toBe(true))
  it('una ruta que solo empieza igual NO', () => expect(estaActivo('/crm-viejo', '/crm')).toBe(false))
  it('otra ruta', () => expect(estaActivo('/caja', '/crm')).toBe(false))
})

describe('NAV', () => {
  it('son las ocho páginas de primer nivel, en este orden', () => {
    expect(NAV.map(n => n.path)).toEqual(['/roadmap', '/crm', '/agenda', '/demos', '/clientes', '/equipo', '/caja', '/ajustes'])
  })
  it('el backlog ya no está en la barra', () => {
    const roadmap = NAV.find(n => n.id === 'roadmap')
    expect(roadmap?.hijos).toBeUndefined()
  })
  it('«Caja vista Loro» cuelga de la Caja y abre la vista por mes en otra pestaña', () => {
    const hijo = NAV.find(n => n.id === 'caja')?.hijos?.[0]
    expect(hijo?.label).toBe('Caja vista Loro')
    expect(hijo && hrefDe(hijo)).toBe('/caja?vista=meses')
    expect(hijo?.nuevaPestana).toBe(true)
  })
})

describe('hrefDe', () => {
  it('sin search es el path', () => expect(hrefDe(NAV.find(n => n.id === 'crm')!)).toBe('/crm'))
})

describe('entradaActiva', () => {
  const roadmap = NAV.find(n => n.id === 'roadmap')!
  const caja = NAV.find(n => n.id === 'caja')!
  it('en el tablero se marca el roadmap', () => expect(entradaActiva('/roadmap', roadmap)).toBe(true))
  it('en el backlog, que ya no es entrada, se marca el roadmap', () => expect(entradaActiva('/roadmap/backlog', roadmap)).toBe(true))
  it('en otra página, ninguno', () => expect(entradaActiva('/crm', roadmap)).toBe(false))
  it('un hijo que abre otra pestaña no le apaga la marca al padre', () => expect(entradaActiva('/caja', caja)).toBe(true))
})

describe('navDe', () => {
  it('un SUPERADMIN ve las ocho de primer nivel', () =>
    expect(navDe('SUPERADMIN').map(n => n.path)).toEqual(['/roadmap', '/crm', '/agenda', '/demos', '/clientes', '/equipo', '/caja', '/ajustes']))
  it('un SDR ve el CRM, la Agenda y Ajustes', () => expect(navDe('SDR').map(n => n.path)).toEqual(['/crm', '/agenda', '/ajustes']))
})

describe('puedeEntrar', () => {
  it('un SDR entra al CRM y a sus subrutas', () => {
    expect(puedeEntrar('SDR', '/crm')).toBe(true)
    expect(puedeEntrar('SDR', '/crm/lead/3')).toBe(true)
  })
  it('un SDR NO entra al resto', () => {
    for (const p of ['/roadmap', '/roadmap/backlog', '/demos', '/clientes', '/equipo', '/caja']) expect(puedeEntrar('SDR', p)).toBe(false)
  })
  it('un SDR entra a la Agenda y a Ajustes', () => {
    expect(puedeEntrar('SDR', '/agenda')).toBe(true)
    expect(puedeEntrar('SDR', '/ajustes')).toBe(true)
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

describe('soloSuperadmin', () => {
  const de = (id: string) => [...NAV, ...NAV.flatMap(n => n.hijos ?? [])].find(n => n.id === id)!
  it('lleva el badge lo que solo ve un SUPERADMIN', () => {
    for (const id of ['roadmap', 'demos', 'equipo', 'caja']) expect(soloSuperadmin(de(id))).toBe(true)
  })
  it('lo que ve todo el equipo, no', () => {
    for (const id of ['crm', 'agenda', 'ajustes']) expect(soloSuperadmin(de(id))).toBe(false)
  })
})
