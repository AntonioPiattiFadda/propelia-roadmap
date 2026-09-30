import { describe, expect, it } from 'vitest'
import {
  deleteLeadFilterParams, enlaceAlCrm, escribirFiltros, escribirLeadAbierto, filtrosDesdeUrl, formatFilterList,
  OWNERS_PARAM, soloGestion,
} from './leadFilterParams'

const params = (url: string) => new URL(url, 'http://x').searchParams

describe('filtrosDesdeUrl / escribirFiltros', () => {
  it('ida y vuelta', () => {
    const p = escribirFiltros(new URLSearchParams(), {
      q: 'inmo', stageFilter: new Set(['b', 'a']), gestionExcluded: new Set(['gestionado']),
      overdueOnly: true, includeDiscarded: true, excludedPriorities: new Set(['x']),
    })
    const f = filtrosDesdeUrl(p)
    expect(f.q).toBe('inmo')
    expect([...f.stageFilter]).toEqual(['a', 'b'])
    expect([...f.gestionExcluded]).toEqual(['gestionado'])
    expect(f.overdueOnly).toBe(true)
    expect(f.includeDiscarded).toBe(true)
    expect([...f.excludedPriorities]).toEqual(['x'])
  })
  it('apagar un filtro borra el parámetro en vez de dejarlo vacío', () => {
    const p = escribirFiltros(params('/crm?overdue=1&stages=a'), { overdueOnly: false, stageFilter: new Set() })
    expect(p.has('overdue')).toBe(false)
    expect(p.has('stages')).toBe(false)
  })
  it('una clave de gestión inventada en la URL se ignora', () => {
    expect([...filtrosDesdeUrl(params('/crm?gestion=pendiente,cualquiera')).gestionExcluded]).toEqual(['pendiente'])
  })
  it('no toca lo que no es filtro (carteras, lead abierto)', () => {
    const p = escribirFiltros(params('/crm?owners=u1&lead=l1'), { q: 'x' })
    expect(p.get('owners')).toBe('u1')
    expect(p.get('lead')).toBe('l1')
  })
})

describe('escribirLeadAbierto', () => {
  it('pone el lead y deja el resto', () => {
    const p = escribirLeadAbierto(params('/crm?owners=u1'), 'l9')
    expect(p.get('lead')).toBe('l9')
    expect(p.get('owners')).toBe('u1')
  })
  it('null o vacío borra el parámetro', () => {
    expect(escribirLeadAbierto(params('/crm?lead=l1&owners=u1'), null).toString()).toBe('owners=u1')
    expect(escribirLeadAbierto(params('/crm?lead=l1'), '').has('lead')).toBe(false)
  })
  it('no muta los params de entrada', () => {
    const p = params('/crm?lead=l1')
    escribirLeadAbierto(p, null)
    expect(p.get('lead')).toBe('l1')
  })
})

describe('enlaceAlCrm — `gestion` es la lista de EXCLUIDOS', () => {
  it('«solo pendientes» excluye gestionados y pospuestos, no escribe ?gestion=pendiente', () => {
    const url = enlaceAlCrm({ owners: ['u1'], gestion: 'pendiente' })
    const f = filtrosDesdeUrl(params(url))
    expect(f.gestionExcluded).toEqual(soloGestion('pendiente'))
    expect(f.gestionExcluded.has('pendiente')).toBe(false)
    expect(params(url).get(OWNERS_PARAM)).toBe('u1')
  })
  it('tareas vencidas', () => {
    expect(filtrosDesdeUrl(params(enlaceAlCrm({ owners: ['u1'], overdueOnly: true }))).overdueOnly).toBe(true)
  })
  it('sin nada es /crm pelado', () => {
    expect(enlaceAlCrm({})).toBe('/crm')
  })
})

describe('deleteLeadFilterParams y formatFilterList (copiados)', () => {
  it('borra los filtros y deja el resto', () => {
    const p = deleteLeadFilterParams(params('/crm?overdue=1&owners=u1&q=a'), ['overdue', 'q'])
    expect(p.toString()).toBe('owners=u1')
  })
  it('lista en castellano', () => {
    expect(formatFilterList(['Gestión'])).toBe('Gestión')
    expect(formatFilterList(['Gestión', 'Etapa', 'Tareas'])).toBe('Gestión, Etapa y Tareas')
  })
})
