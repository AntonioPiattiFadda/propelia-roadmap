import { describe, expect, it } from 'vitest'
import { findDiscardedStage, type DiscardableStage } from './discardStage'

// Portado de propelia-frontend (src/tests/discard-stage.test.ts).
const stage = (over: Partial<DiscardableStage>): DiscardableStage =>
  ({ id: 'id', value: 'NEW', is_out_of_funnel: false, deleted_at: null, ...over })

describe('findDiscardedStage', () => {
  it('encuentra la de value DISCARDED sin importar mayúsculas', () => {
    const target = stage({ id: 'd', value: 'discarded' })
    expect(findDiscardedStage([stage({ id: 'n' }), target])).toBe(target)
  })
  it('si no hay DISCARDED, cae en la que está fuera del funnel', () => {
    const target = stage({ id: 'o', value: 'ARCHIVADO', is_out_of_funnel: true })
    expect(findDiscardedStage([stage({ id: 'n' }), target])).toBe(target)
  })
  it('ignora las borradas', () => {
    expect(findDiscardedStage([stage({ id: 'd', value: 'DISCARDED', deleted_at: '2026-09-01' })])).toBeUndefined()
  })
  it('undefined si no hay ninguna', () => {
    expect(findDiscardedStage([stage({})])).toBeUndefined()
  })
})
