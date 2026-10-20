import { describe, expect, it } from 'vitest'
import { enlaceDeWhatsapp } from './whatsapp'

describe('enlaceDeWhatsapp', () => {
  it('arma el wa.me con el número en dígitos y el texto codificado', () => {
    expect(enlaceDeWhatsapp('+34 600 11 22 33', 'Hola Ana & co'))
      .toBe(`https://wa.me/34600112233?text=${encodeURIComponent('Hola Ana & co')}`)
  })
  it('sin código de país asume España', () => {
    expect(enlaceDeWhatsapp('600 11 22 33', 'x')).toBe('https://wa.me/34600112233?text=x')
  })
  it('un número inválido no arma enlace: abriría un chat con otro país', () => {
    expect(enlaceDeWhatsapp('123', 'x')).toBeNull()
    expect(enlaceDeWhatsapp('', 'x')).toBeNull()
  })
})
