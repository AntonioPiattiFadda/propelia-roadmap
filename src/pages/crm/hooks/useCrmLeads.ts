import { useQuery } from '@tanstack/react-query'
import { daysInMonth, periodBounds, startOfMonthIso } from '@/lib/calendarDate'
import { getLeads, getReunionesEntre, getTareasPendientes } from '../service/crm.service'
import { CRM_KEYS } from './keys'

/* La lista entera, una vez (decisión 4 de la spec): son decenas de leads, la RLS ya recortó, y
   filtros y contadores salen de funciones puras sobre este array. */
export function useCrmLeads() {
  return useQuery({ queryKey: CRM_KEYS.leads, queryFn: getLeads })
}

/** Las pendientes de todas las carteras que veo: marcan «tareas vencidas» en la lista y en Equipo. */
export function useTareasPendientes() {
  return useQuery({ queryKey: CRM_KEYS.tareasPendientes, queryFn: getTareasPendientes })
}

/** Las del mes calendario local en curso (Equipo › «reuniones este mes»). */
export function useReunionesDelMes() {
  const desde = startOfMonthIso()
  const { start, end } = periodBounds(desde, daysInMonth(desde))
  return useQuery({ queryKey: CRM_KEYS.reuniones(desde), queryFn: () => getReunionesEntre(start, end) })
}
