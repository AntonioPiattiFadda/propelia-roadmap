import { describe, expect, it } from 'vitest'
import { comentarioDescarte, comentarioReasignacion } from './systemComment'

describe('comentarios SYSTEM', () => {
  it('reasignación: de quién a quién', () => {
    expect(comentarioReasignacion('Antonio', 'Lorenzo')).toBe('Lead reasignado de Antonio a Lorenzo.')
  })
  it('descarte con motivo, recortado', () => {
    expect(comentarioDescarte('  No tiene presupuesto ')).toBe('Lead descartado. Motivo: No tiene presupuesto')
  })
  it('descarte con un código del catálogo: escribe la etiqueta', () => {
    expect(comentarioDescarte('closed')).toBe('Lead descartado. Motivo: Cerró o dejó de operar')
  })
  it('descarte que podría calificar: dice desde cuándo volver a llamar', () => {
    expect(comentarioDescarte('too_small', '2027-04-10'))
      .toBe('Lead descartado. Motivo: Muy chica hoy (poco volumen). Volver a llamar desde 10/04/2027.')
  })
  it('descarte sin motivo (null o vacío)', () => {
    expect(comentarioDescarte(null)).toBe('Lead descartado. Sin motivo especificado.')
    expect(comentarioDescarte('   ')).toBe('Lead descartado. Sin motivo especificado.')
  })
})
