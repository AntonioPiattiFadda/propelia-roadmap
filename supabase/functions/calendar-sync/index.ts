import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { planGoogleSync, mapMeetingToGoogleEvent, mapGoogleEventsToAgenda, buildGuestAttendees, mapGuestResponses, type GoogleAttendee, type RawGoogleEvent } from '../_shared/googleCalendar.ts'
import { refreshAccessToken } from '../_shared/googleTokens.ts'
import { encryptToken, decryptToken } from '../_shared/tokenCrypto.ts'
import { withoutOAuthClients } from '../_shared/auth/oauthClientGuard.ts'

/* Copiada de `propelia-frontend` (21/10/2026), donde sincroniza `visits`. Acá empuja las reuniones
   del CRM (`crm_meetings`, las demos incluidas) al Google Calendar de su responsable y lee la agenda
   de quien llama. Mismas acciones y mismo barrido: lo llaman el front (fire-and-forget al guardar)
   y el cron `calendar-sync-sweep` cada 5 minutos. Sin `withoutOAuthClients`: acá no hay MCP. */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const MAX_SYNC_ATTEMPTS = 5

// El access_token puede estar en claro (conexiones pre-Plan 3, sin '.') o cifrado.
const readStoredToken = async (stored: string | null, key: string): Promise<string | null> => {
  if (!stored) return null
  if (!stored.includes('.')) return stored
  try {
    return await decryptToken(stored, key)
  } catch {
    return null
  }
}

type Connection = {
  id: string
  user_id: string
  status: string
  refresh_token: string
  access_token: string | null
  token_expires_at: string | null
  calendar_id: string
  watch_channel_id: string | null
  watch_resource_id: string | null
  sync_token: string | null
}

// Devuelve un access token vigente, refrescando si vence en <60s.
// invalid_grant marca la conexión como revoked y devuelve null.
const getValidAccessToken = async (
  admin: SupabaseClient,
  connection: Connection,
  encryptionKey: string,
): Promise<string | null | 'transient'> => {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0
  const cached = await readStoredToken(connection.access_token, encryptionKey)
  if (cached && expiresAt - Date.now() > 60_000) return cached

  const refreshToken = await readStoredToken(connection.refresh_token, encryptionKey)
  if (!refreshToken) return null

  const result = await refreshAccessToken(
    refreshToken,
    Deno.env.get('GOOGLE_CLIENT_ID')!,
    Deno.env.get('GOOGLE_CLIENT_SECRET')!,
  )
  if ('error' in result) {
    if (result.error === 'invalid_grant') {
      await admin.from('calendar_connections').update({ status: 'revoked' }).eq('id', connection.id)
      return null
    }
    return 'transient'
  }

  await admin
    .from('calendar_connections')
    .update({
      access_token: await encryptToken(result.accessToken, encryptionKey),
      token_expires_at: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  return result.accessToken
}

const getActiveConnection = async (admin: SupabaseClient, userId: string): Promise<Connection | null> => {
  const { data } = await admin
    .from('calendar_connections')
    .select('id, user_id, status, refresh_token, access_token, token_expires_at, calendar_id, watch_channel_id, watch_resource_id, sync_token')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle()
  return (data as Connection | null) ?? null
}


const WEBHOOK_ADDRESS = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-webhook`
const WATCH_TTL_MS = 6 * 24 * 60 * 60 * 1000 // pedimos 6 días; Google capea ~7

const stopWatchChannel = async (token: string, channelId: string, resourceId: string): Promise<void> => {
  // Best-effort: si falla, el canal expira solo (<=7 días).
  await fetch(`${CALENDAR_API}/channels/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: channelId, resourceId }),
  }).catch(() => {})
}

