/* Copiado de propelia-frontend (src/pages/leads/lib/discardStage.ts). Allá se llama
   `findDiscardedClientStage` porque hay dos funnels; acá hay uno. Se fue
   `discardActivityDescription`, que habla de inmuebles: su gemelo es `comentarioDescarte`. */
export interface DiscardableStage {
  id: string
  value: string
  is_out_of_funnel: boolean
  deleted_at?: string | null
}

/** Por value y no por nombre: «Descartado» se puede renombrar (en el seed no, pero igual), DISCARDED no. */
export function findDiscardedStage<T extends DiscardableStage>(stages: T[]): T | undefined {
  const vivas = stages.filter(s => s.deleted_at == null)
  return vivas.find(s => s.value.toUpperCase() === 'DISCARDED') ?? vivas.find(s => s.is_out_of_funnel)
}
