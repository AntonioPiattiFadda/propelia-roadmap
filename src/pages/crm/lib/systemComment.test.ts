import { describe, expect, it } from 'vitest'
import { comentarioDescarte, comentarioReasignacion } from './systemComment'

describe('comentarios SYSTEM', () => {
  it('reasignación: de quién a quién', () => {
    expect(comentarioReasignacion('Antonio', 'Lorenzo')).toBe('Lead reasignado de Antonio a Lorenzo.')
  })
  it('descarte con motivo, recortado', () => {
    expect(comentarioDescarte('  No tiene presupuesto ')).toBe('Lead descartado. Motivo: No tiene presupuesto')
  })
  it('descarte sin motivo (null o vacío)', () => {
    expect(comentarioDescarte(null)).toBe('Lead descartado. Sin motivo especificado.')
    expect(comentarioDescarte('   ')).toBe('Lead descartado. Sin motivo especificado.')
  })
})
