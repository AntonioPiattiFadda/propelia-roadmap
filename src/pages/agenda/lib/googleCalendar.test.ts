import { describe, it, expect } from 'vitest'
import { mapMeetingToGoogleEvent, planGoogleSync, mapGoogleEventsToAgenda, stripLeadLink, buildGuestAttendees, mapGuestResponses } from '../../../../supabase/functions/_shared/googleCalendar'

const meeting = {
  id: 'abc123',
  lead_id: null as string | null,
  status: 'scheduled',
  starts_at: '2026-08-01T15:00:00+00:00',
  ends_at: '2026-08-01T16:00:00+00:00',
  description: 'llevar llaves',
  title: null as string | null,
  sync_status: 'pending',
  sync_attempts: 0,
  external_event_id: null as string | null,
  color_id: null as string | null,
  reminder_minutes: null as number | null,
}

describe('mapMeetingToGoogleEvent', () => {
  it('mapea la reunión al payload del evento con extended property', () => {
    const event = mapMeetingToGoogleEvent(meeting)
    expect(event.summary).toBe('Reunión')
    expect(event.description).toBe('llevar llaves')
    expect(event.start).toEqual({ dateTime: '2026-08-01T15:00:00+00:00' })
    expect(event.end).toEqual({ dateTime: '2026-08-01T16:00:00+00:00' })
    expect(event.extendedProperties).toEqual({ private: { propelia_crm_meeting_id: 'abc123' } })
  })

  it('sin descripción omite description', () => {
    const event = mapMeetingToGoogleEvent({ ...meeting, description: null })
    expect(event.description).toBeUndefined()
  })

  it('con title usa ese texto como summary', () => {
    const event = mapMeetingToGoogleEvent({ ...meeting, title: 'Visita — Av. Corrientes 1234 (Juan)' })
    expect(event.summary).toBe('Visita — Av. Corrientes 1234 (Juan)')
  })


  it('con color_id incluye colorId en el payload', () => {
    const event = mapMeetingToGoogleEvent({ ...meeting, color_id: '5' })
    expect(event.colorId).toBe('5')
  })

  it('con reminder_minutes arma reminders.overrides con popup', () => {
    const event = mapMeetingToGoogleEvent({ ...meeting, reminder_minutes: 30 })
    expect(event.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] })
  })

  it('sin reminder_minutes no manda reminders', () => {
    const event = mapMeetingToGoogleEvent(meeting)
    expect(event.reminders).toBeUndefined()
  })

  it('con reminder_minutes=0 sí manda reminders', () => {
    const event = mapMeetingToGoogleEvent({ ...meeting, reminder_minutes: 0 })
    expect(event.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] })
  })

  it('sin color_id omite el campo', () => {
    const event = mapMeetingToGoogleEvent({ ...meeting, color_id: null })
    expect(event.colorId).toBeUndefined()
  })

  it('la descripción va tal cual, sin link al lead aunque la reunión sea de uno (la ven los invitados)', () => {
    const deUnLead = { ...meeting, lead_id: 'lead-1' }
    const event = mapMeetingToGoogleEvent(deUnLead)
    expect(event.description).toBe('llevar llaves')
    expect(event.description).not.toContain('crm?lead=')
  })
})

describe('mapMeetingToGoogleEvent — invitados', () => {
  it('sin attendees no manda la clave (no pisa invitados de eventos viejos)', () => {
    const event = mapMeetingToGoogleEvent(meeting)
    expect('attendees' in event).toBe(false)
  })

  it('con attendees los manda tal cual', () => {
    const event = mapMeetingToGoogleEvent(meeting, [{ email: 'ana@org.es' }])
    expect(event.attendees).toEqual([{ email: 'ana@org.es' }])
  })

  it('los invitados no ven los emails de los demás (el cliente no ve a los compañeros)', () => {
    const event = mapMeetingToGoogleEvent(meeting, [{ email: 'cliente@gmail.com' }])
    expect(event.guestsCanSeeOtherGuests).toBe(false)
  })

  it('una lista vacía se manda: quitar a todos los invitados tiene que llegar a Google', () => {
    const event = mapMeetingToGoogleEvent(meeting, [])
    expect(event.attendees).toEqual([])
  })
})

describe('buildGuestAttendees', () => {
  it('arma un attendee por email, sin responseStatus si Google todavía no lo tenía', () => {
    expect(buildGuestAttendees(['ana@org.es', 'jordi@org.es'], undefined)).toEqual([
      { email: 'ana@org.es' },
      { email: 'jordi@org.es' },
    ])
  })

  it('conserva la respuesta que ya tenía Google para ese email (sin importar mayúsculas)', () => {
    const existing = [{ email: 'Ana@Org.es', responseStatus: 'accepted' }]
    expect(buildGuestAttendees(['ana@org.es'], existing)).toEqual([
      { email: 'ana@org.es', responseStatus: 'accepted' },
    ])
  })

  it('deja afuera a los que ya no están en la lista de Propelia', () => {
    const existing = [{ email: 'jordi@org.es', responseStatus: 'declined' }]
    expect(buildGuestAttendees(['ana@org.es'], existing)).toEqual([{ email: 'ana@org.es' }])
  })

  it('conserva al organizador que Google agrega a la lista', () => {
    const existing = [{ email: 'agente@org.es', organizer: true, responseStatus: 'accepted' }]
    expect(buildGuestAttendees(['ana@org.es'], existing)).toEqual([
      { email: 'agente@org.es', organizer: true, responseStatus: 'accepted' },
      { email: 'ana@org.es' },
    ])
  })

  it('no duplica emails repetidos', () => {
    expect(buildGuestAttendees(['ana@org.es', 'ANA@org.es'], undefined)).toEqual([{ email: 'ana@org.es' }])
  })
})

