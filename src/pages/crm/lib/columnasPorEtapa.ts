import type { CrmStage } from '../types'
import { etapaDelLead, etapasVivas } from './effectiveStage'

/* La vista en columnas del CRM (12/10/2026): una columna por etapa, cada lead en la de su etapa.
   El agrupado vive acá y no en el componente. Desaparecer de la pantalla es peor que caer en una
   columna de descarte: un lead en una etapa borrada sale en una columna con el nombre de esa etapa,
   y uno sin etapa (o con un id fuera del catálogo) en «Sin etapa», al final de todo. */

/** El id de la columna de los leads sin etapa. No choca con un uuid de etapa. */
export const SIN_ETAPA = 'sin-etapa'

export type ColumnaDeEtapa<T> = {
  id: string
  /** null solo en «Sin etapa». */
  etapa: CrmStage | null
  titulo: string
  leads: T[]
}

/**
 * Las etapas vivas del funnel van siempre, aunque estén vacías: una columna vacía es información
 * («nadie en Reunión») y es dónde se mira. Las fuera del funnel (Descartado), las borradas y «Sin
 * etapa» aparecen solo si tienen leads. Con etapas elegidas en el filtro (`soloEtapas` no vacío)
 * las columnas son exactamente esas, en el orden del funnel. Dentro de una columna se respeta el
 * orden en que llegan los leads.
 */
export function agruparPorEtapa<T extends { funnel_stage_id: string | null }>(
  leads: readonly T[],
  etapas: ReadonlyMap<string, CrmStage>,
  soloEtapas: ReadonlySet<string> = new Set(),
): ColumnaDeEtapa<T>[] {
  const porEtapa = new Map<string, T[]>()
  const sinEtapa: T[] = []
  for (const l of leads) {
    const e = etapaDelLead(l, etapas)
    if (!e) { sinEtapa.push(l); continue }
    const lista = porEtapa.get(e.id)
    if (lista) lista.push(l)
    else porEtapa.set(e.id, [l])
  }

  const columna = (e: CrmStage): ColumnaDeEtapa<T> => ({ id: e.id, etapa: e, titulo: e.label, leads: porEtapa.get(e.id) ?? [] })

  if (soloEtapas.size > 0) {
    return [...etapas.values()]
      .filter(e => soloEtapas.has(e.id))
      .sort((a, b) => a.position - b.position)
      .map(columna)
  }

  const vivas = etapasVivas(etapas.values())
  const borradas = [...etapas.values()]
    .filter(e => e.deleted_at != null)
    .sort((a, b) => a.position - b.position)
  const columnas = [
    ...vivas.filter(e => !e.is_out_of_funnel).map(columna),
    ...vivas.filter(e => e.is_out_of_funnel).map(columna).filter(c => c.leads.length > 0),
    ...borradas.map(columna).filter(c => c.leads.length > 0),
  ]
  if (sinEtapa.length > 0) columnas.push({ id: SIN_ETAPA, etapa: null, titulo: 'Sin etapa', leads: sinEtapa })
  return columnas
}
