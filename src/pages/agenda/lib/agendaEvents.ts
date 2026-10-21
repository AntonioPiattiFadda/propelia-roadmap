// Merge de reuniones del CRM + eventos de Google (agenda real) en un shape común para el grid
// semanal. Puro: sin fetch. Las reuniones ya están sincronizadas a Google vía calendar-sync, así
// que el mismo evento no debe contarse dos veces. Copiado de `propelia-frontend`, donde mezcla visitas.

import type { GoogleAgendaItem } from './googleAgenda'
import type { Meeting, MeetingStatus } from './meetings.types'

export interface AgendaEvent {
  id: string
  title: string
  startIso: string
  endIso: string
  isAllDay: boolean
  source: 'meeting' | 'google'
  colorId: string | null
  status?: MeetingStatus
}

type MeetingForAgenda = Pick<Meeting, 'id' | 'title' | 'starts_at' | 'ends_at' | 'color_id' | 'external_event_id'> & {
  status: MeetingStatus
}

export const buildAgendaEvents = (meetings: MeetingForAgenda[], googleEvents: GoogleAgendaItem[]): AgendaEvent[] => {
  // Los ids de Google salen de TODAS las reuniones, canceladas incluidas: hasta que
  // calendar-sync borra el evento de Google, éste seguiría apareciendo como evento suelto.
  const meetingExternalIds = new Set(meetings.map(m => m.external_event_id).filter((id): id is string => id != null))

  // Las canceladas no van a la agenda (las eliminadas ya no llegan: getMeetingsInRange filtra deleted_at).
  const meetingEvents: AgendaEvent[] = meetings.filter(m => m.status !== 'cancelled').map(m => ({
    id: m.id,
    title: m.title ?? 'Reunión',
    startIso: m.starts_at,
    endIso: m.ends_at,
    isAllDay: false,
    source: 'meeting',
    colorId: m.color_id,
    status: m.status,
  }))

  // Evita duplicar en el grid un evento que ya se muestra como reunión del CRM.
  const googleOnlyEvents: AgendaEvent[] = googleEvents
    .filter(event => !meetingExternalIds.has(event.id))
    .map(event => ({
      id: event.id,
      title: event.summary,
      startIso: event.start,
      endIso: event.end,
      isAllDay: event.isAllDay,
      source: 'google' as const,
      colorId: null,
    }))

  return [...meetingEvents, ...googleOnlyEvents]
}

export const groupEventsByDay = (events: AgendaEvent[], days: string[]): Record<string, AgendaEvent[]> => {
  const grouped: Record<string, AgendaEvent[]> = Object.fromEntries(days.map(day => [day, []]))
  for (const event of events) {
    const dayKey = event.isAllDay ? event.startIso : event.startIso.slice(0, 10)
    if (dayKey in grouped) grouped[dayKey].push(event)
  }
  return grouped
}