describe('mapGuestResponses', () => {
  it('devuelve la respuesta de cada invitado por email en minúscula', () => {
    expect(mapGuestResponses([
      { email: 'Ana@Org.es', responseStatus: 'accepted' },
      { email: 'cliente@gmail.com', responseStatus: 'needsAction' },
    ])).toEqual({ 'ana@org.es': 'accepted', 'cliente@gmail.com': 'needsAction' })
  })

  it('deja afuera al organizador (el agente no es un invitado)', () => {
    expect(mapGuestResponses([{ email: 'agente@org.es', organizer: true, responseStatus: 'accepted' }])).toEqual({})
  })

  it('un estado que no conocemos o que falta cae en needsAction', () => {
    expect(mapGuestResponses([{ email: 'a@b.es' }, { email: 'c@d.es', responseStatus: 'raro' }])).toEqual({
      'a@b.es': 'needsAction',
      'c@d.es': 'needsAction',
    })
  })

  it('sin attendees devuelve vacío', () => {
    expect(mapGuestResponses(undefined)).toEqual({})
  })
})

describe('stripLeadLink', () => {
  it('saca el bloque del link y deja la descripción del agente', () => {
    const withLink = 'llevar llaves\n\nFicha del lead: https://equipo.propelia.es/crm?lead=lead-1'
    expect(stripLeadLink(withLink)).toBe('llevar llaves')
  })

  it('una descripción que era sólo el link queda vacía', () => {
    expect(stripLeadLink('Ficha del lead: https://equipo.propelia.es/crm?lead=lead-1')).toBe('')
  })

  it('sin link devuelve el texto tal cual', () => {
    expect(stripLeadLink('llevar llaves')).toBe('llevar llaves')
  })

})

describe('planGoogleSync', () => {
  const active = { status: 'active' }

  it('sin conexión o conexión no activa => disable', () => {
    expect(planGoogleSync(meeting, null)).toEqual({ action: 'disable' })
    expect(planGoogleSync(meeting, { status: 'revoked' })).toEqual({ action: 'disable' })
  })

  it('agendada sin evento remoto => insert; con evento => patch', () => {
    expect(planGoogleSync(meeting, active)).toEqual({ action: 'insert' })
    expect(planGoogleSync({ ...meeting, external_event_id: 'ev1' }, active)).toEqual({ action: 'patch' })
  })

  it('cancelada con evento => delete; sin evento => complete', () => {
    expect(planGoogleSync({ ...meeting, status: 'cancelled', external_event_id: 'ev1' }, active)).toEqual({ action: 'delete' })
    expect(planGoogleSync({ ...meeting, status: 'cancelled' }, active)).toEqual({ action: 'complete' })
  })

  it('completed se trata como patch/insert (el evento queda en el calendario)', () => {
    expect(planGoogleSync({ ...meeting, status: 'completed', external_event_id: 'ev1' }, active)).toEqual({ action: 'patch' })
  })
})

describe('mapGoogleEventsToAgenda', () => {
  it('mapea evento con horario', () => {
    const events = mapGoogleEventsToAgenda([
      {
        id: 'ev1',
        summary: 'Visita Corrientes 1234',
        start: { dateTime: '2026-08-03T15:00:00-03:00' },
        end: { dateTime: '2026-08-03T16:00:00-03:00' },
      },
    ])
    expect(events).toEqual([
      {
        id: 'ev1',
        summary: 'Visita Corrientes 1234',
        start: '2026-08-03T15:00:00-03:00',
        end: '2026-08-03T16:00:00-03:00',
        isAllDay: false,
      },
    ])
  })

  it('mapea evento de día completo con isAllDay', () => {
    const events = mapGoogleEventsToAgenda([
      { id: 'ev2', summary: 'Feriado', start: { date: '2026-08-04' }, end: { date: '2026-08-05' } },
    ])
    expect(events).toEqual([
      { id: 'ev2', summary: 'Feriado', start: '2026-08-04', end: '2026-08-05', isAllDay: true },
    ])
  })

  it('sin summary usa "(Sin título)"', () => {
    const events = mapGoogleEventsToAgenda([
      { id: 'ev3', start: { dateTime: '2026-08-03T10:00:00Z' }, end: { dateTime: '2026-08-03T11:00:00Z' } },
    ])
    expect(events[0].summary).toBe('(Sin título)')
  })

  it('descarta eventos sin start/end utilizable', () => {
    const events = mapGoogleEventsToAgenda([{ id: 'ev4', summary: 'Roto', start: {}, end: {} }])
    expect(events).toEqual([])
  })

  it('lista vacía da lista vacía', () => {
    expect(mapGoogleEventsToAgenda([])).toEqual([])
  })
})
