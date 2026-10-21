import { describe, it, expect } from 'vitest'
import { buildAgendaEvents, groupEventsByDay } from './agendaEvents'

const baseVisit = {
  id: 'v1',
  title: 'Visita — Corrientes 1234',
  starts_at: '2026-08-04T15:00:00-03:00',
  ends_at: '2026-08-04T16:00:00-03:00',
  status: 'scheduled' as const,
  color_id: null as string | null,
  external_event_id: null as string | null,
}

describe('buildAgendaEvents', () => {
  it('mapea una visita de Propelia con source visit', () => {
    const events = buildAgendaEvents([baseVisit], [])
    expect(events).toEqual([
      {
        id: 'v1',
        title: 'Visita — Corrientes 1234',
        startIso: '2026-08-04T15:00:00-03:00',
        endIso: '2026-08-04T16:00:00-03:00',
        isAllDay: false,
        source: 'meeting',
        colorId: null,
        status: 'scheduled',
      },
    ])
  })

  it('reunión sin title usa "Reunión" por default', () => {
    const events = buildAgendaEvents([{ ...baseVisit, title: null }], [])
    expect(events[0].title).toBe('Reunión')
  })

  it('mapea un evento de Google no vinculado a ninguna visita', () => {
    const events = buildAgendaEvents([], [
      { id: 'g1', summary: 'Visita a la tia', start: '2026-08-05T07:30:00-03:00', end: '2026-08-05T08:30:00-03:00', isAllDay: false },
    ])
    expect(events).toEqual([
      {
        id: 'g1',
        title: 'Visita a la tia',
        startIso: '2026-08-05T07:30:00-03:00',
        endIso: '2026-08-05T08:30:00-03:00',
        isAllDay: false,
        source: 'google',
        colorId: null,
      },
    ])
  })

  it('descarta el evento de Google que corresponde al external_event_id de una visita (evita duplicado)', () => {
    const events = buildAgendaEvents(
      [{ ...baseVisit, external_event_id: 'g1' }],
      [{ id: 'g1', summary: 'Visita — Corrientes 1234', start: baseVisit.starts_at, end: baseVisit.ends_at, isAllDay: false }],
    )
    expect(events).toHaveLength(1)
    expect(events[0].source).toBe('meeting')
  })

  it('no muestra las visitas canceladas', () => {
    const events = buildAgendaEvents([{ ...baseVisit, status: 'cancelled' }], [])
    expect(events).toEqual([])
  })

  it('tampoco muestra el evento de Google de una visita cancelada', () => {
    const events = buildAgendaEvents(
      [{ ...baseVisit, status: 'cancelled', external_event_id: 'g1' }],
      [{ id: 'g1', summary: 'Visita — Corrientes 1234', start: baseVisit.starts_at, end: baseVisit.ends_at, isAllDay: false }],
    )
    expect(events).toEqual([])
  })

  it('sin visitas ni eventos de google, devuelve lista vacía', () => {
    expect(buildAgendaEvents([], [])).toEqual([])
  })
})

describe('groupEventsByDay', () => {
  const days = ['2026-08-03', '2026-08-04', '2026-08-05']

  it('agrupa eventos con horario por su fecha de inicio', () => {
    const events = buildAgendaEvents([baseVisit], [])
    const grouped = groupEventsByDay(events, days)
    expect(grouped['2026-08-04']).toHaveLength(1)
    expect(grouped['2026-08-03']).toEqual([])
    expect(grouped['2026-08-05']).toEqual([])
  })

  it('eventos de día completo se agrupan por su fecha sin recortar', () => {
    const events = buildAgendaEvents([], [{ id: 'g2', summary: 'Feriado', start: '2026-08-05', end: '2026-08-06', isAllDay: true }])
    const grouped = groupEventsByDay(events, days)
    expect(grouped['2026-08-05']).toHaveLength(1)
  })
})
