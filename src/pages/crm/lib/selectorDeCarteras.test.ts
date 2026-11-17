import { describe, expect, it } from 'vitest'
import { alternarTodas, rotuloDeCarteras, sonTodas } from './selectorDeCarteras'

const opciones = [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Beto' }, { id: 'c', nombre: 'Caro' }]

describe('sonTodas', () => {
  it('es true solo con todas las opciones marcadas', () => {
    expect(sonTodas(['a', 'b', 'c'], opciones)).toBe(true)
    expect(sonTodas(['a', 'c'], opciones)).toBe(false)
  })

  it('un marcado que ya no se ofrece no cuenta', () => {
    expect(sonTodas(['a', 'b', 'c', 'z'], opciones)).toBe(true)
  })
})

describe('alternarTodas', () => {
  it('sin todas marcadas, marca todas', () => {
    expect(alternarTodas(['a'], opciones, 'a')).toEqual(['a', 'b', 'c'])
  })

  it('con todas marcadas, vuelve a la propia (nunca cero)', () => {
    expect(alternarTodas(['a', 'b', 'c'], opciones, 'b')).toEqual(['b'])
  })
})

describe('rotuloDeCarteras', () => {
  it('una sola dice de quién', () => {
    expect(rotuloDeCarteras(['b'], opciones)).toBe('Leads de Beto')
  })

  it('todas dice «todos»', () => {
    expect(rotuloDeCarteras(['a', 'b', 'c'], opciones)).toBe('Leads de todos')
  })

  it('varias, cuántas', () => {
    expect(rotuloDeCarteras(['a', 'c'], opciones)).toBe('Leads de 2 personas')
  })
})
