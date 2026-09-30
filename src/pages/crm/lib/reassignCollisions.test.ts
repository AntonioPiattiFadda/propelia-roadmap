import { describe, expect, it } from 'vitest'
import {
  findReassignCollisions, particionarReasignacion, slotsDeCartera, type LeadSlot, type ReassignCandidate,
} from './reassignCollisions'

// Portado de propelia-frontend (src/tests/reassign-collisions.test.ts) sin lead_type.
const cand = (id: string, clientId: string, assignedTo = 'yo'): ReassignCandidate =>
  ({ id, clientId, assignedTo, clientName: `Cliente ${clientId}` })
const slot = (clientId: string): LeadSlot => ({ clientId })

describe('findReassignCollisions', () => {
  it('sin leads en el destino no hay choque', () => expect(findReassignCollisions([cand('l1', 'c1')], [])).toEqual([]))
  it('detecta el choque por cliente', () => {
    const c = cand('l1', 'c1')
    expect(findReassignCollisions([c], [slot('c1')])).toEqual([c])
  })
  it('en un lote mixto devuelve solo los que chocan, en orden', () => {
    const a = cand('l1', 'c1'), b = cand('l2', 'c2'), c = cand('l3', 'c3')
    expect(findReassignCollisions([a, b, c], [slot('c3'), slot('c1')])).toEqual([a, c])
  })
})

describe('slotsDeCartera', () => {
  it('solo los activos de ese usuario', () => {
    expect(slotsDeCartera([
      { client_id: 'c1', assigned_to: 'u', deleted_at: null },
      { client_id: 'c2', assigned_to: 'u', deleted_at: '2026-09-01' },
      { client_id: 'c3', assigned_to: 'otro', deleted_at: null },
    ], 'u')).toEqual([slot('c1')])
  })
})

describe('particionarReasignacion (Review Focus 5)', () => {
  it('reparte en mover y chocan', () => {
    const r = particionarReasignacion([cand('l1', 'c1'), cand('l2', 'c2')], 'destino', [slot('c2')])
    expect(r.mover.map(x => x.id)).toEqual(['l1'])
    expect(r.chocan.map(x => x.id)).toEqual(['l2'])
  })
  it('si chocan todos, no queda nada para mandar a la base', () => {
    expect(particionarReasignacion([cand('l1', 'c1')], 'destino', [slot('c1')]).mover).toEqual([])
  })
  it('el mismo cliente dos veces en el lote: el segundo choca contra el primero', () => {
    const r = particionarReasignacion([cand('l1', 'c1', 'ana'), cand('l2', 'c1', 'beto')], 'destino', [])
    expect(r.mover.map(x => x.id)).toEqual(['l1'])
    expect(r.chocan.map(x => x.id)).toEqual(['l2'])
  })
  it('los que ya son del destino no se mueven ni cuentan como choque', () => {
    const r = particionarReasignacion([cand('l1', 'c1', 'destino')], 'destino', [slot('c1')])
    expect(r.yaEran.map(x => x.id)).toEqual(['l1'])
    expect(r.chocan).toEqual([])
  })
})
