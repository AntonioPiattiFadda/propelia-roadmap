import { describe, expect, it } from 'vitest'
import { demosParaAvisar } from './demos'

const demo = (id: string, created_at: string, created_by: string | null = 'sdr') => ({ id, created_at, created_by })
const ahora = new Date('2026-10-20T12:00:00Z')

describe('demosParaAvisar', () => {
  it('sin marca no avisa nada y marca la más nueva', () => {
    const r = demosParaAvisar([demo('a', '2026-10-19T10:00:00Z'), demo('b', '2026-10-20T09:00:00Z')], null, 'yo', ahora)
    expect(r.nuevas).toEqual([])
    expect(r.marca).toBe('2026-10-20T09:00:00Z')
  })
  it('sin marca ni demos, la marca es ahora', () => {
    expect(demosParaAvisar([], null, 'yo', ahora).marca).toBe(ahora.toISOString())
  })
  it('avisa las posteriores a la marca, la más vieja primero, y corre la marca', () => {
    const r = demosParaAvisar([
      demo('c', '2026-10-20T11:00:00Z'), demo('a', '2026-10-19T10:00:00Z'), demo('b', '2026-10-20T10:00:00Z'),
    ], '2026-10-20T09:00:00Z', 'yo', ahora)
    expect(r.nuevas.map(d => d.id)).toEqual(['b', 'c'])
    expect(r.marca).toBe('2026-10-20T11:00:00Z')
  })
  it('las que agendé yo no me avisan, pero corren la marca', () => {
    const r = demosParaAvisar([demo('a', '2026-10-20T10:00:00Z', 'yo')], '2026-10-20T09:00:00Z', 'yo', ahora)
    expect(r.nuevas).toEqual([])
    expect(r.marca).toBe('2026-10-20T10:00:00Z')
  })
  it('la marca nunca vuelve atrás (una demo borrada no la retrocede)', () => {
    expect(demosParaAvisar([demo('a', '2026-10-19T10:00:00Z')], '2026-10-20T09:00:00Z', 'yo', ahora).marca).toBe('2026-10-20T09:00:00Z')
  })
})
