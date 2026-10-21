import type { createClient } from 'jsr:@supabase/supabase-js@2'
import type { DispatchDb } from './dispatch.ts'
import type { DemoScheduledDb } from './handlers/demoScheduled.ts'
import type { LeadNotificationEvent } from './types.ts'
import { DEMO_SCHEDULED_SELECT, normalizeDemoScheduledRow } from './demoQuery.ts'

type Admin = ReturnType<typeof createClient>

/** Invitado fijo de toda demo: es del equipo aunque su gmail no sea el de `users` (ver `sameMailbox`). */
const INVITADO_DE_TODA_DEMO = 'lorenzo.piattifadda@gmail.com'

export { emailAssetsBaseUrl } from './assets.ts'

export function createSupabaseDispatchDb(admin: Admin): DispatchDb {
  return {
    async claimEvents(limit) {
      const { data, error } = await admin.rpc('claim_lead_notification_events', { p_limit: limit })
      if (error) throw error
      return (data ?? []) as LeadNotificationEvent[]
    },
    async enabledChannels(eventType) {
      const { data, error } = await admin
        .from('lead_notification_preferences')
        .select('channel')
        .eq('event_type', eventType)
        .eq('enabled', true)
      if (error) throw error
      // Las preferencias no llevan config: el Reply-To sale de quien tiene la demo.
      return ((data ?? []) as { channel: string }[]).map(({ channel }) => ({ channel, config: {} }))
    },
    async finishedChannels(eventId) {
      const { data, error } = await admin
        .from('lead_notification_deliveries')
        .select('channel')
        .eq('event_id', eventId)
        .in('status', ['sent', 'skipped'])
      if (error) throw error
      return ((data ?? []) as { channel: string }[]).map((d) => d.channel)
    },
    async upsertDelivery(delivery) {
      const { error } = await admin
        .from('lead_notification_deliveries')
        .upsert({ ...delivery, updated_at: new Date().toISOString() }, { onConflict: 'event_id,channel' })
      if (error) throw error
    },
    async updateEvent(id, patch) {
      const { error } = await admin.from('lead_notification_events').update(patch).eq('id', id)
      if (error) throw error
    },
  }
}

export function createSupabaseDemoScheduledDb(admin: Admin): DemoScheduledDb {
  return {
    async loadDemo(id) {
      const { data, error } = await admin.from('crm_meetings').select(DEMO_SCHEDULED_SELECT).eq('id', id).maybeSingle()
      if (error) throw error
      return data ? normalizeDemoScheduledRow(data) : null
    },
    async teamEmails() {
      const { data, error } = await admin.from('users').select('email')
      if (error) throw error
      return [...((data ?? []) as { email: string }[]).map((u) => u.email), INVITADO_DE_TODA_DEMO]
    },
  }
}
