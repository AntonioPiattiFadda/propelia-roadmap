import type { CrmLeadRow } from '../types'
import { claveDeGestion } from './gestionStatus'
import {
  esDescartado, estadoDeGestion, filterLeads, prioridadDelLead, type LeadFilterContext, type LeadFilterState,
} from './leadFilters'

/* Copiado de propelia-frontend (src/pages/leads/lib/computeLeadListCounters.ts) sin cruces,
   pisos ni compraventa. Allá quedó como oráculo de un RPC porque la tabla pagina; acá la lista
   está entera en el cliente y esto ES el cálculo de los chips. Devuelve números y funciones de
   conteo, nunca los arrays intermedios. */
export type LeadListCounters = {
  gestionTotal: number
  pendienteCount: number
  gestionadoCount: number
  pospuestoCount: number
  tareasTotal: number
  overdueLeadCount: number
  /** Cuántos quedarían eligiendo SOLO esta etapa. */
  stageCount: (stageId: string) => number
  priorityTotal: number
  priorityCount: (priorityId: string) => number
  /** Cuántos descartados aparecerían al prender «incluir descartados». */
  discardedCount: number
  matchingCount: number
}

export function computeLeadListCounters(
  leads: CrmLeadRow[], filters: LeadFilterState, ctx: LeadFilterContext,
): LeadListCounters {
  const baseGestion = filterLeads(leads, filters, ctx, ['gestion'])
  let pendienteCount = 0, gestionadoCount = 0, pospuestoCount = 0
  for (const l of baseGestion) {
    const k = claveDeGestion(estadoDeGestion(l, ctx))
    if (k === 'pendiente') pendienteCount++
    else if (k === 'pospuesto') pospuestoCount++
    else gestionadoCount++
  }

  const baseTareas = filterLeads(leads, filters, ctx, ['overdue'])
  const overdueLeadCount = baseTareas.filter(l => ctx.overdueLeadIds.has(l.id) && !esDescartado(l, ctx.etapas)).length

  // Etapa: el filtro completo con esa etapa sola. Así el número de Descartado también es verdad
  // (elegirla los muestra) sin una regla aparte. Son decenas de leads: una pasada por chip se paga.
  const stageCount = (stageId: string) =>
    filterLeads(leads, { ...filters, stageFilter: new Set([stageId]) }, ctx).length

  const basePrioridad = filterLeads(leads, filters, ctx, ['priority'])
  const priorityCount = (priorityId: string) =>
    basePrioridad.filter(l => prioridadDelLead(l, ctx.etapas) === priorityId).length

  const discardedCount = filterLeads(leads, { ...filters, includeDiscarded: true }, ctx)
    .filter(l => esDescartado(l, ctx.etapas)).length

  return {
    gestionTotal: baseGestion.length,
    pendienteCount,
    gestionadoCount,
    pospuestoCount,
    tareasTotal: baseTareas.length,
    overdueLeadCount,
    stageCount,
    priorityTotal: basePrioridad.length,
    priorityCount,
    discardedCount,
    matchingCount: filterLeads(leads, filters, ctx).length,
  }
}
