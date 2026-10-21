import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import type { GoogleAgendaItem } from '../lib/googleAgenda'

/* `calendar_connections.service` de `propelia-frontend` (21/10/2026). El backfill ofrece las
   reuniones del CRM en vez de las visitas. */

const getUserId = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('No active session')
  return id
}

// Solo columnas seguras: los grants de la tabla bloquean el resto (nunca select('*') acá).
export type CalendarConnection = Pick<
  Tables<'calendar_connections'>,
  'id' | 'provider' | 'connected_email' | 'status' | 'created_at'
>

export const getGoogleConnection = async (): Promise<CalendarConnection | null> => {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('id, provider, connected_email, status, created_at')
    .eq('provider', 'google')
    .maybeSingle()
  if (error) throw error
  return data
}

// Todas las conexiones del usuario, de cualquier proveedor (RLS: sólo las propias).
export const getCalendarConnections = async (): Promise<Pick<CalendarConnection, 'provider' | 'status'>[]> => {
  const { data, error } = await supabase.from('calendar_connections').select('provider, status')
  if (error) throw error
  return data ?? []
}

export const disconnectGoogle = async (id: string): Promise<void> => {
  const { error } = await supabase.from('calendar_connections').delete().eq('id', id)
  if (error) throw error
}

export const getGoogleAuthUrl = async (): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('calendar-oauth-start')
  if (error) throw error
  if (typeof data?.url !== 'string') throw new Error('Respuesta inválida de calendar-oauth-start')
  return data.url
}

// Agenda completa de Google Calendar (no solo lo sincronizado desde el CRM), para ver la disponibilidad real.
export const getGoogleAgenda = async (fromIso: string, toIso: string): Promise<GoogleAgendaItem[]> => {
  const { data, error } = await supabase.functions.invoke('calendar-sync', {
    body: { action: 'agenda', from: fromIso, to: toIso },
  })
  if (error) {
    let message = 'No se pudo traer la agenda de Google'
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        if (typeof body?.error === 'string') message = body.error
      } catch {
        // body no parseable — se mantiene el mensaje genérico
      }
    }
    throw new Error(message)
  }
  return data?.events ?? []
}

export const registerCalendarWatch = async (): Promise<void> => {
  await supabase.functions.invoke('calendar-sync', { body: { action: 'register-watch' } })
}

export const stopCalendarWatch = async (): Promise<void> => {
  await supabase.functions.invoke('calendar-sync', { body: { action: 'stop-watch' } })
}

const backfillFilter = (userId: string) => ({
  assigned_to: userId,
  sync_status: 'disabled',
  status: 'scheduled',
})

export const countBackfillableMeetings = async (): Promise<number> => {
  const userId = await getUserId()
  const { count, error } = await supabase
    .from('crm_meetings')
    .select('id', { count: 'exact', head: true })
    .match(backfillFilter(userId))
    .gt('starts_at', new Date().toISOString())
    .is('deleted_at', null)
  if (error) throw error
  return count ?? 0
}

export const backfillMeetings = async (): Promise<number> => {
  const userId = await getUserId()
  const { data, error } = await supabase
    .from('crm_meetings')
    .update({ sync_status: 'pending', sync_attempts: 0 })
    .match(backfillFilter(userId))
    .gt('starts_at', new Date().toISOString())
    .is('deleted_at', null)
    .select('id')
  if (error) throw error
  // Dispara el sweep en background; si falla, el cron lo levanta en <=5 min.
  supabase.functions.invoke('calendar-sync', { body: {} }).catch(() => {})
  return data?.length ?? 0
}
