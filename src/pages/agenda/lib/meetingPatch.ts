import type { TablesUpdate } from '@/types/database.types'
import type { Meeting, MeetingStatus } from './meetings.types'

/* Copiado de `visitPatch` de `propelia-frontend` (21/10/2026). */

export interface MeetingChanges {
  startsAt?: string
  endsAt?: string
  title?: string | null
  description?: string | null
  status?: MeetingStatus
  colorId?: string | null
  reminderMinutes?: number | null
  cancelReason?: string | null
  /** Compañeros de equipo invitados. Lista completa, no un diff: `[]` los quita a todos. */
  guestUserIds?: string[]
  /** Invitados de afuera del equipo, por email. Lista completa, igual que guestUserIds. */
  guestEmails?: string[]
}

// Todo cambio re-encola el sync con Google y bumpea `ics_sequence`, que es el guard optimista
// de la fila contra el webhook (el nombre viene del .ics por email del producto, ya retirado).
export const buildMeetingUpdatePatch = (
  current: Pick<Meeting, 'ics_sequence'>,
  changes: MeetingChanges,
): TablesUpdate<'crm_meetings'> => {
  const patch: TablesUpdate<'crm_meetings'> = {
    ics_sequence: current.ics_sequence + 1,
    sync_status: 'pending',
    sync_attempts: 0,
    updated_at: new Date().toISOString(),
  }
  if (changes.startsAt !== undefined) patch.starts_at = changes.startsAt
  if (changes.endsAt !== undefined) patch.ends_at = changes.endsAt
  if (changes.title !== undefined) patch.title = changes.title
  if (changes.description !== undefined) patch.description = changes.description
  if (changes.status !== undefined) patch.status = changes.status
  if (changes.colorId !== undefined) patch.color_id = changes.colorId
  if (changes.reminderMinutes !== undefined) patch.reminder_minutes = changes.reminderMinutes
  if (changes.cancelReason !== undefined) patch.cancel_reason = changes.cancelReason
  if (changes.guestUserIds !== undefined) patch.guest_user_ids = changes.guestUserIds
  if (changes.guestEmails !== undefined) patch.guest_emails = changes.guestEmails
  return patch
}
