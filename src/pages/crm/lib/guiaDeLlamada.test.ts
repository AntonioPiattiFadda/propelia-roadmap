import { describe, expect, it } from 'vitest'
import { GUIA_DE_DEMO, GUIA_DE_LLAMADA } from './guiaDeLlamada'

describe('guías del compositor', () => {
  it('cada sección tiene pasos y cada paso tiene título', () => {
    for (const guia of [GUIA_DE_LLAMADA, GUIA_DE_DEMO]) {
      expect(guia.length).toBeGreaterThan(0)
      for (const seccion of guia) {
        expect(seccion.pasos.length).toBeGreaterThan(0)
        for (const paso of seccion.pasos) expect(paso.titulo.trim()).not.toBe('')
      }
    }
  })

  it('la de la llamada va en tres partes con título: doorkeeper, decisor sin demo y decisor con demo', () => {
    expect(GUIA_DE_LLAMADA).toHaveLength(3)
    expect(GUIA_DE_LLAMADA.map(s => s.titulo)).toEqual([
      'Si contesta el doorkeeper',
      'Si hablas con el decisor y no agenda',
      'Si hablas con el decisor y agenda',
    ])
  })
})
