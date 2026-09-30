import type { GestionKey } from './gestionStatus'
import { filtrosVacios, type LeadFilterState } from './leadFilters'

/* Copiado de propelia-frontend (src/pages/leads/lib/leadFilterParams.ts) sin `buildLeadFiltersJson`
   (era para el RPC de listado, que acá no hay) y con el parser/escritor que allá vive suelto en
   LeadList.tsx. Acá lo necesita también Equipo: sus enlaces al CRM ya filtrado se arman con esto
   y NUNCA a mano, porque `gestion` es la lista de estados EXCLUIDOS y un `?gestion=pendiente`
   escrito a mano mostraría justo lo contrario. */

/** Carteras mirando, separadas por coma. Ausente = la propia. */
export const OWNERS_PARAM = 'owners'
/** El lead abierto en el dialog: un enlace abre ese lead ya abierto. */
export const LEAD_PARAM = 'lead'

export const LEAD_FILTER_PARAMS = ['gestion', 'overdue', 'stages', 'excluded', 'includeDiscarded'] as const
export const LEAD_FILTER_PARAMS_WITH_QUERY = [...LEAD_FILTER_PARAMS, 'q'] as const

export const GESTION_KEYS: readonly GestionKey[] = ['pendiente', 'gestionado', 'pospuesto']
const esGestionKey = (v: string): v is GestionKey => (GESTION_KEYS as readonly string[]).includes(v)

const lista = (v: string | null) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean)

export function filtrosDesdeUrl(params: URLSearchParams): LeadFilterState {
  return {
    ...filtrosVacios(),
    q: params.get('q') ?? '',
    stageFilter: new Set(lista(params.get('stages'))),
    gestionExcluded: new Set(lista(params.get('gestion')).filter(esGestionKey)),
    overdueOnly: params.get('overdue') === '1',
    includeDiscarded: params.get('includeDiscarded') === '1',
    excludedPriorities: new Set(lista(params.get('excluded'))),
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
  if (patch.gestionExcluded) poner('gestion', GESTION_KEYS.filter(k => patch.gestionExcluded!.has(k)).join(','))
  if (patch.overdueOnly !== undefined) poner('overdue', patch.overdueOnly ? '1' : '')
  if (patch.includeDiscarded !== undefined) poner('includeDiscarded', patch.includeDiscarded ? '1' : '')
  if (patch.excludedPriorities) poner('excluded', unir(patch.excludedPriorities))
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

/** "Gestión", "Gestión y Etapa", "Gestión, Etapa y Tareas". Sin Intl.ListFormat, como el producto. */
export function formatFilterList(labels: string[]): string {
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

/** «Solo esta clave» dicho en el idioma de la URL: excluir las otras dos. */
export function soloGestion(key: GestionKey): Set<GestionKey> {
  return new Set(GESTION_KEYS.filter(k => k !== key))
}

export function enlaceAlCrm(opts: { owners?: string[]; gestion?: GestionKey; overdueOnly?: boolean }): string {
  let p = new URLSearchParams()
  if (opts.owners?.length) p.set(OWNERS_PARAM, [...opts.owners].sort().join(','))
  p = escribirFiltros(p, {
    ...(opts.gestion ? { gestionExcluded: soloGestion(opts.gestion) } : {}),
    ...(opts.overdueOnly ? { overdueOnly: true } : {}),
  })
  const qs = p.toString()
  return qs ? `/crm?${qs}` : '/crm'
}
