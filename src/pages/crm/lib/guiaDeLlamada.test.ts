import { describe, expect, it } from 'vitest'
import { GUIA_DE_DEMO, GUIA_DE_DISCOVERY, GUIA_DE_LLAMADA, PLACEHOLDER_DE_DISCOVERY, muestraDiscovery } from './guiaDeLlamada'

describe('discovery', () => {
  it('el placeholder arranca con «Discovery» y trae preguntas', () => {
    const [titulo, ...lineas] = PLACEHOLDER_DE_DISCOVERY.split('\n')
    expect(titulo).toMatch(/^Discovery/)
    expect(lineas.filter(l => l.includes('¿')).length).toBeGreaterThanOrEqual(3)
  })

  it('la guía tiene secciones con preguntas', () => {
    expect(GUIA_DE_DISCOVERY.length).toBeGreaterThan(0)
    for (const s of GUIA_DE_DISCOVERY) {
      expect(s.titulo?.trim()).toBeTruthy()
      expect(s.pasos.length).toBeGreaterThan(0)
    }
  })

  it('se abre recién cuando se empieza a escribir, en llamada y notas', () => {
    expect(muestraDiscovery('llamada', '')).toBe(false)
    expect(muestraDiscovery('llamada', '   ')).toBe(false)
    expect(muestraDiscovery('llamada', 'H')).toBe(true)
    expect(muestraDiscovery('nota', 'Hablé')).toBe(true)
    expect(muestraDiscovery('fallido', 'buzón')).toBe(false)
    expect(muestraDiscovery('demo', 'algo')).toBe(false)
  })
})

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
