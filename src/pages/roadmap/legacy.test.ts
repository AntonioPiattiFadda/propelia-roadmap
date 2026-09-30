import { describe, expect, it } from 'vitest'
import { urlDelLegacy } from './legacy'

describe('urlDelLegacy', () => {
  it('el tablero', () => expect(urlDelLegacy('estado')).toBe('/legacy/index.html?embed=1&vista=estado'))
  it('el backlog', () => expect(urlDelLegacy('backlog')).toBe('/legacy/index.html?embed=1&vista=backlog'))
})
