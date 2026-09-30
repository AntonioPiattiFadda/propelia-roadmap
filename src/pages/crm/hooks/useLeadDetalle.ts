import { useQuery } from '@tanstack/react-query'
import { getDetalleLead } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/** Se pide al abrir el dialog y no con la lista: son seis consultas por lead. */
export function useLeadDetalle(leadId: string | null) {
  return useQuery({
    queryKey: CRM_KEYS.detalle(leadId ?? ''),
    queryFn: () => getDetalleLead(leadId!),
    enabled: !!leadId,
  })
}
