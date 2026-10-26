// Decisión y mapeo del sync CRM -> Google. Puro: sin Deno.*, sin fetch.
//
// Copiado de `propelia-frontend` (21/10/2026), donde sincroniza `visits`. Acá lo que va a Google
// es una reunión del CRM (`crm_meetings`, las demos incluidas). Lo único que cambia además del
// nombre es la marca del evento: `propelia_crm_meeting_id` y no `propelia_visit_id`. Si alguien
// conecta la misma cuenta de Google en los dos sistemas, cada webhook reconoce solo los suyos.

export interface SyncMeeting {
  id: string
  lead_id: string | null
  status: string
  starts_at: string
  ends_at: string
  description: string | null
  title: string | null
  sync_status: string
  sync_attempts: number
  external_event_id: string | null
  color_id: string | null
  reminder_minutes: number | null
}

export interface SyncConnection {
  status: string
}

/** Clave de `extendedProperties.private` con la que se marca un evento nacido en el CRM. */
export const MEETING_ID_PROPERTY = 'propelia_crm_meeting_id'

/** Título del evento cuando la reunión no tiene uno. El webhook compara contra el mismo. */
export const DEFAULT_MEETING_TITLE = 'Reunión'

export interface GoogleEventPayload {
  summary: string
  description?: string
  colorId?: string
  start: { dateTime: string }
  end: { dateTime: string }
  extendedProperties: { private: Record<string, string> }
  reminders?: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] }
  attendees?: GoogleAttendee[]
  guestsCanSeeOtherGuests?: boolean
}

export interface GoogleAttendee {
  email: string
  responseStatus?: string
  organizer?: boolean
}

/**
 * Lista de `attendees` para el PATCH/POST a partir de los invitados de la reunión.
 *
 * El CRM es el dueño de la lista: un invitado que se agregó a mano en Google y no está en
 * `emails` se va. Lo único que se toma de lo que Google ya tenía es la RESPUESTA de cada uno
 * (accepted/declined/...) y la entrada del organizador — mandar la lista sólo con emails
 * podría volver a "sin respuesta" a quien ya había aceptado.
 */
export const buildGuestAttendees = (
  emails: string[],
  existing: GoogleAttendee[] | undefined,
): GoogleAttendee[] => {
  const key = (email: string) => email.trim().toLowerCase()
  const previous = new Map((existing ?? []).map(a => [key(a.email), a]))
  const organizers = (existing ?? []).filter(a => a.organizer)
  const seen = new Set(organizers.map(a => key(a.email)))
  const guests: GoogleAttendee[] = []
  for (const email of emails) {
    const k = key(email)
    if (seen.has(k)) continue
    seen.add(k)
    const responseStatus = previous.get(k)?.responseStatus
    guests.push(responseStatus ? { email, responseStatus } : { email })
  }
  return [...organizers, ...guests]
}

/**
 * Rótulo del link al lead que llevaban al pie los primeros eventos (21/10/2026). Se sacó el mismo
 * día, por pedido: la descripción del evento la ven todos los invitados, y a la inmobiliaria le
 * llegaba un link a nuestro CRM. En el producto sí va (ahí es la «Ficha del cliente» del agente).
 * Queda solo para limpiar esos eventos en el camino de vuelta (`stripLeadLink`).
 */
export const LEAD_LINK_LABEL = 'Ficha del lead:'

/**
 * Saca el link al lead de un evento creado cuando todavía se agregaba (camino de vuelta: webhook de
 * Google -> reunión). Sin esto, esa descripción volvería como si alguien la hubiera editado a mano
 * en Google y se guardaría en `crm_meetings.description` con el link pegado. Sólo si está al final,
 * que es donde iba.
 */
export const stripLeadLink = (description: string): string =>
  description.replace(new RegExp(`\\n*${LEAD_LINK_LABEL} \\S+\\s*$`), '')

export type GuestResponse = 'accepted' | 'declined' | 'tentative' | 'needsAction'
const GUEST_RESPONSES: ReadonlySet<string> = new Set(['accepted', 'declined', 'tentative', 'needsAction'])

