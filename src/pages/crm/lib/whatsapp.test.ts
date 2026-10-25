import { describe, expect, it } from 'vitest'
import { enlaceDeWhatsapp, esMovil } from './whatsapp'

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
    expect(enlaceDeWhatsapp('123', 'x', { web: true })).toBeNull()
  })
  it('con web va directo a WhatsApp Web, sin la redirección de wa.me que rompe los emojis', () => {
    const texto = 'Hola ✌️ mirá 👋 el vídeo ▶️'
    expect(enlaceDeWhatsapp('+34 600 11 22 33', texto, { web: true }))
      .toBe(`https://web.whatsapp.com/send?phone=34600112233&text=${encodeURIComponent(texto)}`)
  })
})

describe('esMovil', () => {
  it('reconoce Android y iPhone, y no un Windows de escritorio', () => {
    expect(esMovil('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile')).toBe(true)
    expect(esMovil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(esMovil('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0')).toBe(false)
  })
})
