import { describe, expect, it } from 'vitest'
import { NAV, estaActivo, entradaActiva } from './nav'

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
