import { describe, expect, it } from 'vitest'
import { textoDelEnvio } from './envioDeMensaje'

describe('textoDelEnvio', () => {
  it('nombra el canal, la plantilla y a quién se mandó', () => {
    expect(textoDelEnvio({ canal: 'email', plantilla: 'Mail puntual', destino: 'ana@inmo.es' }))
      .toBe('Email «Mail puntual» enviado a ana@inmo.es')
    expect(textoDelEnvio({ canal: 'whatsapp', plantilla: 'Primer contacto', destino: '+34 600 000 000' }))
      .toBe('WhatsApp «Primer contacto» enviado a +34 600 000 000')
  })

  it('recorta los espacios del destino', () => {
    expect(textoDelEnvio({ canal: 'email', plantilla: 'Mail puntual', destino: '  ana@inmo.es ' }))
      .toBe('Email «Mail puntual» enviado a ana@inmo.es')
  })
})
