import { describe, expect, it } from 'vitest'
import { contactoDelCliente, EMPTY_CLIENT, MISSING_CONTACT_ERROR, nombreDelLead, validateClientData } from './clientData'

describe('validateClientData', () => {
  it('sin teléfono ni email: error en los dos', () => {
    expect(validateClientData({ ...EMPTY_CLIENT, company_name: 'Inmo' }))
      .toEqual({ phone: MISSING_CONTACT_ERROR, email: MISSING_CONTACT_ERROR })
  })
  it('con email alcanza', () => {
    expect(validateClientData({ ...EMPTY_CLIENT, email: 'a@b.com' })).toEqual({})
  })
  it('teléfono que no es teléfono', () => {
    expect(validateClientData({ ...EMPTY_CLIENT, phone: '123' }).phone).toBe('Teléfono inválido')
  })
})

describe('nombreDelLead (Review Focus 1)', () => {
  const vacio = { company_name: null, first_name: null, last_name: null, email: null, phone: null }
  it('la empresa primero', () => {
    expect(nombreDelLead({ ...vacio, company_name: 'Inmo Sur', first_name: 'Ana' })).toBe('Inmo Sur')
  })
  it('sin empresa, la persona', () => {
    expect(nombreDelLead({ ...vacio, first_name: 'Ana', last_name: 'Torres' })).toBe('Ana Torres')
  })
  it('sin teléfono ni email ni nombre, y sin cliente: no revienta', () => {
    expect(nombreDelLead(vacio)).toBe('Sin nombre')
    expect(nombreDelLead(null)).toBe('Sin nombre')
  })
  it('contactoDelCliente es solo la persona', () => {
    expect(contactoDelCliente({ ...vacio, company_name: 'Inmo', first_name: 'Ana' })).toBe('Ana')
    expect(contactoDelCliente(undefined)).toBe('')
  })
})
