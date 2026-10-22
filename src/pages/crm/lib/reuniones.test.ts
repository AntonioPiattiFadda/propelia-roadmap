import { describe, expect, it } from 'vitest'
import type { CrmMeeting } from '../types'
import { agruparReuniones, armarReunion, datosDeLaDemo, descripcionDeDemo, enlaceParaAgendarDemo, esEmailValido, INVITADO_DE_TODA_DEMO, leerDescripcionDeDemo } from './reuniones'

const reunion = (id: string, starts: Date, status: CrmMeeting['status'] = 'scheduled'): CrmMeeting => ({
  id, lead_id: 'l', assigned_to: 'u', starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600_000).toISOString(),
  status, title: null, description: null, cancel_reason: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
  sync_status: 'disabled', sync_error: null, sync_attempts: 0, external_event_id: null, external_provider: null, ics_sequence: 0, color_id: null, reminder_minutes: null, guest_user_ids: [], guest_emails: [],
})

describe('armarReunion', () => {
  it('fecha y hora LOCALES a instantes, con la duración', () => {
    const r = armarReunion('2026-10-01', '09:30', 45)
    expect(new Date(r.starts_at).getHours()).toBe(9)
    expect(new Date(r.starts_at).getMinutes()).toBe(30)
    expect(Date.parse(r.ends_at) - Date.parse(r.starts_at)).toBe(45 * 60_000)
  })
})

describe('esEmailValido', () => {
  it('acepta un mail con espacios alrededor y rechaza lo que no es un mail', () => {
    expect(esEmailValido('  ana@inmo.es ')).toBe(true)
    expect(esEmailValido('')).toBe(false)
    expect(esEmailValido('ana@inmo')).toBe(false)
    expect(esEmailValido('ana inmo@x.es')).toBe(false)
  })
})

describe('descripcionDeDemo', () => {
  it('a quién va la invitación, quién asiste y las notas, un renglón por cosa', () => {
    expect(descripcionDeDemo({ email: ' ana@inmo.es ', asistentes: ['Ana (decisora)', 'Pedro'], notas: '  Quiere ver el portal.  ' }))
      .toBe('Invitación a: ana@inmo.es\nAsisten: Ana (decisora), Pedro\nQuiere ver el portal.')
  })
  it('sin asistentes ni notas no deja renglones vacíos', () => {
    expect(descripcionDeDemo({ email: 'ana@inmo.es', asistentes: [], notas: '   ' })).toBe('Invitación a: ana@inmo.es')
  })
})

describe('agruparReuniones', () => {
  const now = new Date(2026, 8, 30, 12).getTime()
  it('próximas agendadas en orden; pasadas y cerradas, de la más nueva a la más vieja', () => {
    const g = agruparReuniones([
      reunion('pasada', new Date(2026, 8, 20, 10)),
      reunion('luego', new Date(2026, 9, 5, 10)),
      reunion('pronto', new Date(2026, 9, 1, 10)),
      reunion('cancelada', new Date(2026, 9, 2, 10), 'cancelled'),
    ], now)
    expect(g.proximas.map(r => r.id)).toEqual(['pronto', 'luego'])
    expect(g.pasadas.map(r => r.id)).toEqual(['cancelada', 'pasada'])
  })
})

describe('leerDescripcionDeDemo', () => {
  it('es la vuelta de descripcionDeDemo', () => {
    const d = descripcionDeDemo({ email: 'a@b.es', asistentes: ['Ana', 'Luis'], notas: 'Quiere ver el CRM\ny precios' })
    expect(leerDescripcionDeDemo(d)).toEqual({ email: 'a@b.es', asistentes: ['Ana', 'Luis'], notas: 'Quiere ver el CRM\ny precios' })
  })
  it('sin asistentes ni notas', () => {
    expect(leerDescripcionDeDemo(descripcionDeDemo({ email: 'a@b.es', asistentes: [], notas: '' })))
      .toEqual({ email: 'a@b.es', asistentes: [], notas: '' })
  })
  it('una descripción a mano, o vacía, son todo notas', () => {
    expect(leerDescripcionDeDemo('Llevar la propuesta')).toEqual({ email: '', asistentes: [], notas: 'Llevar la propuesta' })
    expect(leerDescripcionDeDemo(null)).toEqual({ email: '', asistentes: [], notas: '' })
  })
})

describe('enlaceParaAgendarDemo', () => {
  const base = { leadId: 'l1', assignedTo: 'u1' }
  const leer = (url: string) => new URL(url, 'https://x.test')
  it('va a /agenda con el lead, el responsable, el título y la marca de demo', () => {
    const u = leer(enlaceParaAgendarDemo({ ...base, email: 'a@b.es' }))
    expect(u.pathname).toBe('/agenda')
    expect(u.searchParams.get('leadId')).toBe('l1')
    expect(u.searchParams.get('assignedTo')).toBe('u1')
    expect(u.searchParams.get('title')).toBe('Demo')
    expect(u.searchParams.get('demo')).toBe('1')
    expect(u.searchParams.has('description')).toBe(false)
  })
  it('invita siempre a la inmobiliaria y a Lorenzo', () => {
    const u = leer(enlaceParaAgendarDemo({ ...base, email: ' Ana@Inmo.es ' }))
    expect(u.searchParams.getAll('guestEmail')).toEqual(['ana@inmo.es', INVITADO_DE_TODA_DEMO])
  })
  it('sin repetir ni colar un mail inválido; sin mail, solo Lorenzo', () => {
    expect(leer(enlaceParaAgendarDemo({ ...base, email: null })).searchParams.getAll('guestEmail'))
      .toEqual([INVITADO_DE_TODA_DEMO])
    expect(leer(enlaceParaAgendarDemo({ ...base, email: INVITADO_DE_TODA_DEMO })).searchParams.getAll('guestEmail'))
      .toEqual([INVITADO_DE_TODA_DEMO])
    expect(leer(enlaceParaAgendarDemo({ ...base, email: 'no-es-mail' })).searchParams.getAll('guestEmail'))
      .toEqual([INVITADO_DE_TODA_DEMO])
  })
})

describe('datosDeLaDemo', () => {
  const reunion = { description: 'Invitación a: vieja@inmo.es\nAsisten: Ana\nNotas viejas', guest_emails: [INVITADO_DE_TODA_DEMO, 'ana@inmo.es'] }
  it('con registro: asistentes y notas del registro, el mail del invitado que no es el fijo', () => {
    expect(datosDeLaDemo(reunion, { con: ['Marta', 'Pere'], decisorApuntado: 'Jordi', texto: 'Quiere ver la importación' }))
      .toEqual({ email: 'ana@inmo.es', asistentes: ['Marta', 'Pere'], notas: 'Decisor: Jordi\nQuiere ver la importación' })
  })
  it('el texto de fábrica no es una nota', () => {
    expect(datosDeLaDemo(reunion, { con: [], texto: 'Demo agendada.' }).notas).toBe('')
  })
  it('sin registro (las de antes del 22/10/2026), lo de la descripción', () => {
    expect(datosDeLaDemo(reunion, null)).toEqual({ email: 'vieja@inmo.es', asistentes: ['Ana'], notas: 'Notas viejas' })
  })
})
