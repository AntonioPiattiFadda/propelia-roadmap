import { ORDENES_DE_LEADS, filtrosVacios, type LeadFilterState } from './leadFilters'
import { esObjetivo, type Objetivo } from './objetivos'

/* Copiado de propelia-frontend (src/pages/leads/lib/leadFilterParams.ts) sin `buildLeadFiltersJson`
   (era para el RPC de listado, que acá no hay) y con el parser/escritor que allá vive suelto en
   LeadList.tsx. Acá lo necesita también Equipo: sus enlaces al CRM ya filtrado se arman con
   `enlaceAlCrm` y NUNCA a mano. Sin `gestion` ni `excluded` (prioridades) desde el 10/10/2026:
   se sacaron del front para rediseñarlas, y un enlace viejo que los traiga simplemente se ignora.
   Lo mismo `telMaps` («Con tel. de Google Maps») desde el 17/10/2026: se sacó por pedido. */

/** Carteras mirando, separadas por coma. Ausente = la propia. */
export const OWNERS_PARAM = 'owners'
/** El lead abierto en el dialog: un enlace abre ese lead ya abierto. */
export const LEAD_PARAM = 'lead'

export const LEAD_FILTER_PARAMS = ['overdue', 'tareas', 'stages', 'recontactar', 'agendar', 'orden', 'objetivo'] as const
export const LEAD_FILTER_PARAMS_WITH_QUERY = [...LEAD_FILTER_PARAMS, 'q'] as const

/** `?tareas=sin`: los que no tienen ninguna tarea pendiente. `?tareas=1` sigue siendo «con». */
const TAREAS_SIN = 'sin'

/** Cómo se dibujan los leads: la lista (sin parámetro) o una columna por etapa. No es un filtro:
 *  «Limpiar filtros» no la toca. */
export const VISTA_PARAM = 'vista'
export type VistaCrm = 'lista' | 'columnas'

/** Un valor desconocido es la lista: un enlace roto no deja la pantalla en blanco. */
export function vistaDesdeUrl(params: URLSearchParams): VistaCrm {
  return params.get(VISTA_PARAM) === 'columnas' ? 'columnas' : 'lista'
}

/** La lista es la URL sin parámetro, por lo mismo que los filtros apagados. */
export function escribirVista(params: URLSearchParams, vista: VistaCrm): URLSearchParams {
  const next = new URLSearchParams(params)
  if (vista === 'columnas') next.set(VISTA_PARAM, vista)
  else next.delete(VISTA_PARAM)
  return next
}

const objetivoDesdeUrl = (v: string | null): Objetivo | null => (esObjetivo(v) ? v : null)

const lista = (v: string | null) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function filtrosDesdeUrl(params: URLSearchParams): LeadFilterState {
  return {
    ...filtrosVacios(),
    q: params.get('q') ?? '',
    stageFilter: new Set(lista(params.get('stages'))),
    overdueOnly: params.get('overdue') === '1',
    conTareas: params.get('tareas') === '1',
    sinTareas: params.get('tareas') === TAREAS_SIN,
    paraRecontactar: params.get('recontactar') === '1',
    pendienteAgendar: params.get('agendar') === '1',
    orden: ORDENES_DE_LEADS.find(o => o === params.get('orden')) ?? null,
    objetivo: objetivoDesdeUrl(params.get('objetivo')),
  }
}

/** Escribe solo lo que viene en `patch`. Un filtro apagado BORRA su parámetro: la URL limpia y la
 *  del estado por defecto tienen que ser la misma, o compartir un enlace arrastraría basura. */
export function escribirFiltros(params: URLSearchParams, patch: Partial<LeadFilterState>): URLSearchParams {
  const next = new URLSearchParams(params)
  const poner = (k: string, v: string) => { if (v) next.set(k, v); else next.delete(k) }
  // Ordenados: el mismo conjunto elegido en otro orden tiene que dar la misma URL.
  const unir = (s: Set<string>) => [...s].sort().join(',')
  if (patch.q !== undefined) poner('q', patch.q)
  if (patch.stageFilter) poner('stages', unir(patch.stageFilter))
  if (patch.overdueOnly !== undefined) poner('overdue', patch.overdueOnly ? '1' : '')
  // «Con» y «sin» tareas comparten `?tareas=` (1 / sin): prender uno pisa al otro, y apagar el que
  // no está puesto no borra el que sí.
  if (patch.conTareas !== undefined || patch.sinTareas !== undefined) {
    const actual = next.get('tareas')
    let con = patch.conTareas ?? actual === '1'
    let sin = patch.sinTareas ?? actual === TAREAS_SIN
    if (patch.conTareas) sin = false
    else if (patch.sinTareas) con = false
    poner('tareas', con ? '1' : sin ? TAREAS_SIN : '')
  }
  if (patch.paraRecontactar !== undefined) poner('recontactar', patch.paraRecontactar ? '1' : '')
  if (patch.pendienteAgendar !== undefined) poner('agendar', patch.pendienteAgendar ? '1' : '')
  if (patch.orden !== undefined) poner('orden', patch.orden ?? '')
  // Prender «Tareas» arranca por vencimiento (lo vencido arriba): un orden que quedó puesto de
  // antes le ganaría. Elegido después, con «Tareas» ya puesto, se respeta.
  else if (patch.conTareas) next.delete('orden')
  if (patch.objetivo !== undefined) poner('objetivo', patch.objetivo ?? '')
  return next
}

/** Única puerta para el `?lead=`: lo pone o lo borra. Vive acá para que quien abre el dialog y
 *  quien lo cierra no dupliquen la regla de «vacío = sin parámetro». */
export function escribirLeadAbierto(params: URLSearchParams, leadId: string | null | undefined): URLSearchParams {
  const next = new URLSearchParams(params)
  if (leadId) next.set(LEAD_PARAM, leadId)
  else next.delete(LEAD_PARAM)
  return next
}

export function deleteLeadFilterParams(params: URLSearchParams, keys: readonly string[] = LEAD_FILTER_PARAMS) {
  const next = new URLSearchParams(params)
  keys.forEach(k => next.delete(k))
  return next
}

/** "Etapa", "Etapa y Tareas", "Búsqueda, Etapa y Tareas". Sin Intl.ListFormat, como el producto. */
export function formatFilterList(labels: string[]): string {
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

export function enlaceAlCrm(opts: { owners?: string[]; overdueOnly?: boolean; lead?: string }): string {
  let p = new URLSearchParams()
  if (opts.owners?.length) p.set(OWNERS_PARAM, [...opts.owners].sort().join(','))
  // «Tareas vencidas» es un subfiltro de «Tareas»: sin ella prendida, el chip no se ve.
  if (opts.overdueOnly) p = escribirFiltros(p, { conTareas: true, overdueOnly: true })
  // El lead abierto (la alarma de una tarea, 17/10/2026): se abre aunque los filtros lo escondan.
  if (opts.lead) p = escribirLeadAbierto(p, opts.lead)
  const qs = p.toString()
  return qs ? `/crm?${qs}` : '/crm'
}
