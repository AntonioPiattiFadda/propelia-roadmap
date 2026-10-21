import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  cancelMeeting,
  createMeeting,
  getFreeBusy,
  getMeetingsInRange,
  getMyMeetings,
  requestMeetingSync,
  retryMeetingSync,
  saveLastMeetingColor,
  updateMeeting,
  type CreateMeetingPayload,
} from '../service/meetings.service'
import type { MeetingChanges } from '../lib/meetingPatch'
import type { Meeting } from '../lib/meetings.types'

/* `useVisits` de `propelia-frontend` (21/10/2026), sobre `crm_meetings`. Sin el paso de etapa ni
   la postergación de la gestión del producto: acá agendar no mueve el funnel solo. */

/** Las reuniones viven en la agenda y en el CRM (la lista del perfil, Demos): se invalidan todas. */
export const invalidarReuniones = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['meetings'] })
  queryClient.invalidateQueries({ queryKey: ['meetings-range'] })
  queryClient.invalidateQueries({ queryKey: ['crm', 'lead'] })
  queryClient.invalidateQueries({ queryKey: ['crm', 'reuniones'] })
}

// El sync corre en background: la reunión ya está guardada; si falla, el barrido de cada
// 5 minutos lo reintenta (sync_status queda pending/error).
export const fireSync = (meeting: Pick<Meeting, 'id'>) => {
  requestMeetingSync(meeting.id).catch(() => {})
}

export const useMyMeetings = () =>
  useQuery({
    queryKey: ['meetings', 'mine'],
    queryFn: getMyMeetings,
  })

// `assignedTo` entra en la key: sin eso, mirar la agenda de un compañero y volver
// a la propia devolvería la del otro desde la cache, con el mismo rango de fechas.
export const useMeetingsInRange = (fromIso: string, toIso: string, assignedTo?: string[]) =>
  useQuery({
    queryKey: ['meetings-range', fromIso, toIso, assignedTo ?? null],
    queryFn: () => getMeetingsInRange(fromIso, toIso, assignedTo),
  })

export const useCreateMeeting = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateMeetingPayload) => createMeeting(payload),
    onSuccess: async (meeting, payload) => {
      invalidarReuniones(queryClient)
      fireSync(meeting)
      toast.success('Reunión agendada')
      if (payload.colorId) {
        await saveLastMeetingColor(payload.colorId).catch(() => {})
        queryClient.invalidateQueries({ queryKey: ['yo'] })
      }
    },
    onError: () => toast.error('No se pudo agendar la reunión'),
  })
}

export const useUpdateMeeting = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, current, changes }: { id: string; current: Pick<Meeting, 'ics_sequence'>; changes: MeetingChanges }) =>
      updateMeeting(id, current, changes),
    onSuccess: (meeting) => {
      invalidarReuniones(queryClient)
      fireSync(meeting)
      toast.success('Reunión actualizada')
    },
    onError: () => toast.error('No se pudo actualizar la reunión'),
  })
}

// El invoke resuelve OK aunque el sync a Google haya fallado (el edge function
// devuelve 200 con el resultado real adentro) — hay que leer `google` para saber
// qué pasó de verdad, no alcanza con que la promesa no haya rechazado.
const SYNC_RESULT_TOAST: Record<string, { kind: 'success' | 'error' | 'info'; message: string }> = {
  synced: { kind: 'success', message: 'Sincronizada con Google Calendar' },
  'nothing-pending': { kind: 'success', message: 'Ya estaba sincronizada' },
  error: { kind: 'error', message: 'No se pudo sincronizar con Google Calendar' },
  'gave-up': { kind: 'error', message: 'Se agotaron los reintentos de sincronización' },
  disabled: { kind: 'error', message: 'No hay conexión activa con Google Calendar' },
  requeued: { kind: 'info', message: 'El evento se recreará en la próxima sincronización' },
}

export const useRetryMeetingSync = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (meetingId: string) => retryMeetingSync(meetingId),
    onSuccess: (result) => {
      invalidarReuniones(queryClient)
      const info = SYNC_RESULT_TOAST[result.google] ?? { kind: 'info' as const, message: 'Sincronización procesada' }
      if (info.kind === 'success') toast.success(info.message)
      else if (info.kind === 'error') toast.error(info.message)
      else toast.info(info.message)
    },
    onError: () => toast.error('No se pudo reintentar'),
  })
}

export const useFreeBusy = (dateYmd: string, enabled: boolean) =>
  useQuery({
    queryKey: ['freebusy', dateYmd],
    queryFn: () => {
      const from = new Date(`${dateYmd}T00:00:00`)
      const to = new Date(`${dateYmd}T23:59:59`)
      return getFreeBusy(from.toISOString(), to.toISOString())
    },
    enabled: enabled && dateYmd !== '',
    staleTime: 60_000,
  })

export const useCancelMeeting = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, current, reason }: { id: string; current: Pick<Meeting, 'ics_sequence'>; reason?: string | null }) =>
      cancelMeeting(id, current, reason),
    onSuccess: (meeting) => {
      invalidarReuniones(queryClient)
      fireSync(meeting)
      toast.success('Reunión cancelada')
    },
    onError: () => toast.error('No se pudo cancelar la reunión'),
  })
}
