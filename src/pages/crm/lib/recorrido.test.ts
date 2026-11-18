import { describe, expect, it } from 'vitest'
import { leadParaAbrir, vecinosEnRecorrido } from './recorrido'

describe('vecinosEnRecorrido', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('en la lista: el de arriba y el de abajo', () => {
    expect(vecinosEnRecorrido(ids, 'b', null)).toEqual({ indice: 1, anterior: 'a', siguiente: 'c' })
    expect(vecinosEnRecorrido(ids, 'a', null)).toEqual({ indice: 0, anterior: null, siguiente: 'b' })
    expect(vecinosEnRecorrido(ids, 'd', null)).toEqual({ indice: 3, anterior: 'c', siguiente: null })
  })
  it('si se fue de la lista (se descartó), sigue desde donde estaba', () => {
    // Estaba 'x' en el lugar 1, entre 'a' y 'b': abajo queda el que ahora ocupa su lugar.
    expect(vecinosEnRecorrido(['a', 'b', 'c'], 'x', { id: 'x', indice: 1 }))
      .toEqual({ indice: -1, anterior: 'a', siguiente: 'b' })
  })
  it('si era el último, abajo no hay nada', () => {
    expect(vecinosEnRecorrido(['a', 'b'], 'x', { id: 'x', indice: 2 }))
      .toEqual({ indice: -1, anterior: 'b', siguiente: null })
  })
  it('llegó por enlace y nunca estuvo en la lista: no hay a dónde ir', () => {
    expect(vecinosEnRecorrido(ids, 'x', { id: 'otro', indice: 1 })).toEqual({ indice: -1, anterior: null, siguiente: null })
    expect(vecinosEnRecorrido(ids, null, null)).toEqual({ indice: -1, anterior: null, siguiente: null })
  })
})

describe('leadParaAbrir', () => {
  const a = { id: 'a', de: 'lista' }
  const suelto = { id: 'a', de: 'suelto' }

  it('sin ?lead= no abre nada', () => {
    expect(leadParaAbrir(null, [a], suelto)).toBeNull()
  })

  it('con la lista cargada, sale de la lista', () => {
    expect(leadParaAbrir('a', [a], suelto)).toBe(a)
  })

  it('con la lista cargada y sin el lead, no abre el suelto (enlace roto)', () => {
    expect(leadParaAbrir('a', [], suelto)).toBeNull()
  })

  it('mientras la lista no llegó, abre el suelto', () => {
    expect(leadParaAbrir('a', undefined, suelto)).toBe(suelto)
  })

  it('el suelto de otro id no vale', () => {
    expect(leadParaAbrir('b', undefined, suelto)).toBeNull()
  })

  it('sin lista ni suelto, todavía nada', () => {
    expect(leadParaAbrir('a', undefined, undefined)).toBeNull()
  })
})
