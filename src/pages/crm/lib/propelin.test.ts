import { describe, expect, it } from 'vitest'
import { hitoAlcanzado, MENSAJES_DE_PROPELIN, mensajeDePropelin } from './propelin'

describe('hitoAlcanzado', () => {
  it('cruzar un múltiplo de 10 es un hito', () => {
    expect(hitoAlcanzado(9, 10)).toBe(10)
    expect(hitoAlcanzado(18, 21)).toBe(20)
  })
  it('sin cruzar no hay hito', () => {
    expect(hitoAlcanzado(10, 11)).toBeNull()
    expect(hitoAlcanzado(3, 9)).toBeNull()
  })
  it('lo primero que se ve no es un hito: abrir la pantalla con 30 no festeja', () => {
    expect(hitoAlcanzado(undefined, 30)).toBeNull()
  })
  it('bajar (agendaron una demo y vuelve a cero) no es un hito', () => {
    expect(hitoAlcanzado(47, 0)).toBeNull()
  })
  it('saltar varios de golpe festeja el último', () => {
    expect(hitoAlcanzado(8, 31)).toBe(30)
  })
})

describe('mensajeDePropelin', () => {
  it('reemplaza la cantidad y lo que falta', () => {
    const conAmbos = MENSAJES_DE_PROPELIN.findIndex(m => m.includes('{n}') && m.includes('{faltan}'))
    const m = mensajeDePropelin(20, 75, () => conAmbos / MENSAJES_DE_PROPELIN.length)
    expect(m).toContain('20')
    expect(m).toContain('75')
    expect(m).not.toMatch(/[{}]/)
  })
  it('ningún mensaje queda con llaves sin reemplazar', () => {
    MENSAJES_DE_PROPELIN.forEach((_, i) => {
      expect(mensajeDePropelin(10, 85, () => i / MENSAJES_DE_PROPELIN.length)).not.toMatch(/[{}]/)
    })
  })
  it('no repite el anterior', () => {
    const anterior = mensajeDePropelin(10, 85, () => 0)
    expect(mensajeDePropelin(10, 85, () => 0, anterior)).not.toBe(anterior)
  })
})
