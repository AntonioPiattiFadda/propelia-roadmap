import { describe, expect, it } from 'vitest'
import { contactoDelCliente, contactosDelCliente, EMPTY_CLIENT, inicialesDe, MISSING_CONTACT_ERROR, nombreDelLead, validateClientData } from './clientData'

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

describe('inicialesDe', () => {
  it('la primera letra de las dos primeras palabras, en mayúscula', () => {
    expect(inicialesDe('Inmobiliaria Nova')).toBe('IN')
    expect(inicialesDe('inmo sur del parque')).toBe('IS')
  })
  it('una sola palabra: sus dos primeras letras', () => {
    expect(inicialesDe('Remax')).toBe('RE')
  })
  it('sin nombre, nada que dibujar', () => {
    expect(inicialesDe('   ')).toBe('')
  })
  it('una tilde o una eñe se quedan como están', () => {
    expect(inicialesDe('Ñandú Ávila')).toBe('ÑÁ')
  })
})

describe('contactosDelCliente', () => {
  const vacio = {
    first_name: null, last_name: null, phone: null,
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('la persona principal y las de los teléfonos alternativos, por su nombre', () => {
    expect(contactosDelCliente({
      ...vacio, first_name: 'Laura', last_name: 'Gómez',
      alternative_phone_1: '+34 600 1', alternative_phone_1_note: 'Marc (gerente)',
      alternative_phone_2: '+34 600 2',
    })).toEqual(['Laura Gómez', 'Marc (gerente)', '+34 600 2'])
  })
  it('un casillero vacío no es un contacto; un principal sin nombre sí, si tiene teléfono', () => {
    expect(contactosDelCliente({ ...vacio, phone: '+34 600 0' })).toEqual(['Contacto principal'])
    expect(contactosDelCliente(vacio)).toEqual([])
    expect(contactosDelCliente(null)).toEqual([])
  })
  it('el mismo nombre dos veces es uno', () => {
    expect(contactosDelCliente({ ...vacio, first_name: 'Marc', alternative_phone_1_note: 'Marc' })).toEqual(['Marc'])
  })
})
