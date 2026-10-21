// Reconciliación de eventos entrantes de Google con la reunión local. Puro: sin Deno.*.
// Nivel 2 acotado: solo eventos marcados con MEETING_ID_PROPERTY; anti-loop por comparación de
// estado. Copiado de `propelia-frontend` (21/10/2026), donde reconcilia `visits`.

import { DEFAULT_MEETING_TITLE, MEETING_ID_PROPERTY, stripLeadLink } from './googleCalendar.ts'

export interface IncomingEvent {
  id: string
  status: string
  summary?: string
  description?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  extendedProperties?: { private?: Record<string, string> }
}

export interface LocalMeeting {
  id: string
  starts_at: string
  ends_at: string
  status: string
  ics_sequence: number
  title: string | null
  description: string | null
}

export const extractMeetingId = (event: IncomingEvent): string | null =>
  event.extendedProperties?.private?.[MEETING_ID_PROPERTY] ?? null

const sameInstant = (a: string, b: string): boolean => new Date(a).getTime() === new Date(b).getTime()

export const planWebhookUpdate = (
  local: LocalMeeting,
  incoming: IncomingEvent,
): Record<string, unknown> | null => {
  const cancelled = incoming.status === 'cancelled'

  const patch: Record<string, unknown> = {}

  if (cancelled) {
    if (local.status !== 'cancelled') patch.status = 'cancelled'
  } else {
    const startIso = incoming.start?.dateTime
    const endIso = incoming.end?.dateTime
    if (!startIso || !endIso) return null // all-day u otro formato no soportado
    if (!sameInstant(local.starts_at, startIso)) patch.starts_at = new Date(startIso).toISOString()
    if (!sameInstant(local.ends_at, endIso)) patch.ends_at = new Date(endIso).toISOString()
  }

  // mapMeetingToGoogleEvent empuja el título por defecto cuando local.title es null: comparar
  // contra ese mismo default evita que el eco de un título nunca elegido dispare un patch cada vez.
  if (typeof incoming.summary === 'string' && incoming.summary !== (local.title ?? DEFAULT_MEETING_TITLE)) {
    patch.title = incoming.summary
  }
  // El link al lead lo agrega mapMeetingToGoogleEvent y no vive en `crm_meetings`:
  // se saca antes de comparar, si no cada evento que sale vuelve como una edición ajena.
  if (typeof incoming.description === 'string') {
    const withoutLeadLink = stripLeadLink(incoming.description)
    const nextDescription = withoutLeadLink === '' ? null : withoutLeadLink
    if (nextDescription !== local.description) patch.description = nextDescription
  }

  if (Object.keys(patch).length === 0) return null // eco: anti-loop

  patch.ics_sequence = local.ics_sequence + 1
  patch.sync_status = 'synced' // vino de Google: no hay nada que empujar de vuelta
  patch.updated_at = new Date().toISOString()
  return patch
}
