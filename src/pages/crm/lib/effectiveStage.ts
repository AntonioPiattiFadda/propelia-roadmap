import type { CrmStage } from '../types'
import { findDiscardedStage } from './discardStage'

/* En el producto (src/pages/leads/lib/effectiveStage.ts) la etapa «efectiva» se elige entre la
   del cliente y las de los cruces con propiedades. Acá un lead tiene una sola columna de etapa,
   así que el archivo se queda con su pregunta —de qué etapa es este lead— y la contesta por id. */

/**
 * El catálogo por id, CON las etapas borradas (soft delete). Una etapa que se borra del funnel
 * sigue colgando de los leads que ya estaban ahí: se tiene que poder leer su nombre. Lo que no se
 * hace es ofrecerla en un menú: para eso está `etapasVivas`.
 */
export function catalogoDeEtapas(etapas: CrmStage[]): Map<string, CrmStage> {
  return new Map(etapas.map(e => [e.id, e]))
}

/** null con `funnel_stage_id` null (la FK es `on delete set null`) o con un id fuera del catálogo. */
export function etapaDelLead(
  lead: { funnel_stage_id: string | null },
  etapas: ReadonlyMap<string, CrmStage>,
): CrmStage | null {
  if (!lead.funnel_stage_id) return null
  return etapas.get(lead.funnel_stage_id) ?? null
}

export function etapasVivas(etapas: Iterable<CrmStage>): CrmStage[] {
  const vivas = [...etapas].filter(e => e.deleted_at == null)
  /* Descartado va siempre última (17/10/2026, por pedido): las etapas que se crean después le
     quedaban debajo en los menús, porque la posición es la del catálogo y no se reacomoda sola. */
  const descartada = findDiscardedStage(vivas)
  const ultima = (e: CrmStage) => (e === descartada ? 1 : 0)
  return vivas.sort((a, b) => ultima(a) - ultima(b) || a.position - b.position)
}

/**
 * A qué etapa se avanza el lead: la próxima viva y dentro del funnel, por posición. Sin etapa, la
 * primera del funnel. null desde la última o desde una fuera del funnel (descartado): sacar a un
 * lead de ahí es una decisión, no el paso siguiente. Una etapa borrada sigue por su posición.
 */
export function etapaSiguiente(
  lead: { funnel_stage_id: string | null },
  etapas: ReadonlyMap<string, CrmStage>,
): CrmStage | null {
  const actual = etapaDelLead(lead, etapas)
  if (actual?.is_out_of_funnel) return null
  const desde = actual?.position ?? -Infinity
  return etapasVivas(etapas.values()).find(e => !e.is_out_of_funnel && e.position > desde) ?? null
}
