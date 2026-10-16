import { describe, expect, it } from 'vitest'
import {
  deleteLeadFilterParams, enlaceAlCrm, escribirFiltros, escribirLeadAbierto, escribirVista, filtrosDesdeUrl, formatFilterList,
  LEAD_FILTER_PARAMS_WITH_QUERY, OWNERS_PARAM, vistaDesdeUrl,
} from './leadFilterParams'

const params = (url: string) => new URL(url, 'http://x').searchParams

describe('filtrosDesdeUrl / escribirFiltros', () => {
  it('ida y vuelta', () => {
    const p = escribirFiltros(new URLSearchParams(), {
      q: 'inmo', stageFilter: new Set(['b', 'a']),
      overdueOnly: true, conTareas: true, includeDiscarded: true,
    })
    const f = filtrosDesdeUrl(p)
    expect(p.get('tareas')).toBe('1')
    expect(f.q).toBe('inmo')
    expect([...f.stageFilter]).toEqual(['a', 'b'])
    expect(f.overdueOnly).toBe(true)
    expect(f.conTareas).toBe(true)
    expect(f.includeDiscarded).toBe(true)
  })
  it('apagar un filtro borra el parámetro en vez de dejarlo vacío', () => {
    const p = escribirFiltros(params('/crm?overdue=1&stages=a&tareas=1'), { overdueOnly: false, stageFilter: new Set(), conTareas: false })
    expect(p.has('overdue')).toBe(false)
    expect(p.has('stages')).toBe(false)
    expect(p.has('tareas')).toBe(false)
  })
  it('«Limpiar filtros» también saca el de tareas', () => {
    expect(deleteLeadFilterParams(params('/crm?tareas=1&owners=u1')).toString()).toBe('owners=u1')
  })
  it('para recontactar: ?recontactar=1, y apagado se borra; «Limpiar filtros» lo saca', () => {
    const p = escribirFiltros(new URLSearchParams(), { paraRecontactar: true })
    expect(p.get('recontactar')).toBe('1')
    expect(filtrosDesdeUrl(p).paraRecontactar).toBe(true)
    expect(escribirFiltros(p, { paraRecontactar: false }).has('recontactar')).toBe(false)
    expect(deleteLeadFilterParams(params('/crm?recontactar=1&owners=u1')).toString()).toBe('owners=u1')
  })
  it('con teléfono de Google Maps: ?telMaps=1, y apagado se borra; «Limpiar filtros» lo saca', () => {
    const p = escribirFiltros(new URLSearchParams(), { conTelMaps: true })
    expect(p.get('telMaps')).toBe('1')
    expect(filtrosDesdeUrl(p).conTelMaps).toBe(true)
    expect(escribirFiltros(p, { conTelMaps: false }).has('telMaps')).toBe(false)
    expect(deleteLeadFilterParams(params('/crm?telMaps=1&owners=u1')).toString()).toBe('owners=u1')
  })
  it('orden por estado: ?orden=estado, y apagado se borra; «Limpiar filtros» lo saca', () => {
    const p = escribirFiltros(new URLSearchParams(), { ordenPorEstado: true })
    expect(p.get('orden')).toBe('estado')
    expect(filtrosDesdeUrl(p).ordenPorEstado).toBe(true)
    expect(escribirFiltros(p, { ordenPorEstado: false }).has('orden')).toBe(false)
    expect(deleteLeadFilterParams(params('/crm?orden=estado&owners=u1')).toString()).toBe('owners=u1')
  })
  it('un enlace viejo con ?gestion= o ?excluded= (prioridades) se ignora sin romper nada', () => {
    const f = filtrosDesdeUrl(params('/crm?gestion=gestionado,pospuesto&excluded=x&overdue=1'))
    expect(Object.keys(f).sort()).toEqual(Object.keys(filtrosDesdeUrl(params('/crm'))).sort())
    expect(f.overdueOnly).toBe(true)
  })
  it('sin tareas: ?tareas=sin, el mismo parámetro que «con tareas» (?tareas=1)', () => {
    const p = escribirFiltros(new URLSearchParams(), { sinTareas: true })
    expect(p.get('tareas')).toBe('sin')
    const f = filtrosDesdeUrl(p)
    expect(f.sinTareas).toBe(true)
    expect(f.conTareas).toBe(false)
    expect(filtrosDesdeUrl(params('/crm?tareas=1')).sinTareas).toBe(false)
  })
  it('con y sin tareas se excluyen: prender uno apaga el otro', () => {
    expect(escribirFiltros(params('/crm?tareas=sin'), { conTareas: true }).get('tareas')).toBe('1')
    expect(escribirFiltros(params('/crm?tareas=1'), { sinTareas: true }).get('tareas')).toBe('sin')
    expect(escribirFiltros(params('/crm?tareas=sin'), { conTareas: true, sinTareas: false }).get('tareas')).toBe('1')
  })
  it('apagar el que no está puesto no borra el otro', () => {
    expect(escribirFiltros(params('/crm?tareas=sin'), { conTareas: false }).get('tareas')).toBe('sin')
    expect(escribirFiltros(params('/crm?tareas=1'), { sinTareas: false }).get('tareas')).toBe('1')
    expect(escribirFiltros(params('/crm?tareas=sin'), { sinTareas: false }).has('tareas')).toBe(false)
  })
  it('un valor de ?tareas= desconocido se ignora', () => {
    const f = filtrosDesdeUrl(params('/crm?tareas=algo'))
    expect(f.conTareas).toBe(false)
    expect(f.sinTareas).toBe(false)
  })
  it('no toca lo que no es filtro (carteras, lead abierto)', () => {
    const p = escribirFiltros(params('/crm?owners=u1&lead=l1'), { q: 'x' })
    expect(p.get('owners')).toBe('u1')
    expect(p.get('lead')).toBe('l1')
  })
})

