import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import type { LeadNotificationChannel, LeadNotificationEventType } from '../lib/leadNotifications'

/* `leadNotificationPreferences.service` de `propelia-frontend` (21/10/2026). Sin organización: las
   preferencias son del equipo, una fila por (evento, vía). */

export type LeadNotificationPreferenceRow = Tables<'lead_notification_preferences'>

export type LeadNotificationPreferenceChange = {
  eventType: LeadNotificationEventType
  channel: LeadNotificationChannel
  enabled: boolean
}

/** Preferencias del equipo (RLS: cualquiera las lee). Sin fila = apagado. */
export async function listLeadNotificationPreferences(): Promise<LeadNotificationPreferenceRow[]> {
  const { data, error } = await supabase.from('lead_notification_preferences').select('*')
  if (error) throw error
  return data ?? []
}

/** Guarda varios cambios de una para todo el equipo. Sólo un SUPERADMIN puede escribir (RLS). */
export async function saveLeadNotificationPreferences(
  changes: LeadNotificationPreferenceChange[],
  updatedBy: string,
): Promise<void> {
  if (changes.length === 0) return
  const now = new Date().toISOString()
  const { error } = await supabase.from('lead_notification_preferences').upsert(
    changes.map((c) => ({
      event_type: c.eventType,
      channel: c.channel,
      enabled: c.enabled,
      updated_by: updatedBy,
      updated_at: now,
    })),
    { onConflict: 'event_type,channel' },
  )
  if (error) throw error
}
