import { describe, expect, it } from 'vitest'
import {
  campoDelNuevoDecisor, casilleroParaTelefonoDeGoogle, contactoDelCliente, contactosConDecisor, contactosDelCliente, decisorSabido, EMPTY_CLIENT, esTelefonoDeIdealista,
  inicialesDe, MISSING_CONTACT_ERROR, nombreDelLead, validateClientData,
} from './clientData'

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

describe('contactosConDecisor', () => {
  const vacio = {
    first_name: null, last_name: null, phone: null,
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('cada contacto con su columna de decisor y lo guardado (null = no se sabe)', () => {
    expect(contactosConDecisor({
      ...vacio, first_name: 'Laura', alternative_phone_2: '+34 600 2',
      contact_is_decision_maker: true, alternative_phone_2_is_decision_maker: false,
    })).toEqual([
      { nombre: 'Laura', campoDecisor: 'contact_is_decision_maker', decisor: true },
      { nombre: '+34 600 2', campoDecisor: 'alternative_phone_2_is_decision_maker', decisor: false },
    ])
  })
  it('sin la columna en la base (migración pendiente) es «no se sabe»', () => {
    expect(contactosConDecisor({ ...vacio, phone: '+34 600 0' }))
      .toEqual([{ nombre: 'Contacto principal', campoDecisor: 'contact_is_decision_maker', decisor: null }])
  })
  it('el mismo nombre dos veces es uno: el primero', () => {
    expect(contactosConDecisor({ ...vacio, first_name: 'Marc', alternative_phone_1_note: 'Marc', alternative_phone_1_is_decision_maker: true }))
      .toEqual([{ nombre: 'Marc', campoDecisor: 'contact_is_decision_maker', decisor: null }])
  })
})

describe('decisorSabido', () => {
  const laura = { nombre: 'Laura', campoDecisor: 'contact_is_decision_maker', decisor: true } as const
  const marc = { nombre: 'Marc', campoDecisor: 'alternative_phone_1_is_decision_maker', decisor: false } as const
  const ana = { nombre: 'Ana', campoDecisor: 'alternative_phone_2_is_decision_maker', decisor: null } as const
  it('si alguno de los elegidos figura como decisor, la llamada fue con un decisor', () => {
    expect(decisorSabido([laura, marc, ana], ['Marc', 'Laura'])).toBe(true)
    expect(decisorSabido([laura, ana], ['Ana', 'Laura'])).toBe(true)
  })
  it('si todos los elegidos figuran como no decisores, no lo fue', () => {
    expect(decisorSabido([laura, marc], ['Marc'])).toBe(false)
  })
  it('si falta saber de alguno, o no se eligió a nadie, hay que preguntar', () => {
    expect(decisorSabido([marc, ana], ['Marc', 'Ana'])).toBeNull()
    expect(decisorSabido([laura], [])).toBeNull()
  })
})

describe('campoDelNuevoDecisor', () => {
  const laura = { nombre: 'Laura', campoDecisor: 'contact_is_decision_maker', decisor: null } as const
  const marc = { nombre: 'Marc', campoDecisor: 'alternative_phone_1_is_decision_maker', decisor: false } as const
  it('contestó que sí con un solo contacto elegido: ese queda como decisor', () => {
    expect(campoDelNuevoDecisor([laura, marc], ['Laura'], true)).toBe('contact_is_decision_maker')
    expect(campoDelNuevoDecisor([laura, marc], ['Marc'], true)).toBe('alternative_phone_1_is_decision_maker')
  })
  it('con varios elegidos no se sabe cuál decide: no se guarda nada', () => {
    expect(campoDelNuevoDecisor([laura, marc], ['Laura', 'Marc'], true)).toBeNull()
  })
  it('contestó que no, o el elegido ya no es contacto: no se guarda nada', () => {
    expect(campoDelNuevoDecisor([laura], ['Laura'], false)).toBeNull()
    expect(campoDelNuevoDecisor([laura], ['Pedro'], true)).toBeNull()
  })
})

describe('casilleroParaTelefonoDeGoogle', () => {
  const vacio = {
    phone: null, google_maps_phone: '+34 931 23 45 67',
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('sin teléfono de Google no hay nada que agregar', () => {
    expect(casilleroParaTelefonoDeGoogle({ ...vacio, google_maps_phone: null })).toBeNull()
    expect(casilleroParaTelefonoDeGoogle({ ...vacio, google_maps_phone: '  ' })).toBeNull()
    expect(casilleroParaTelefonoDeGoogle(null)).toBeNull()
  })
  it('sin teléfono principal, va al principal', () => {
    expect(casilleroParaTelefonoDeGoogle(vacio)).toBe('phone')
  })
  it('con principal, al primer alternativo libre (sin número ni nombre)', () => {
    expect(casilleroParaTelefonoDeGoogle({ ...vacio, phone: '+34 600 000 000' })).toBe('alternative_phone_1')
    expect(casilleroParaTelefonoDeGoogle({ ...vacio, phone: '+34 600 000 000', alternative_phone_1_note: 'Marc' }))
      .toBe('alternative_phone_2')
  })
  it('si ya es uno de los contactos, aunque esté escrito distinto, no se repite', () => {
    expect(casilleroParaTelefonoDeGoogle({ ...vacio, phone: '+34931234567' })).toBeNull()
    expect(casilleroParaTelefonoDeGoogle({ ...vacio, phone: '+34 600', alternative_phone_2: '+34 931-23-45-67' })).toBeNull()
  })
  it('sin casillero libre, no se pisa a nadie', () => {
    expect(casilleroParaTelefonoDeGoogle({
      ...vacio, phone: '+34 600 1', alternative_phone_1: '+34 600 2', alternative_phone_2_note: 'Ana',
    })).toBeNull()
  })
})

describe('esTelefonoDeIdealista', () => {
  it('compara los dígitos, no el formato', () => {
    expect(esTelefonoDeIdealista('+34 936-17-35-48', { idealista_phone: '+34936173548' })).toBe(true)
    expect(esTelefonoDeIdealista('+34 600', { idealista_phone: '+34936173548' })).toBe(false)
    expect(esTelefonoDeIdealista('', { idealista_phone: null })).toBe(false)
  })
})
