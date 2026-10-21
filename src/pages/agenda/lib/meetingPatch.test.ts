import { describe, it, expect } from 'vitest'
import { buildMeetingUpdatePatch as buildVisitUpdatePatch } from './meetingPatch'

describe('buildVisitUpdatePatch', () => {
  it('bumpea ics_sequence en cada cambio y no escribe columnas del .ics retirado', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 2 }, { startsAt: '2026-08-02T10:00:00Z' })
    expect(patch.ics_sequence).toBe(3)
    expect(patch).not.toHaveProperty('email_status')
    expect(patch.starts_at).toBe('2026-08-02T10:00:00Z')
    expect(patch.updated_at).toBeTypeOf('string')
  })

  it('solo mapea los campos presentes', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { description: 'llevar llaves' })
    expect(patch.description).toBe('llevar llaves')
    expect(patch.starts_at).toBeUndefined()
    expect(patch.ends_at).toBeUndefined()
  })

  it('todo cambio re-encola el sync de Google', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { description: 'cambio' })
    expect(patch.sync_status).toBe('pending')
    expect(patch.sync_attempts).toBe(0)
  })

  it('mapea los invitados del equipo', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { guestUserIds: ['u-1', 'u-2'] })
    expect(patch.guest_user_ids).toEqual(['u-1', 'u-2'])
  })

  it('una lista vacía de invitados se escribe (quitarlos a todos no es "sin cambios")', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { guestUserIds: [] })
    expect(patch.guest_user_ids).toEqual([])
  })

  it('mapea los invitados de afuera por email', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { guestEmails: ['tasador@gmail.com'] })
    expect(patch.guest_emails).toEqual(['tasador@gmail.com'])
  })

  it('sin guestUserIds no toca los invitados', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { title: 'x' })
    expect(patch.guest_user_ids).toBeUndefined()
    expect(patch.guest_emails).toBeUndefined()
  })

  it('cancelación mapea status', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 1 }, { status: 'cancelled' })
    expect(patch.status).toBe('cancelled')
    expect(patch.ics_sequence).toBe(2)
  })

  it('mapea título, color y recordatorio al editar', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { title: 'Nuevo título', colorId: '5', reminderMinutes: 30 })
    expect(patch.title).toBe('Nuevo título')
    expect(patch.color_id).toBe('5')
    expect(patch.reminder_minutes).toBe(30)
  })

  it('permite limpiar color y recordatorio con null', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 0 }, { colorId: null, reminderMinutes: null })
    expect(patch.color_id).toBeNull()
    expect(patch.reminder_minutes).toBeNull()
  })

  it('cancelación con motivo mapea status y cancel_reason juntos', () => {
    const patch = buildVisitUpdatePatch({ ics_sequence: 1 }, { status: 'cancelled', cancelReason: 'El cliente ya compró otra propiedad' })
    expect(patch.status).toBe('cancelled')
    expect(patch.cancel_reason).toBe('El cliente ya compró otra propiedad')
  })
})
