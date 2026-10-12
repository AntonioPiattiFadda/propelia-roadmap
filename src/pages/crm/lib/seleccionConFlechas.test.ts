import { describe, expect, it } from 'vitest'
import { vecinoMarcable } from './seleccionConFlechas'

const ids = ['a', 'b', 'c', 'd']
const todos = () => true

describe('vecinoMarcable', () => {
  it('devuelve el de abajo con delta 1 y el de arriba con -1', () => {
    expect(vecinoMarcable(ids, 'b', 1, todos)).toBe('c')
    expect(vecinoMarcable(ids, 'b', -1, todos)).toBe('a')
  })

  it('saltea los que no se pueden marcar', () => {
    expect(vecinoMarcable(ids, 'a', 1, id => id !== 'b')).toBe('c')
  })

  it('en el borde de la lista no hay vecino', () => {
    expect(vecinoMarcable(ids, 'd', 1, todos)).toBeNull()
    expect(vecinoMarcable(ids, 'a', -1, todos)).toBeNull()
  })

  it('sin punto de partida visible no hay vecino', () => {
    expect(vecinoMarcable(ids, null, 1, todos)).toBeNull()
    expect(vecinoMarcable(ids, 'z', 1, todos)).toBeNull()
  })
})