describe('vistaDesdeUrl / escribirVista', () => {
  it('por defecto, y con un valor desconocido, la lista', () => {
    expect(vistaDesdeUrl(params('/crm'))).toBe('lista')
    expect(vistaDesdeUrl(params('/crm?vista=kanban'))).toBe('lista')
  })
  it('?vista=columnas', () => {
    expect(vistaDesdeUrl(params('/crm?vista=columnas'))).toBe('columnas')
  })
  it('la lista es la URL sin parámetro, y el resto no se toca', () => {
    const p = escribirVista(params('/crm?owners=u1&vista=columnas'), 'lista')
    expect(p.toString()).toBe('owners=u1')
    expect(escribirVista(p, 'columnas').get('vista')).toBe('columnas')
  })
  it('«Limpiar filtros» no cambia la vista: no es un filtro', () => {
    expect(deleteLeadFilterParams(params('/crm?vista=columnas&tareas=sin'), LEAD_FILTER_PARAMS_WITH_QUERY).toString()).toBe('vista=columnas')
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

describe('enlaceAlCrm', () => {
  it('carteras ordenadas', () => {
    expect(params(enlaceAlCrm({ owners: ['u2', 'u1'] })).get(OWNERS_PARAM)).toBe('u1,u2')
  })
  it('tareas vencidas', () => {
    expect(filtrosDesdeUrl(params(enlaceAlCrm({ owners: ['u1'], overdueOnly: true }))).overdueOnly).toBe(true)
  })
  it('tareas vencidas prende también «Tareas»: es su subfiltro', () => {
    expect(filtrosDesdeUrl(params(enlaceAlCrm({ overdueOnly: true }))).conTareas).toBe(true)
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
    expect(formatFilterList(['Etapa'])).toBe('Etapa')
    expect(formatFilterList(['Búsqueda', 'Etapa', 'Tareas'])).toBe('Búsqueda, Etapa y Tareas')
  })
})