/**
 * Respuesta de cada invitado, por email en minúscula, para mostrarla en el form de la reunión.
 * La respuesta vive en Google y no se guarda en el CRM: se lee del evento cada vez.
 * El organizador (el dueño de la reunión) no es un invitado y queda afuera.
 */
export const mapGuestResponses = (
  attendees: GoogleAttendee[] | undefined,
): Record<string, GuestResponse> => {
  const out: Record<string, GuestResponse> = {}
  for (const a of attendees ?? []) {
    if (a.organizer) continue
    const status = a.responseStatus && GUEST_RESPONSES.has(a.responseStatus) ? a.responseStatus : 'needsAction'
    out[a.email.trim().toLowerCase()] = status as GuestResponse
  }
  return out
}

export const mapMeetingToGoogleEvent = (
  meeting: Pick<SyncMeeting, 'id' | 'starts_at' | 'ends_at' | 'description' | 'title' | 'color_id' | 'reminder_minutes'>,
  /** Omitido = no se manda la clave (Google deja los invitados como están); `[]` los quita. */
  attendees?: GoogleAttendee[],
): GoogleEventPayload => {
  // La descripción va tal cual: sin el link al lead (ver LEAD_LINK_LABEL), que la ven los invitados.
  const description = meeting.description
  return {
    summary: meeting.title ?? DEFAULT_MEETING_TITLE,
    ...(description ? { description } : {}),
    ...(meeting.color_id ? { colorId: meeting.color_id } : {}),
    ...(meeting.reminder_minutes != null
      ? { reminders: { useDefault: false as const, overrides: [{ method: 'popup' as const, minutes: meeting.reminder_minutes }] } }
      : {}),
    start: { dateTime: meeting.starts_at },
    end: { dateTime: meeting.ends_at },
    extendedProperties: { private: { [MEETING_ID_PROPERTY]: meeting.id } },
    // La inmobiliaria y los compañeros van en la misma lista: ninguno ve los emails del resto.
    ...(attendees !== undefined ? { attendees, guestsCanSeeOtherGuests: false } : {}),
  }
}

export type GoogleSyncAction = 'disable' | 'insert' | 'patch' | 'delete' | 'complete'

export const planGoogleSync = (
  meeting: SyncMeeting,
  connection: SyncConnection | null,
): { action: GoogleSyncAction } => {
  if (!connection || connection.status !== 'active') return { action: 'disable' }
  if (meeting.status === 'cancelled') {
    return meeting.external_event_id ? { action: 'delete' } : { action: 'complete' }
  }
  return meeting.external_event_id ? { action: 'patch' } : { action: 'insert' }
}

export interface RawGoogleEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: (GoogleAttendee & { self?: boolean })[]
}

export interface GoogleAgendaItem {
  id: string
  summary: string
  start: string
  end: string
  isAllDay: boolean
  /** Me invitaron y todavía no contesté (26/10/2026): el Dashboard lo dice. Solo va cuando es true. */
  sinAceptar?: true
}

// Mi lugar entre los invitados (`self`), si no soy quien organiza, todavía sin contestar.
const sinAceptar = (event: RawGoogleEvent): boolean =>
  event.attendees?.some(a => a.self && !a.organizer && a.responseStatus === 'needsAction') ?? false

// Mapea la respuesta de events.list al shape mínimo que necesita la agenda.
// Descarta instancias sin start/end utilizable (no debería pasar con eventos reales de Google).
export const mapGoogleEventsToAgenda = (events: RawGoogleEvent[]): GoogleAgendaItem[] =>
  events.reduce<GoogleAgendaItem[]>((acc, event) => {
    const isAllDay = event.start?.date != null
    const start = isAllDay ? event.start?.date : event.start?.dateTime
    const end = isAllDay ? event.end?.date : event.end?.dateTime
    if (!start || !end) return acc
    acc.push({ id: event.id, summary: event.summary ?? '(Sin título)', start, end, isAllDay, ...(sinAceptar(event) ? { sinAceptar: true as const } : {}) })
    return acc
  }, [])
