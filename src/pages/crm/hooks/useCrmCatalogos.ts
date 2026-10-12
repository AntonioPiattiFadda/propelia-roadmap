import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { findDiscardedStage } from '../lib/discardStage'
import { catalogoDeEtapas, etapasVivas } from '../lib/effectiveStage'
import { getCatalogos } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* Etapas y canales (las prioridades se sacaron del front el 10/10/2026). `etapasPorId` trae
   también las borradas (para leer el nombre de la etapa de un lead viejo); todo lo que se OFRECE
   en un menú sale de las «activas». */
export function useCrmCatalogos() {
  const q = useQuery({ queryKey: CRM_KEYS.catalogos, queryFn: getCatalogos, staleTime: 5 * 60_000 })
  const etapasPorId = useMemo(
    () => catalogoDeEtapas(q.data?.etapas ?? []), [q.data])
  const etapasActivas = useMemo(() => etapasVivas(etapasPorId.values()), [etapasPorId])
  const canalesActivos = useMemo(
    () => (q.data?.canales ?? []).filter(c => c.deleted_at == null), [q.data])
  // Con los borrados, por lo mismo que las etapas: el origen de un lead viejo se sigue leyendo.
  const canalesPorId = useMemo(
    () => new Map((q.data?.canales ?? []).map(c => [c.id, c])), [q.data])
  const descartada = useMemo(() => findDiscardedStage(etapasActivas) ?? null, [etapasActivas])
  return {
    etapasPorId, etapasActivas, canalesActivos, canalesPorId, descartada,
    isLoading: q.isLoading, error: q.error,
  }
}
