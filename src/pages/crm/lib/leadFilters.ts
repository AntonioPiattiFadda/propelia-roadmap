import type { CrmLeadRow, EtapaConPrioridad } from '../types'
import { etapaDelLead } from './effectiveStage'
import { claveDeGestion, gestionDeLead, type GestionKey, type GestionStatus } from './gestionStatus'

/* Copiado de propelia-frontend (src/pages/leads/lib/leadFilters.ts) sin lo inmobiliario (pisos,
   presupuesto, zonas, cruces, compraventa) y sin `frozenIds`. Acá la lista entera ya está en el
   cliente —la RLS recortó— así que no hay RPC con el que mantenerse en espejo. */

export const PRIORITY_NONE = 'none'

export type LeadFilterState = {
  q: string
  stageFilter: Set<string>
  /** En la URL y acá, la lista de claves EXCLUIDAS (igual que el producto). */
  gestionExcluded: Set<GestionKey>
  overdueOnly: boolean
  includeDiscarded: boolean
  excludedPriorities: Set<string>
}

// Función y no constante: una constante con Sets adentro se compartiría y alguien la mutaría.
export function filtrosVacios(): LeadFilterState {
  return {
    q: '', stageFilter: new Set(), gestionExcluded: new Set(), overdueOnly: false,
    includeDiscarded: false, excludedPriorities: new Set(),
  }
}

export type LeadFilterContext = {
  overdueLeadIds: ReadonlySet<string>
  etapas: ReadonlyMap<string, EtapaConPrioridad>
  /** Un solo «ahora» por pintada: si cada fila leyera su propio Date.now(), dos leads idénticos
   *  podrían caer de lados distintos del vencimiento. */
  now: number
}

export type FilterDimension = 'overdue' | 'gestion' | 'stage' | 'priority' | 'discarded'

export function estadoDeGestion(l: CrmLeadRow, ctx: LeadFilterContext): GestionStatus {
  return gestionDeLead(l, etapaDelLead(l, ctx.etapas)?.management_tolerance_hours, ctx.now)
}

export function esDescartado(l: CrmLeadRow, etapas: ReadonlyMap<string, EtapaConPrioridad>): boolean {
  return etapaDelLead(l, etapas)?.is_out_of_funnel === true
}

/** La prioridad es la de la etapa: `crm_leads` no tiene prioridad propia. */
export function prioridadDelLead(l: CrmLeadRow, etapas: ReadonlyMap<string, EtapaConPrioridad>): string {
  return etapaDelLead(l, etapas)?.priority?.id ?? PRIORITY_NONE
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')
// Solo se busca por teléfono si lo tipeado tiene forma de teléfono. «inmo 6» no es un teléfono,
// y compararlo por sus dígitos traería a todo el que tenga un 6.
const PARECE_TELEFONO = /^[\d\s+()-]+$/

function matchesSearch(l: CrmLeadRow, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const c = l.client
  const texto = [c?.company_name, c?.first_name, c?.last_name, c?.email].filter(Boolean).join(' ').toLowerCase()
  if (texto.includes(query)) return true
  if (!PARECE_TELEFONO.test(query)) return false
  const digitos = soloDigitos(query)
  // Sin este corte, '' está incluido en cualquier string y un teléfono vacío igualaría todo.
  if (!digitos) return false
  return [c?.phone, c?.alternative_phone_1, c?.alternative_phone_2]
    .some(tel => !!tel && soloDigitos(tel).includes(digitos))
}

/**
 * Todos los criterios. `skip` apaga uno para contar «cuántos quedarían si prendo este», que es
 * lo que muestran los chips.
 */
export function filterLeads(
  leads: CrmLeadRow[],
  filters: LeadFilterState,
  ctx: LeadFilterContext,
  skip: FilterDimension[] = [],
): CrmLeadRow[] {
  const s = new Set(skip)
  /* Buscar es preguntar por UN lead: «¿dónde está éste?». Si la respuesta es «quedó descartado»,
     esconderlo deja la duda de si existe. La búsqueda levanta el descarte y la prioridad excluida;
     el resto de los filtros sigue acotando. */
  const buscando = filters.q.trim().length > 0
  return leads.filter(l => {
    const etapaId = l.funnel_stage_id
    const etapaElegida = etapaId != null && filters.stageFilter.has(etapaId)
    return matchesSearch(l, filters.q)
      // Elegir a mano la etapa Descartado en el filtro de etapa es pedir verlos.
      && (buscando || s.has('discarded') || filters.includeDiscarded || etapaElegida || !esDescartado(l, ctx.etapas))
      && (buscando || s.has('priority') || filters.excludedPriorities.size === 0
          || !filters.excludedPriorities.has(prioridadDelLead(l, ctx.etapas)))
      && (s.has('stage') || filters.stageFilter.size === 0 || etapaElegida)
      && (s.has('gestion') || filters.gestionExcluded.size === 0
          || !filters.gestionExcluded.has(claveDeGestion(estadoDeGestion(l, ctx))))
      // Un descartado con tareas vencidas no es trabajo pendiente (mismo criterio que el producto).
      && (s.has('overdue') || !filters.overdueOnly || (ctx.overdueLeadIds.has(l.id) && !esDescartado(l, ctx.etapas)))
  })
}

/** La cartera va aparte de los filtros: es de quién son los leads, no qué leads son. */
export function leadsDeCarteras(leads: CrmLeadRow[], ids: readonly string[]): CrmLeadRow[] {
  const set = new Set(ids)
  return leads.filter(l => set.has(l.assigned_to))
}
