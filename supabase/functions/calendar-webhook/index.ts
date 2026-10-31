import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { extractMeetingId, planWebhookUpdate, type IncomingEvent } from '../_shared/webhookSync.ts'
import { refreshAccessToken } from '../_shared/googleTokens.ts'
import { encryptToken, decryptToken } from '../_shared/tokenCrypto.ts'
import { withoutOAuthClients } from '../_shared/auth/oauthClientGuard.ts'

/* Copiada de `propelia-frontend` (21/10/2026), donde reconcilia `visits`. Google avisa que cambió
   el calendario de una conexión (el watch que registra `calendar-sync`); se leen los cambios con el
   `sync_token` y lo que es una reunión del CRM (marca `propelia_crm_meeting_id`) vuelve a
   `crm_meetings`: mover, renombrar o borrar el evento en Google cambia la reunión. Sin JWT
   (`verify_jwt = false`): la puerta es `x-goog-channel-token` contra `watch_token`. */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

type WebhookConnection = {
  id: string
  user_id: string
  status: string
  refresh_token: string
  access_token: string | null
  token_expires_at: string | null
  calendar_id: string
  watch_token: string | null
  sync_token: string | null
}

const readStoredToken = async (stored: string | null, key: string): Promise<string | null> => {
  if (!stored) return null
  if (!stored.includes('.')) return stored
  try {
    return await decryptToken(stored, key)
  } catch {
    return null
  }
}

const getToken = async (admin: SupabaseClient, conn: WebhookConnection, key: string): Promise<string | null> => {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  const cached = await readStoredToken(conn.access_token, key)
  if (cached && expiresAt - Date.now() > 60_000) return cached
  const refresh = await readStoredToken(conn.refresh_token, key)
  if (!refresh) return null
  const result = await refreshAccessToken(refresh, Deno.env.get('GOOGLE_CLIENT_ID')!, Deno.env.get('GOOGLE_CLIENT_SECRET')!)
  if ('error' in result) {
    if (result.error === 'invalid_grant') {
      await admin.from('calendar_connections').update({ status: 'revoked' }).eq('id', conn.id)
    }
    return null
  }
  await admin
    .from('calendar_connections')
    .update({
      access_token: await encryptToken(result.accessToken, key),
      token_expires_at: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
    })
    .eq('id', conn.id)
  return result.accessToken
}

const applyEvent = async (admin: SupabaseClient, event: IncomingEvent): Promise<void> => {
  const meetingId = extractMeetingId(event)
  if (!meetingId) return // evento ajeno: nivel 2 acotado, se ignora

  const { data: meeting } = await admin
    .from('crm_meetings')
    .select('id, starts_at, ends_at, status, ics_sequence, external_event_id, title, description')
    .eq('id', meetingId)
    .eq('external_event_id', event.id)
    .is('deleted_at', null)
    .single()
  if (!meeting) return

  const patch = planWebhookUpdate(meeting, event)
  if (!patch) return // anti-loop

  // Guard optimista: si el CRM tocó la reunión en el medio, el eco siguiente reconcilia.
  await admin.from('crm_meetings').update(patch).eq('id', meeting.id).eq('ics_sequence', meeting.ics_sequence)
}

Deno.serve(withoutOAuthClients(async (req: Request) => {
  const ok = () => new Response(null, { status: 200 })

  try {
    const channelId = req.headers.get('x-goog-channel-id')
    const channelToken = req.headers.get('x-goog-channel-token')
    const resourceState = req.headers.get('x-goog-resource-state')
    if (!channelId || !channelToken) return ok()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')
    if (!encryptionKey) return ok()

    const { data: conn } = await admin
      .from('calendar_connections')
      .select('id, user_id, status, refresh_token, access_token, token_expires_at, calendar_id, watch_token, sync_token')
      .eq('watch_channel_id', channelId)
      .maybeSingle()

    // Canal desconocido o token que no matchea: 200 sin procesar (no alimentar retries de Google).
    if (!conn || !conn.watch_token || conn.watch_token !== channelToken) return ok()
    if (resourceState === 'sync') return ok() // ping de alta del canal

    const token = await getToken(admin, conn as WebhookConnection, encryptionKey)
    if (!token) return ok()

    const calendarId = encodeURIComponent(conn.calendar_id)
    const syncToken = (conn as WebhookConnection).sync_token
    let pageToken: string | null = null
    let nextSyncToken: string | null = null
    let gone = false

    do {
      // Sin cursor previo: listado completo (sin updatedMin — anularía el nextSyncToken);
      // los eventos ya reconciliados no-opean por el anti-loop.
      const params = new URLSearchParams({
        maxResults: '250',
        showDeleted: 'true',
        singleEvents: 'true',
        ...(pageToken ? { pageToken } : syncToken ? { syncToken } : {}),
      })
      const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 410) {
        gone = true
        break
      }
      if (!res.ok) return ok()
      const page = (await res.json()) as { items?: IncomingEvent[]; nextPageToken?: string; nextSyncToken?: string }
      for (const event of page.items ?? []) {
        await applyEvent(admin, event)
      }
      pageToken = page.nextPageToken ?? null
      nextSyncToken = page.nextSyncToken ?? nextSyncToken
    } while (pageToken)

    if (gone) {
      // Resync acotado (410: cursor inválido): reconciliar solo los eventos propios conocidos del responsable
      // y re-capturar cursor con una lista mínima.
      const { data: meetings } = await admin
        .from('crm_meetings')
        .select('id, starts_at, ends_at, status, ics_sequence, external_event_id')
        .eq('assigned_to', conn.user_id)
        .eq('external_provider', 'google')
        .not('external_event_id', 'is', null)
        .is('deleted_at', null)
      for (const meeting of meetings ?? []) {
        const res = await fetch(
          `${CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(meeting.external_event_id!)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) continue
        const event = (await res.json()) as IncomingEvent
        await applyEvent(admin, event)
      }
      let cursorPage: string | null = null
      do {
        // Re-captura del cursor: listado completo sin filtros incompatibles con nextSyncToken.
        const params: string = new URLSearchParams({
          maxResults: '250',
          showDeleted: 'true',
          singleEvents: 'true',
          ...(cursorPage ? { pageToken: cursorPage } : {}),
        }).toString()
        const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) break
        const page = (await res.json()) as { nextPageToken?: string; nextSyncToken?: string }
        cursorPage = page.nextPageToken ?? null
        nextSyncToken = page.nextSyncToken ?? nextSyncToken
      } while (cursorPage)
    }

    if (nextSyncToken && nextSyncToken !== syncToken) {
      await admin.from('calendar_connections').update({ sync_token: nextSyncToken }).eq('id', conn.id)
    }

    return ok()
  } catch {
    return new Response(null, { status: 200 })
  }
}))
