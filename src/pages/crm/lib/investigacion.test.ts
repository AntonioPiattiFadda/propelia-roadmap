import { describe, expect, it } from 'vitest'
import { conInvestigacionEditada, investigacionDeClaude } from './investigacion'

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

describe('conInvestigacionEditada', () => {
  it('reemplaza personas y teléfonos en su lugar y conserva lo que no se muestra', () => {
    const editada = 'PERSONAS DE LA EMPRESA\nAna (gerente)\n\nTELEFONOS DE CONTACTO\n600 111 222'
    const nuevo = conInvestigacionEditada(RESEARCH, editada)
    expect(nuevo).toBe([
      'TIP PARA LA PRIMERA LLAMADA', 'Pide hablar con el gerente.', '',
      'PERSONAS DE LA EMPRESA', 'Ana (gerente)', '',
      'TELEFONOS DE CONTACTO', '600 111 222', '',
      'POR QUE SE ELIGIO', 'Acaba de darse de alta en Idealista.',
    ].join('\n'))
    expect(investigacionDeClaude(nuevo)).toBe(editada)
  })
  it('se lleva también los contactos nuevos de una reimportación, que ya venían en lo editado', () => {
    const conAgregados = RESEARCH + '\n\nNUEVOS CONTACTOS (lote BCN-S02)\nLaura'
    const nuevo = conInvestigacionEditada(conAgregados, 'PERSONAS DE LA EMPRESA\nLaura')
    expect(nuevo).not.toContain('NUEVOS CONTACTOS')
    expect(nuevo).toContain('POR QUE SE ELIGIO')
    expect(investigacionDeClaude(nuevo)).toBe('PERSONAS DE LA EMPRESA\nLaura')
  })
  it('lo escrito sin título queda bajo «PERSONAS DE LA EMPRESA», para que se siga viendo', () => {
    const nuevo = conInvestigacionEditada(RESEARCH, 'Ana y Pedro')
    expect(investigacionDeClaude(nuevo)).toBe('PERSONAS DE LA EMPRESA\nAna y Pedro')
  })
  it('vaciarlo saca personas y teléfonos y deja el resto', () => {
    const nuevo = conInvestigacionEditada(RESEARCH, '   ')
    expect(investigacionDeClaude(nuevo)).toBeNull()
    expect(nuevo).toBe('TIP PARA LA PRIMERA LLAMADA\nPide hablar con el gerente.\n\nPOR QUE SE ELIGIO\nAcaba de darse de alta en Idealista.')
  })
  it('sin consejo previo, lo escrito es el consejo entero', () => {
    expect(conInvestigacionEditada(null, 'TELEFONOS DE CONTACTO\n600')).toBe('TELEFONOS DE CONTACTO\n600')
    expect(conInvestigacionEditada(null, '')).toBeNull()
  })
  it('conserva el texto suelto de antes del primer título', () => {
    const nuevo = conInvestigacionEditada('Preguntá por Inmovilla.\n\n' + RESEARCH, 'PERSONAS DE LA EMPRESA\nAna')
    expect(nuevo?.startsWith('Preguntá por Inmovilla.\n\nTIP PARA LA PRIMERA LLAMADA')).toBe(true)
  })
})