// Registra (o re-registra) el watch de una conexión. El sync_token pertenece a la
// colección de eventos (no al canal): solo se captura si la conexión aún no tiene cursor.
const registerWatchForConnection = async (
  admin: SupabaseClient,
  connection: Connection,
  encryptionKey: string,
): Promise<boolean> => {
  const token = await getValidAccessToken(admin, connection, encryptionKey)
  if (typeof token !== 'string') return false

  if (connection.watch_channel_id && connection.watch_resource_id) {
    await stopWatchChannel(token, connection.watch_channel_id, connection.watch_resource_id)
  }

  const channelId = crypto.randomUUID()
  const watchToken = crypto.randomUUID()
  const calendarId = encodeURIComponent(connection.calendar_id)

  const watchRes = await googleFetch(token, `/calendars/${calendarId}/events/watch`, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: WEBHOOK_ADDRESS,
      token: watchToken,
      expiration: String(Date.now() + WATCH_TTL_MS),
    }),
  })
  if (!watchRes.ok) return false
  const watch = (await watchRes.json()) as { resourceId: string; expiration?: string }

  // sync_token inicial SOLO si no hay cursor previo (el cursor sobrevive a los canales).
  // OJO: nextSyncToken solo aparece en la última página de un listado SIN updatedMin/timeMin/timeMax/q.
  let syncToken: string | null = connection.sync_token
  if (!syncToken) {
    let pageToken: string | null = null
    do {
      const params: string = new URLSearchParams({
        maxResults: '250',
        showDeleted: 'true',
        singleEvents: 'true',
        ...(pageToken ? { pageToken } : {}),
      }).toString()
      const listRes = await googleFetch(token, `/calendars/${calendarId}/events?${params}`)
      if (!listRes.ok) break
      const page = (await listRes.json()) as { nextPageToken?: string; nextSyncToken?: string }
      pageToken = page.nextPageToken ?? null
      syncToken = page.nextSyncToken ?? syncToken
    } while (pageToken)
  }

  await admin
    .from('calendar_connections')
    .update({
      watch_channel_id: channelId,
      watch_resource_id: watch.resourceId,
      watch_expires_at: watch.expiration
        ? new Date(Number(watch.expiration)).toISOString()
        : new Date(Date.now() + WATCH_TTL_MS).toISOString(),
      watch_token: watchToken,
      sync_token: syncToken,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  return true
}

type MeetingRow = {
  id: string
  lead_id: string | null
  assigned_to: string
  status: 'scheduled' | 'completed' | 'cancelled'
  starts_at: string
  ends_at: string
  description: string | null
  title: string | null
  ics_sequence: number
  sync_status: string
  sync_attempts: number
  external_event_id: string | null
  color_id: string | null
  reminder_minutes: number | null
  guest_user_ids: string[]
  guest_emails: string[]
}

const MEETING_COLUMNS =
  'id, lead_id, assigned_to, status, starts_at, ends_at, description, title, ics_sequence, sync_status, sync_attempts, external_event_id, color_id, reminder_minutes, guest_user_ids, guest_emails'

// ---------- Flujo Google (nuevo) ----------

const googleFetch = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })

// `sendUpdates=all`: Google les manda a los invitados la invitación, los cambios y la
// cancelación, igual que cuando se invita a mano desde Google Calendar.
const SEND_UPDATES = 'sendUpdates=all'

/**
 * Todos los emails a invitar: los compañeros (por id → users.email) y los de afuera
 * (`guest_emails`, ya guardados como email). Un usuario dado de baja (`activo = false`) no se
 * invita; los repetidos los saca `buildGuestAttendees`.
 */
const getGuestEmails = async (admin: SupabaseClient, meeting: MeetingRow): Promise<string[]> => {
  const ids = meeting.guest_user_ids ?? []
  let teammateEmails: string[] = []
  if (ids.length > 0) {
    const { data } = await admin.from('users').select('email').in('id', ids).eq('activo', true)
    teammateEmails = (data ?? []).map((u: { email: string | null }) => u.email).filter((e): e is string => !!e)
  }
  return [...teammateEmails, ...(meeting.guest_emails ?? [])]
}

const markSyncError = async (admin: SupabaseClient, meeting: MeetingRow, message: string) => {
  await admin
    .from('crm_meetings')
    .update({
      sync_status: 'error',
      sync_error: message.slice(0, 500),
      sync_attempts: meeting.sync_attempts + 1,
    })
    .eq('id', meeting.id)
    .eq('sync_attempts', meeting.sync_attempts)
}

