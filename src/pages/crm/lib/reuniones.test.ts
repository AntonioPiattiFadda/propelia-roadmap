import { describe, expect, it } from 'vitest'
import type { CrmMeeting } from '../types'
import { agruparReuniones, armarReunion, descripcionDeDemo, esEmailValido, leerDescripcionDeDemo } from './reuniones'

const reunion = (id: string, starts: Date, status: CrmMeeting['status'] = 'scheduled'): CrmMeeting => ({
  id, lead_id: 'l', assigned_to: 'u', starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 3600_000).toISOString(),
  status, title: null, description: null, cancel_reason: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
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
