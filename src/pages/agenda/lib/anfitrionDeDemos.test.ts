import { describe, expect, it } from 'vitest'
import { ocupadosComoEventos } from './anfitrionDeDemos'

const bloque = (start: string, end: string) => ({ start, end })

describe('ocupadosComoEventos', () => {
  it('cada bloque ocupado es un evento «Ocupado · nombre», sin detalles', () => {
    const r = ocupadosComoEventos([bloque('2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z')], 'Lorenzo', [])
    expect(r).toEqual([{
      id: 'anfitrion-2026-11-05T09:00:00Z', summary: 'Ocupado · Lorenzo',
      start: '2026-11-05T09:00:00Z', end: '2026-11-05T10:00:00Z', isAllDay: false,
    }])
  })
  it('saca el bloque que ya se ve en la agenda con el mismo horario (la demo a la que Lorenzo está invitado)', () => {
    const r = ocupadosComoEventos(
      [bloque('2026-11-05T09:00:00Z', '2026-11-05T10:00:00Z'), bloque('2026-11-05T12:00:00Z', '2026-11-05T13:00:00Z')],
      'Lorenzo',
      [{ start: '2026-11-05T10:00:00+01:00', end: '2026-11-05T11:00:00+01:00' }],
    )
    expect(r.map(e => e.start)).toEqual(['2026-11-05T12:00:00Z'])
  })
  it('un bloque roto no entra', () => {
    expect(ocupadosComoEventos([bloque('mal', '2026-11-05T10:00:00Z')], 'Lorenzo', [])).toEqual([])
  })
})
