import { describe, expect, it } from 'vitest'
import { postponeEffectiveAt } from './postponeTime'

describe('postponeEffectiveAt', () => {
  it('un día futuro queda a las 9 locales de ese día', () => {
    const now = new Date(2026, 6, 13, 20, 0).getTime()
    const r = postponeEffectiveAt(new Date(2026, 6, 15, 17, 30), now)
    expect(r).toBe(new Date(2026, 6, 15, 9, 0).toISOString())
  })

  it('hoy antes de las 9 queda a las 9', () => {
    const now = new Date(2026, 6, 13, 7, 0).getTime()
    expect(postponeEffectiveAt(new Date(2026, 6, 13), now)).toBe(new Date(2026, 6, 13, 9, 0).toISOString())
  })

  it('hoy pasadas las 9 es ahora mismo (nunca en el pasado)', () => {
    const now = new Date(2026, 6, 13, 20, 0).getTime()
    expect(postponeEffectiveAt(new Date(2026, 6, 13), now)).toBe(new Date(now).toISOString())
  })
})
