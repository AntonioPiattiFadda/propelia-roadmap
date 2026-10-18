import { describe, expect, it } from 'vitest'
import { clavePlaybook, nombreDeClave, pesoLegible } from './playbook'

describe('clavePlaybook', () => {
  it('saca tildes y espacios y antepone la carpeta y el momento', () => {
    expect(clavePlaybook('Guión de llamada Ñandú.pdf', 1700000000000))
      .toBe('playbook/1700000000000__Guion_de_llamada_Nandu.pdf')
  })

  it('reemplaza lo que no es ASCII seguro', () => {
    expect(clavePlaybook('a/b?c#d.pdf', 1)).toBe('playbook/1__a_b_c_d.pdf')
  })
})

describe('nombreDeClave', () => {
  it('devuelve el nombre sin el momento', () => {
    expect(nombreDeClave('1700000000000__Guion_de_llamada.pdf')).toBe('Guion de llamada.pdf')
  })

  it('deja igual un nombre sin prefijo', () => {
    expect(nombreDeClave('suelto.pdf')).toBe('suelto.pdf')
  })
})

describe('pesoLegible', () => {
  it('elige la unidad', () => {
    expect(pesoLegible(800)).toBe('800 B')
    expect(pesoLegible(80_574)).toBe('79 KB')
    expect(pesoLegible(2_500_000)).toBe('2.4 MB')
  })
})
