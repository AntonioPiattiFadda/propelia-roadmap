import type { CrmPriority, CrmStage, EtapaConPrioridad } from '../types'

/* En el producto (src/pages/leads/lib/effectiveStage.ts) la etapa «efectiva» se elige entre la
   del cliente y las de los cruces con propiedades. Acá un lead tiene una sola columna de etapa,
   así que el archivo se queda con su pregunta —de qué etapa es este lead— y la contesta por id. */

/**
 * El catálogo por id, CON las etapas y prioridades borradas (soft delete). Una etapa que se
 * borra del funnel sigue colgando de los leads que ya estaban ahí: se tiene que poder leer su
 * nombre. Lo que no se hace es ofrecerla en un menú: para eso está `etapasVivas`.
 */
export function catalogoDeEtapas(etapas: CrmStage[], prioridades: CrmPriority[]): Map<string, EtapaConPrioridad> {
  const porId = new Map(prioridades.map(p => [p.id, p]))
  return new Map(etapas.map(e => [e.id, { ...e, priority: e.priority_id ? porId.get(e.priority_id) ?? null : null }]))
}

/** null con `funnel_stage_id` null (la FK es `on delete set null`) o con un id fuera del catálogo. */
export function etapaDelLead(
  lead: { funnel_stage_id: string | null },
  etapas: ReadonlyMap<string, EtapaConPrioridad>,
): EtapaConPrioridad | null {
  if (!lead.funnel_stage_id) return null
  return etapas.get(lead.funnel_stage_id) ?? null
}

export function etapasVivas(etapas: Iterable<EtapaConPrioridad>): EtapaConPrioridad[] {
  return [...etapas].filter(e => e.deleted_at == null).sort((a, b) => a.position - b.position)
}
