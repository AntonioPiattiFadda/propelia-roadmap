import { describe, expect, it } from 'vitest'
import { safeNextPath } from '@/lib/safeNextPath'

describe('safeNextPath', () => {
  it('deja pasar rutas internas con query', () => {
    expect(safeNextPath('/oauth/consent?authorization_id=abc')).toBe('/oauth/consent?authorization_id=abc')
  })

  it('rechaza todo lo que pueda sacar del dominio (open redirect)', () => {
    for (const evil of ['https://evil.com', '//evil.com', '/\\evil.com', 'evil.com', 'javascript:alert(1)', '/\n/evil.com']) {
      expect(safeNextPath(evil)).toBeNull()
    }
  })

  it('sin next: null', () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath('')).toBeNull()
  })
})
