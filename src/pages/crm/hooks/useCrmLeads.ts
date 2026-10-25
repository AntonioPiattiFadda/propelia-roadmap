import { useQuery } from '@tanstack/react-query'
import { daysInMonth, periodBounds, startOfMonthIso } from '@/lib/calendarDate'
import { getLead, getLeads, getReunionesEntre, getTareasPendientes } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* La lista entera, una vez (decisión 4 de la spec): son decenas de leads, la RLS ya recortó, y
   filtros y contadores salen de funciones puras sobre este array. */
export function useCrmLeads() {
  return useQuery({ queryKey: CRM_KEYS.leads, queryFn: getLeads })
}

/** Un lead solo, para quien no tiene la lista (la Agenda). */
export function useLead(leadId: string | undefined) {
  return useQuery({ queryKey: CRM_KEYS.lead(leadId ?? ''), queryFn: () => getLead(leadId!), enabled: !!leadId })
}

/** Las pendientes de todas las carteras que veo: marcan «tareas vencidas» en la lista y en Equipo.
 *  Las alarmas (`useAlarmasDeTareas`) la leen además con `refetchInterval`: fuera del CRM no hay
 *  realtime abierto que la invalide. */
export function useTareasPendientes(opciones: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: CRM_KEYS.tareasPendientes, queryFn: getTareasPendientes,
    enabled: opciones.enabled,
    refetchInterval: opciones.refetchInterval,
    // Con la pestaña de fondo también: es justo cuando la alarma tiene que sonar.
    refetchIntervalInBackground: opciones.refetchInterval != null,
  })
}

/** Las del mes calendario local en curso (Equipo › «reuniones este mes»). */
export function useReunionesDelMes() {
  const desde = startOfMonthIso()
  const { start, end } = periodBounds(desde, daysInMonth(desde))
  return useQuery({ queryKey: CRM_KEYS.reuniones(desde), queryFn: () => getReunionesEntre(start, end) })
}

/** Las reuniones que veo en [desde, hasta) (el resumen de /crm). La RLS recorta: un SUPERADMIN ve
 *  todas; quién mira cuáles lo decide la pantalla. El realtime de `crm_meetings` la invalida. */
export function useReunionesProximas(desde: string, hasta: string, enabled = true) {
  return useQuery({
    queryKey: CRM_KEYS.reunionesProximas(desde, hasta), queryFn: () => getReunionesEntre(desde, hasta), enabled,
  })
}