const processGoogleFlow = async (admin: SupabaseClient, meeting: MeetingRow, encryptionKey: string): Promise<string> => {
  if (meeting.sync_status !== 'pending' && meeting.sync_status !== 'error') return 'nothing-pending'
  if (meeting.sync_status === 'error' && meeting.sync_attempts >= MAX_SYNC_ATTEMPTS) return 'gave-up'

  const connection = await getActiveConnection(admin, meeting.assigned_to)
  const plan = planGoogleSync(meeting, connection)

  if (plan.action === 'disable') {
    await admin.from('crm_meetings').update({ sync_status: 'disabled', sync_error: null }).eq('id', meeting.id)
    return 'disabled'
  }
  if (plan.action === 'complete') {
    await admin.from('crm_meetings').update({ sync_status: 'synced', sync_error: null, sync_attempts: 0 }).eq('id', meeting.id)
    return 'synced'
  }

  const token = await getValidAccessToken(admin, connection!, encryptionKey)
  if (token === null) {
    // Conexión revocada o token ilegible: la reunión queda disabled (su dueño verá "Reconectar" en /ajustes)
    await admin.from('crm_meetings').update({ sync_status: 'disabled' }).eq('id', meeting.id)
    return 'disabled'
  }
  if (token === 'transient') {
    await markSyncError(admin, meeting, 'token refresh failed (transient)')
    return 'error'
  }

  const calendarId = encodeURIComponent(connection!.calendar_id)

  if (plan.action === 'delete') {
    const res = await googleFetch(token, `/calendars/${calendarId}/events/${encodeURIComponent(meeting.external_event_id!)}?${SEND_UPDATES}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      await markSyncError(admin, meeting, `delete ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return 'error'
    }
    await admin.from('crm_meetings').update({ sync_status: 'synced', sync_error: null, sync_attempts: 0 }).eq('id', meeting.id)
    return 'synced'
  }

  const guestEmails = await getGuestEmails(admin, meeting)
  const buildPayload = (existingAttendees?: GoogleAttendee[]) =>
    mapMeetingToGoogleEvent(meeting, buildGuestAttendees(guestEmails, existingAttendees))

  if (plan.action === 'patch') {
    const eventPath = `/calendars/${calendarId}/events/${encodeURIComponent(meeting.external_event_id!)}`
    // Se leen los attendees actuales sólo para conservar la respuesta (sí/no) de cada invitado.
    // Si la lectura falla se sigue igual: el PATCH decide (404 => re-insert, otro => error).
    let existingAttendees: GoogleAttendee[] | undefined
    if (guestEmails.length > 0) {
      const current = await googleFetch(token, `${eventPath}?fields=attendees`)
      if (current.ok) existingAttendees = ((await current.json()) as { attendees?: GoogleAttendee[] }).attendees
    }
    const res = await googleFetch(token, `${eventPath}?${SEND_UPDATES}`, {
      method: 'PATCH',
      body: JSON.stringify(buildPayload(existingAttendees)),
    })
    if (res.status === 404 || res.status === 410) {
      // El evento fue borrado en Google: se re-inserta en la próxima pasada.
      await admin
        .from('crm_meetings')
        .update({ external_event_id: null, sync_status: 'pending', sync_attempts: meeting.sync_attempts + 1 })
        .eq('id', meeting.id)
        .eq('sync_attempts', meeting.sync_attempts)
      return 'requeued'
    }
    if (!res.ok) {
      await markSyncError(admin, meeting, `patch ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return 'error'
    }
    await admin.from('crm_meetings').update({ sync_status: 'synced', sync_error: null, sync_attempts: 0 }).eq('id', meeting.id)
    return 'synced'
  }

  // insert
  const res = await googleFetch(token, `/calendars/${calendarId}/events?${SEND_UPDATES}`, {
    method: 'POST',
    body: JSON.stringify(buildPayload()),
  })
  if (!res.ok) {
    await markSyncError(admin, meeting, `insert ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return 'error'
  }
  const created = (await res.json()) as { id: string }
  await admin
    .from('crm_meetings')
    .update({
      sync_status: 'synced',
      sync_error: null,
      sync_attempts: 0,
      external_event_id: created.id,
      external_provider: 'google',
    })
    .eq('id', meeting.id)
  return 'synced'
}

// ---------- Orquestación ----------

const processMeeting = async (admin: SupabaseClient, meetingId: string, encryptionKey: string) => {
  const { data: meeting } = await admin
    .from('crm_meetings')
    .select(MEETING_COLUMNS)
    .eq('id', meetingId)
    .is('deleted_at', null)
    .single()
  if (!meeting) return null
  const google = await processGoogleFlow(admin, meeting as MeetingRow, encryptionKey)
  return { google }
}

Deno.serve(withoutOAuthClients(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      meetingId?: string
      action?: string
      from?: string
      to?: string
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY')
    if (!encryptionKey) {
      return new Response(JSON.stringify({ error: 'Sync is not configured' }), { status: 500, headers: jsonHeaders })
    }

    // --- freebusy: bloques ocupados del caller autenticado ---
    if (body.action === 'freebusy') {
      if (typeof body.from !== 'string' || typeof body.to !== 'string') {
        return new Response(JSON.stringify({ error: 'from and to are required' }), { status: 400, headers: jsonHeaders })
      }
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
      }
      const connection = await getActiveConnection(admin, userData.user.id)
      if (!connection || connection.status !== 'active') {
        return new Response(JSON.stringify({ busy: [] }), { headers: jsonHeaders })
      }
      const token = await getValidAccessToken(admin, connection, encryptionKey)
      if (typeof token !== 'string') {
        return new Response(JSON.stringify({ busy: [] }), { headers: jsonHeaders })
      }
      const res = await googleFetch(token, '/freeBusy', {
        method: 'POST',
        body: JSON.stringify({ timeMin: body.from, timeMax: body.to, items: [{ id: connection.calendar_id }] }),
      })
      if (!res.ok) {
        return new Response(JSON.stringify({ busy: [] }), { headers: jsonHeaders })
      }
      const data = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> }
      const busy = data.calendars?.[connection.calendar_id]?.busy ?? []
      return new Response(JSON.stringify({ busy }), { headers: jsonHeaders })
    }

    // --- agenda: eventos del calendario del caller autenticado en [from, to) (debug de disponibilidad) ---
    if (body.action === 'agenda') {
      if (typeof body.from !== 'string' || typeof body.to !== 'string') {
        return new Response(JSON.stringify({ error: 'from and to are required' }), { status: 400, headers: jsonHeaders })
      }
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
      }
      const connection = await getActiveConnection(admin, userData.user.id)
      if (!connection || connection.status !== 'active') {
        return new Response(JSON.stringify({ error: 'no_active_connection' }), { status: 409, headers: jsonHeaders })
      }
      const token = await getValidAccessToken(admin, connection, encryptionKey)
      if (typeof token !== 'string') {
        return new Response(JSON.stringify({ error: 'no_active_connection' }), { status: 409, headers: jsonHeaders })
      }
      const calendarId = encodeURIComponent(connection.calendar_id)
      const params = new URLSearchParams({
        timeMin: body.from,
        timeMax: body.to,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      })
      const res = await googleFetch(token, `/calendars/${calendarId}/events?${params.toString()}`)
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `google_error_${res.status}` }), { status: 502, headers: jsonHeaders })
      }
      const data = (await res.json()) as { items?: RawGoogleEvent[] }
      return new Response(JSON.stringify({ events: mapGoogleEventsToAgenda(data.items ?? []) }), { headers: jsonHeaders })
    }

    // --- colors: paleta de colorId de Google para el picker del caller autenticado ---
    if (body.action === 'colors') {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
      }
      const connection = await getActiveConnection(admin, userData.user.id)
      if (!connection || connection.status !== 'active') {
        return new Response(JSON.stringify({ colors: {} }), { headers: jsonHeaders })
      }
      const token = await getValidAccessToken(admin, connection, encryptionKey)
      if (typeof token !== 'string') {
        return new Response(JSON.stringify({ colors: {} }), { headers: jsonHeaders })
      }
      const res = await googleFetch(token, '/colors')
      if (!res.ok) {
        return new Response(JSON.stringify({ colors: {} }), { headers: jsonHeaders })
      }
      const data = (await res.json()) as { event?: Record<string, { background: string; foreground: string }> }
      return new Response(JSON.stringify({ colors: data.event ?? {} }), { headers: jsonHeaders })
    }

    // --- guest-responses: respuesta (sí/no/quizás/pendiente) de cada invitado de una reunión ---
    // La respuesta vive en Google y no se guarda en el CRM: se lee del evento cada vez que se
    // abre el form. La reunión se lee con el cliente DEL USUARIO, así que las RLS de `crm_meetings`
    // deciden si la puede ver; el token es el del responsable dueño del evento (el organizador), no el
    // del que pregunta. Cualquier falla devuelve `{}`: el form simplemente no muestra badges.
    if (body.action === 'guest-responses') {
      if (typeof body.meetingId !== 'string' || body.meetingId === '') {
        return new Response(JSON.stringify({ error: 'meetingId is required' }), { status: 400, headers: jsonHeaders })
      }
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
      }
      const empty = new Response(JSON.stringify({ responses: {} }), { headers: jsonHeaders })
      const { data: meetingRow } = await userClient
        .from('crm_meetings')
        .select('assigned_to, external_event_id')
        .eq('id', body.meetingId)
        .is('deleted_at', null)
        .maybeSingle()
      if (!meetingRow?.external_event_id) return empty
      const connection = await getActiveConnection(admin, meetingRow.assigned_to)
      if (!connection || connection.status !== 'active') return empty
      const token = await getValidAccessToken(admin, connection, encryptionKey)
      if (typeof token !== 'string') return empty
      const calendarId = encodeURIComponent(connection.calendar_id)
      const res = await googleFetch(
        token,
        `/calendars/${calendarId}/events/${encodeURIComponent(meetingRow.external_event_id)}?fields=attendees`,
      )
      if (!res.ok) return empty
      const data = (await res.json()) as { attendees?: GoogleAttendee[] }
      return new Response(JSON.stringify({ responses: mapGuestResponses(data.attendees) }), { headers: jsonHeaders })
    }

    // --- watch channels: registro/stop del caller autenticado ---
    if (body.action === 'register-watch' || body.action === 'stop-watch') {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: userData } = await userClient.auth.getUser()
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
      }
      const connection = await getActiveConnection(admin, userData.user.id)
      if (!connection) {
        return new Response(JSON.stringify({ watch: 'none' }), { headers: jsonHeaders })
      }

      if (body.action === 'stop-watch') {
        if (connection.watch_channel_id && connection.watch_resource_id) {
          const token = await getValidAccessToken(admin, connection, encryptionKey)
          if (typeof token === 'string') {
            await stopWatchChannel(token, connection.watch_channel_id, connection.watch_resource_id)
          }
          await admin
            .from('calendar_connections')
            .update({ watch_channel_id: null, watch_resource_id: null, watch_expires_at: null, watch_token: null, sync_token: null })
            .eq('id', connection.id)
          return new Response(JSON.stringify({ watch: 'stopped' }), { headers: jsonHeaders })
        }
        return new Response(JSON.stringify({ watch: 'none' }), { headers: jsonHeaders })
      }

      if (connection.status !== 'active') {
        return new Response(JSON.stringify({ watch: 'skipped' }), { headers: jsonHeaders })
      }
      const ok = await registerWatchForConnection(admin, connection, encryptionKey)
      return new Response(JSON.stringify({ watch: ok ? 'registered' : 'skipped' }), { headers: jsonHeaders })
    }

    // --- watch channels: renovación masiva (cron con anon key) ---
    if (body.action === 'renew-watches') {
      const { data: expiring } = await admin
        .from('calendar_connections')
        .select('id, user_id, status, refresh_token, access_token, token_expires_at, calendar_id, watch_channel_id, watch_resource_id, watch_expires_at, sync_token')
        .eq('provider', 'google')
        .eq('status', 'active')
        .or(`watch_expires_at.is.null,watch_expires_at.lt.${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()}`)
      let renewed = 0
      for (const conn of expiring ?? []) {
        if (await registerWatchForConnection(admin, conn as Connection, encryptionKey)) renewed++
      }
      return new Response(JSON.stringify({ renewed }), { headers: jsonHeaders })
    }

    // --- reunión puntual ---
    if (typeof body.meetingId === 'string' && body.meetingId !== '') {
      const result = await processMeeting(admin, body.meetingId, encryptionKey)
      if (!result) {
        return new Response(JSON.stringify({ error: 'meeting not found' }), { status: 404, headers: jsonHeaders })
      }
      return new Response(JSON.stringify(result), { headers: jsonHeaders })
    }

    // --- sweep (cron): pendientes de google + limpieza de nonces ---
    const { data: pending } = await admin
      .from('crm_meetings')
      .select('id')
      .is('deleted_at', null)
      .or(`sync_status.eq.pending,and(sync_status.eq.error,sync_attempts.lt.${MAX_SYNC_ATTEMPTS})`)
      .order('updated_at', { ascending: true })
      .limit(50)

    for (const row of pending ?? []) {
      await processMeeting(admin, row.id, encryptionKey)
    }

    await admin
      .from('oauth_state_nonces')
      .delete()
      .lt('used_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

    return new Response(JSON.stringify({ processed: pending?.length ?? 0 }), { headers: jsonHeaders })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: jsonHeaders })
  }
}))
