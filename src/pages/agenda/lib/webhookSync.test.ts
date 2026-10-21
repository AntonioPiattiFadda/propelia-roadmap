import { describe, it, expect } from 'vitest'
import { extractMeetingId, planWebhookUpdate } from '../../../../supabase/functions/_shared/webhookSync'

const local = {
  id: 'abc123',
  starts_at: '2026-08-01T15:00:00+00:00',
  ends_at: '2026-08-01T16:00:00+00:00',
  status: 'scheduled',
  ics_sequence: 1,
  title: null as string | null,
  description: null as string | null,
}

const incoming = {
  id: 'gev1',
  status: 'confirmed',
  start: { dateTime: '2026-08-01T15:00:00+00:00' },
  end: { dateTime: '2026-08-01T16:00:00+00:00' },
  extendedProperties: { private: { propelia_crm_meeting_id: 'abc123' } },
}

describe('extractMeetingId', () => {
  it('extrae el id de la extended property', () => {
    expect(extractMeetingId(incoming)).toBe('abc123')
  })
  it('null si no la tiene (evento ajeno => se ignora)', () => {
    expect(extractMeetingId({ id: 'x', status: 'confirmed' })).toBeNull()
  })
})

describe('planWebhookUpdate', () => {
  it('eco idéntico al estado local => null (anti-loop)', () => {
    expect(planWebhookUpdate(local, incoming)).toBeNull()
  })

  it('mismo instante con distinta zona sigue siendo no-op', () => {
    const echoed = {
      ...incoming,
      start: { dateTime: '2026-08-01T17:00:00+02:00' },
      end: { dateTime: '2026-08-01T18:00:00+02:00' },
    }
    expect(planWebhookUpdate(local, echoed)).toBeNull()
  })

  it('cambio de horario => patch con nuevos tiempos y bump de sequence', () => {
    const moved = {
      ...incoming,
      start: { dateTime: '2026-08-01T17:00:00+00:00' },
      end: { dateTime: '2026-08-01T18:00:00+00:00' },
    }
    const patch = planWebhookUpdate(local, moved)
    expect(patch).not.toBeNull()
    expect(new Date(patch!.starts_at as string).toISOString()).toBe('2026-08-01T17:00:00.000Z')
    expect(new Date(patch!.ends_at as string).toISOString()).toBe('2026-08-01T18:00:00.000Z')
    expect(patch!.ics_sequence).toBe(2)
    expect(patch).not.toHaveProperty('email_status')
    expect(patch!.sync_status).toBe('synced')
    expect(patch!.status).toBeUndefined()
  })

  it('evento cancelado en Google => status cancelled', () => {
    const cancelled = { ...incoming, status: 'cancelled' }
    const patch = planWebhookUpdate(local, cancelled)
    expect(patch!.status).toBe('cancelled')
    expect(patch!.ics_sequence).toBe(2)
  })

  it('cancelado cuando ya estaba cancelada localmente => null', () => {
    const cancelled = { ...incoming, status: 'cancelled' }
    expect(planWebhookUpdate({ ...local, status: 'cancelled' }, cancelled)).toBeNull()
  })

  it('evento all-day (sin dateTime) => null (no soportado)', () => {
    const allDay = { ...incoming, start: { date: '2026-08-01' }, end: { date: '2026-08-02' } }
    expect(planWebhookUpdate(local, allDay)).toBeNull()
  })

  it('summary igual al default "Reunión" cuando local.title es null => no dispara patch (anti-loop del fallback)', () => {
    const echoed = { ...incoming, summary: 'Reunión' }
    expect(planWebhookUpdate(local, echoed)).toBeNull()
  })

  it('cambio de summary en Google => patch.title', () => {
    const renamed = { ...incoming, summary: 'Visita — Calle Falsa 123 (Juan)' }
    const patch = planWebhookUpdate(local, renamed)
    expect(patch!.title).toBe('Visita — Calle Falsa 123 (Juan)')
    expect(patch!.ics_sequence).toBe(2)
  })

  it('sin summary en el payload => no toca title', () => {
    const withTitle = { ...local, title: 'Visita — algo' }
    expect(planWebhookUpdate(withTitle, incoming)).toBeNull()
  })

  it('cambio de description en Google => patch.description', () => {
    const withDescription = { ...incoming, description: 'llevar llaves' }
    const patch = planWebhookUpdate(local, withDescription)
    expect(patch!.description).toBe('llevar llaves')
  })

  it('description vacío limpia description', () => {
    const withDescription = { ...local, description: 'algo' }
    const cleared = { ...incoming, description: '' }
    const patch = planWebhookUpdate(withDescription, cleared)
    expect(patch!.description).toBeNull()
  })

  it('el eco de la description con el link a la ficha no dispara patch', () => {
    const withDescription = { ...local, description: 'llevar llaves' }
    const echoed = {
      ...incoming,
      description: 'llevar llaves\n\nFicha del lead: https://equipo.propelia.es/crm?lead=lead-1',
    }
    expect(planWebhookUpdate(withDescription, echoed)).toBeNull()
  })

  it('una description que era sólo el link vuelve como null, no como el link', () => {
    const echoed = {
      ...incoming,
      description: 'Ficha del lead: https://equipo.propelia.es/crm?lead=lead-1',
    }
    expect(planWebhookUpdate(local, echoed)).toBeNull()
  })

  it('edición real en Google con el link al pie => patch sólo con el texto del agente', () => {
    const withDescription = { ...local, description: 'llevar llaves' }
    const edited = {
      ...incoming,
      description: 'llevar llaves y el plano\n\nFicha del lead: https://equipo.propelia.es/crm?lead=lead-1',
    }
    const patch = planWebhookUpdate(withDescription, edited)
    expect(patch!.description).toBe('llevar llaves y el plano')
  })
})
