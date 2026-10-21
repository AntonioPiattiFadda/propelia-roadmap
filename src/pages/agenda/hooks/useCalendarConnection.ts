import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { hasActiveCalendar } from '../lib/calendarConnections'
import {
  backfillMeetings,
  countBackfillableMeetings,
  disconnectGoogle,
  getCalendarConnections,
  getGoogleAgenda,
  getGoogleAuthUrl,
  getGoogleConnection,
  stopCalendarWatch,
} from '../service/calendar.service'
import { invalidarReuniones } from './useMeetings'

/* `useCalendarConnection` de `propelia-frontend` (21/10/2026). */

export const useGoogleConnection = () =>
  useQuery({
    queryKey: ['calendar-connection', 'google'],
    queryFn: getGoogleConnection,
  })

/** Si el usuario tiene algún calendario conectado, de cualquier proveedor. */
export const useHasCalendarConnected = () =>
  useQuery({
    queryKey: ['calendar-connection', 'any'],
    queryFn: getCalendarConnections,
    select: hasActiveCalendar,
  })

export const useConnectGoogle = () =>
  useMutation({
    mutationFn: getGoogleAuthUrl,
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: () => toast.error('No se pudo iniciar la conexión con Google'),
  })

export const useBackfillableCount = (enabled: boolean) =>
  useQuery({
    queryKey: ['calendar-backfill-count'],
    queryFn: countBackfillableMeetings,
    enabled,
  })

export const useBackfillMeetings = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: backfillMeetings,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-backfill-count'] })
      invalidarReuniones(queryClient)
      toast.success(`${count} reunión${count === 1 ? '' : 'es'} encolada${count === 1 ? '' : 's'} para sincronizar`)
    },
    onError: () => toast.error('No se pudo iniciar la sincronización'),
  })
}

export const useGoogleAgenda = (fromIso: string, toIso: string, enabled: boolean) =>
  useQuery({
    queryKey: ['google-agenda', fromIso, toIso],
    queryFn: () => getGoogleAgenda(fromIso, toIso),
    enabled,
    staleTime: 60_000,
  })

export const useDisconnectGoogle = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Best-effort: detener el watch antes de perder los tokens; si falla, expira solo (<=7 días).
      await stopCalendarWatch().catch(() => {})
      await disconnectGoogle(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-connection'] })
      queryClient.invalidateQueries({ queryKey: ['google-agenda'] })
      toast.success('Google Calendar desconectado')
    },
    onError: () => toast.error('No se pudo desconectar'),
  })
}
