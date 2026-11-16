import { describe, expect, it } from 'vitest'
import { esBuscarContacto } from './buscarContacto'

describe('esBuscarContacto', () => {
  it('reconoce la etapa por su value, sin importar mayúsculas', () => {
    expect(esBuscarContacto({ value: 'FIND_CONTACT' })).toBe(true)
    expect(esBuscarContacto({ value: 'find_contact' })).toBe(true)
  })

  it('cualquier otra etapa, o ninguna, no es', () => {
    expect(esBuscarContacto({ value: 'NEW' })).toBe(false)
    expect(esBuscarContacto(undefined)).toBe(false)
    expect(esBuscarContacto(null)).toBe(false)
  })
})
