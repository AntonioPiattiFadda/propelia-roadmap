import type { CrmLeadRow } from '../types'
import { esDescartado, filterLeads, tieneTelMaps, type LeadFilterContext, type LeadFilterState } from './leadFilters'

/* Copiado de propelia-frontend (src/pages/leads/lib/computeLeadListCounters.ts) sin cruces,
   pisos ni compraventa, y sin gestión ni prioridades desde el 10/10/2026. Allá quedó como
   oráculo de un RPC porque la tabla pagina; acá la lista está entera en el cliente y esto ES el
   cálculo de los chips. Devuelve números y funciones de conteo, nunca los arrays intermedios. */
export type LeadListCounters = {
  tareasTotal: number
  overdueLeadCount: number
  /** Cuántos tienen alguna tarea pendiente, sin el filtro «Tareas» puesto. */
  conTareasCount: number
  /** Cuántos no tienen ninguna tarea pendiente, sin el filtro de tareas puesto. */
  sinTareasCount: number
  /** Cuántos quedarían eligiendo SOLO esta etapa. */
  stageCount: (stageId: string) => number
  /** Cuántos descartados aparecerían al prender «incluir descartados». */
  discardedCount: number
  /** Descartados con la fecha de volver a llamar cumplida, sin su propio filtro. */
  recontactarCount: number
  /** Con teléfono de Google Maps cargado, sin su propio filtro. */
  telMapsCount: number
  matchingCount: number
}

export function computeLeadListCounters(
  leads: CrmLeadRow[], filters: LeadFilterState, ctx: LeadFilterContext,
): LeadListCounters {
  const baseTareas = filterLeads(leads, filters, ctx, ['overdue'])
  const overdueLeadCount = baseTareas.filter(l => ctx.overdueLeadIds.has(l.id) && !esDescartado(l, ctx.etapas)).length
  const sinFiltroDeTareas = filterLeads(leads, filters, ctx, ['tareas'])
  const conTareasCount = sinFiltroDeTareas.filter(l => ctx.leadIdsConTareas.has(l.id)).length
  const sinTareasCount = sinFiltroDeTareas.length - conTareasCount

  // Etapa: el filtro completo con esa etapa sola. Así el número de Descartado también es verdad
  // (elegirla los muestra) sin una regla aparte. Son decenas de leads: una pasada por chip se paga.
  const stageCount = (stageId: string) =>
    filterLeads(leads, { ...filters, stageFilter: new Set([stageId]) }, ctx).length

  const discardedCount = filterLeads(leads, { ...filters, includeDiscarded: true }, ctx)
    .filter(l => esDescartado(l, ctx.etapas)).length

  const recontactarCount = filterLeads(leads, { ...filters, paraRecontactar: true }, ctx).length

  return {
    tareasTotal: baseTareas.length,
    overdueLeadCount,
    conTareasCount,
    sinTareasCount,
    stageCount,
    discardedCount,
    recontactarCount,
    telMapsCount: filterLeads(leads, filters, ctx, ['telMaps']).filter(tieneTelMaps).length,
    matchingCount: filterLeads(leads, filters, ctx).length,
  }
}
