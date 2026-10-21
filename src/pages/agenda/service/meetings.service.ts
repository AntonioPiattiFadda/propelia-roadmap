import { supabase } from '@/lib/supabase'
import { buildMeetingUpdatePatch, type MeetingChanges } from '../lib/meetingPatch'
import type { Meeting, MeetingStatus } from '../lib/meetings.types'

/* `visits.service` de `propelia-frontend` (21/10/2026), sobre `crm_meetings`. Sin organización,
   sin propiedad y sin las notas de actividad del producto: la RLS de `crm_meetings` decide qué
   reunión puede ver y tocar cada uno (`crm_puede_lead` / `crm_puede`). */

const getUserId = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('No active session')
  return id
}

export interface CreateMeetingPayload {
  startsAt: string
  endsAt: string
  leadId?: string | null
  /** De quién es la reunión (en qué Google va). Por defecto, de quien la agenda. */
  assignedTo?: string
  title?: string | null
  description?: string | null
  colorId?: string | null
  reminderMinutes?: number | null
  guestUserIds?: string[]
  guestEmails?: string[]
}

// Reuniones que se solapan con [fromIso, toIso) — para la página /agenda.
// `assignedTo` acepta varios porque la agenda también se mira de a equipo: sin argumento es la
// de quien está logueado, que es el caso de siempre.
export const getMeetingsInRange = async (
  fromIso: string,
  toIso: string,
  assignedTo?: string[],
): Promise<Meeting[]> => {
  const ids = assignedTo ?? [await getUserId()]
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('crm_meetings')
    .select('*')
    .in('assigned_to', ids)
    .is('deleted_at', null)
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Las últimas reuniones propias, para la tarjeta de prueba de Ajustes. */
export const getMyMeetings = async (): Promise<Meeting[]> => {
  const { data, error } = await supabase
    .from('crm_meetings')
    .select('*')
    .eq('assigned_to', await getUserId())
    .is('deleted_at', null)
    .order('starts_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export const createMeeting = async (payload: CreateMeetingPayload): Promise<Meeting> => {
  const userId = await getUserId()
  const { data, error } = await supabase
    .from('crm_meetings')
    .insert({
      lead_id: payload.leadId ?? null,
      assigned_to: payload.assignedTo ?? userId,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      title: payload.title ?? null,
      description: payload.description ?? null,
      color_id: payload.colorId ?? null,
      reminder_minutes: payload.reminderMinutes ?? null,
      guest_user_ids: payload.guestUserIds ?? [],
      guest_emails: payload.guestEmails ?? [],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateMeeting = async (
  id: string,
  current: Pick<Meeting, 'ics_sequence'>,
  changes: MeetingChanges,
): Promise<Meeting> => {
  const { data, error } = await supabase
    .from('crm_meetings')
    .update(buildMeetingUpdatePatch(current, changes))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export interface LeadClientGuest {
  email: string
  name: string | null
}

/** Email de la inmobiliaria del lead, para ofrecerlo primero en "Agregar invitados". null si no tiene. */
export const getLeadClientGuest = async (leadId: string): Promise<LeadClientGuest | null> => {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('client:crm_clients(email, company_name, first_name, last_name)')
    .eq('id', leadId)
    .maybeSingle()
  if (error) throw error
  const client = data?.client
  if (!client?.email) return null
  const name = client.company_name?.trim() || [client.first_name, client.last_name].filter(Boolean).join(' ').trim()
  return { email: client.email, name: name || null }
}

export const cancelMeeting = async (
  id: string,
  current: Pick<Meeting, 'ics_sequence'>,
  reason?: string | null,
): Promise<Meeting> =>
  updateMeeting(id, current, { status: 'cancelled', cancelReason: reason ?? null })

/**
 * Marca como hecha una reunión. Igual que `markVisitOutcome` del producto, NO pasa por
 * `buildMeetingUpdatePatch`: ese pone `sync_status` en 'pending' y el barrido de cada 5 minutos
 * volvería a empujar el evento a Google por nada. Un update angosto deja el sync como estaba.
 */
export const markMeetingOutcome = async (
  id: string,
  status: Extract<MeetingStatus, 'completed'>,
): Promise<void> => {
  const { error } = await supabase.from('crm_meetings').update({ status }).eq('id', id)
  if (error) throw error
}

// Fire-and-forget: el llamador NO debe await-ear esto en el camino crítico.
export const requestMeetingSync = async (meetingId: string): Promise<void> => {
  await supabase.functions.invoke('calendar-sync', { body: { meetingId } })
}

export type MeetingSyncResult = { google: string }

export const retryMeetingSync = async (meetingId: string): Promise<MeetingSyncResult> => {
  const { error } = await supabase
    .from('crm_meetings')
    .update({ sync_status: 'pending', sync_attempts: 0, sync_error: null })
    .eq('id', meetingId)
  if (error) throw error
  const { data, error: invokeError } = await supabase.functions.invoke('calendar-sync', { body: { meetingId } })
  if (invokeError) throw invokeError
  return data as MeetingSyncResult
}

export type GuestResponse = 'accepted' | 'declined' | 'tentative' | 'needsAction'

/** Respuesta de cada invitado según Google, por email en minúscula. `{}` si no hay evento o falla. */
export const getMeetingGuestResponses = async (meetingId: string): Promise<Record<string, GuestResponse>> => {
  const { data, error } = await supabase.functions.invoke('calendar-sync', {
    body: { action: 'guest-responses', meetingId },
  })
  if (error) throw error
  return data?.responses ?? {}
}

export const getFreeBusy = async (fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> => {
  const { data, error } = await supabase.functions.invoke('calendar-sync', {
    body: { action: 'freebusy', from: fromIso, to: toIso },
  })
  if (error) throw error
  return data?.busy ?? []
}

/** El color de la última reunión agendada, para preseleccionarlo en la próxima (RPC: el front no escribe `users`). */
export const saveLastMeetingColor = async (colorId: string): Promise<void> => {
  const { error } = await supabase.rpc('crm_set_last_meeting_color', { p_color_id: colorId })
  if (error) throw error
}
