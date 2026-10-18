import { describe, expect, it } from 'vitest'
import { investigacionDeClaude } from './investigacion'

const RESEARCH = [
  'TIP PARA LA PRIMERA LLAMADA', 'Pide hablar con el gerente.', '',
  'PERSONAS DE LA EMPRESA', 'No se encontraron personas', '',
  'TELEFONOS DE CONTACTO', 'Sin numeros adicionales', '',
  'POR QUE SE ELIGIO', 'Acaba de darse de alta en Idealista.',
].join('\n')

describe('investigacionDeClaude', () => {
  it('se queda con personas y teléfonos, en ese orden y con su título', () => {
    expect(investigacionDeClaude(RESEARCH)).toBe(
      'PERSONAS DE LA EMPRESA\nNo se encontraron personas\n\nTELEFONOS DE CONTACTO\nSin numeros adicionales',
    )
  })
  it('suma los contactos nuevos que agregó una reimportación, pero no el aviso de repetida', () => {
    const conAgregados = 'POSIBLE REPETIDA de «Fincas Sol»\n\n' + RESEARCH
      + '\n\nNUEVOS CONTACTOS (lote BCN-S02, 10/10/2026)\nLaura · 600 000 000'
    expect(investigacionDeClaude(conAgregados)).toBe(
      'PERSONAS DE LA EMPRESA\nNo se encontraron personas\n\nTELEFONOS DE CONTACTO\nSin numeros adicionales'
      + '\n\nNUEVOS CONTACTOS (lote BCN-S02, 10/10/2026)\nLaura · 600 000 000',
    )
  })
  it('sin esas secciones, o sin texto, no hay nada que mostrar', () => {
    expect(investigacionDeClaude('Preguntá por Inmovilla.')).toBeNull()
    expect(investigacionDeClaude('   ')).toBeNull()
    expect(investigacionDeClaude(null)).toBeNull()
  })
  it('tolera los saltos de línea de Windows', () => {
    expect(investigacionDeClaude('PERSONAS DE LA EMPRESA\r\nAna\r\n\r\nPOR QUE SE ELIGIO\r\nx')).toBe('PERSONAS DE LA EMPRESA\nAna')
  })
})
