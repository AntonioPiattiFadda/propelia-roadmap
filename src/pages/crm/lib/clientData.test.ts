import { describe, expect, it } from 'vitest'
import { esTelefonoDeOficina, telefonosDelCliente } from './clientData'
import {
  campoDelNuevoDecisor, casilleroDelTelefonoNuevo, casilleroParaTelefonoDeGoogle, contactoDelCliente, contactosConDecisor, contactosDelCliente, decisorDelContactoNuevo, decisorSabido, decisoresDeLaLlamada, EMPTY_CLIENT, esTelefonoDeIdealista, copiasDelTelefonoDeIdealista,
  conDecisorApuntado, inicialesDe, MISSING_CONTACT_ERROR, nombreDelLead, patchDeContactosNuevos, tieneDecisor, validateClientData,
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

describe('decisoresDeLaLlamada', () => {
  const laura = { nombre: 'Laura', campoDecisor: 'contact_is_decision_maker', decisor: null } as const
  const marc = { nombre: 'Marc', campoDecisor: 'alternative_phone_1_is_decision_maker', decisor: true } as const
  it('con un solo contacto elegido que decide: ese, sepa o no el perfil', () => {
    expect(decisoresDeLaLlamada([laura, marc], ['Laura'], true, {})).toEqual(['contact_is_decision_maker'])
    expect(decisoresDeLaLlamada([laura, marc], ['Marc'], true, {})).toEqual(['alternative_phone_1_is_decision_maker'])
  })
  it('con varios elegidos: solo los que el perfil ya da por decisores', () => {
    expect(decisoresDeLaLlamada([laura, marc], ['Laura', 'Marc'], true, {})).toEqual(['alternative_phone_1_is_decision_maker'])
  })
  it('el escrito a mano que se cargó como decisor', () => {
    expect(decisoresDeLaLlamada([], ['Pedro'], true, { alternative_phone_2_note: 'Pedro', alternative_phone_2_is_decision_maker: true }))
      .toEqual(['alternative_phone_2_is_decision_maker'])
  })
  it('sin decisor en la llamada: ninguno', () => {
    expect(decisoresDeLaLlamada([laura, marc], ['Marc'], false, {})).toEqual([])
  })
})

describe('casilleroDelTelefonoNuevo', () => {
  const vacio = {
    first_name: null, last_name: null, phone: null,
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('va al contacto con quien se habló, si no tiene número', () => {
    expect(casilleroDelTelefonoNuevo({ ...vacio, phone: '+34 600', alternative_phone_1_note: 'Ana' }, 'alternative_phone_1_is_decision_maker'))
      .toBe('alternative_phone_1')
    expect(casilleroDelTelefonoNuevo({ ...vacio, first_name: 'Pedro' }, 'contact_is_decision_maker')).toBe('phone')
  })
  it('si ese contacto ya tiene número, o no se sabe con quién, va al primer casillero libre', () => {
    expect(casilleroDelTelefonoNuevo({ ...vacio, first_name: 'Pedro', phone: '+34 600' }, 'contact_is_decision_maker'))
      .toBe('alternative_phone_1')
    expect(casilleroDelTelefonoNuevo(vacio, null)).toBe('phone')
    expect(casilleroDelTelefonoNuevo({ ...vacio, first_name: 'Pedro' }, null)).toBe('alternative_phone_1')
  })
  it('la persona escrita a mano en la misma llamada se encuentra por su casillero nuevo', () => {
    const { patch } = patchDeContactosNuevos({ ...vacio, phone: '1' }, ['Ana'], null)
    expect(decisorDelContactoNuevo(patch, 'Ana')).toBe('alternative_phone_1_is_decision_maker')
    expect(decisorDelContactoNuevo(patch, 'Marc')).toBeNull()
    expect(casilleroDelTelefonoNuevo({ ...vacio, phone: '1', ...patch }, 'alternative_phone_1_is_decision_maker')).toBe('alternative_phone_1')
  })
  it('sin casillero libre no se pisa a nadie', () => {
    expect(casilleroDelTelefonoNuevo({
      ...vacio, phone: '1', alternative_phone_1: '2', alternative_phone_2_note: 'Ana', alternative_phone_2: '3',
    }, 'alternative_phone_2_is_decision_maker')).toBeNull()
  })
})

describe('patchDeContactosNuevos', () => {
  const vacio = {
    first_name: null, last_name: null, phone: null,
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('el principal vacío del todo se lleva el primero; después los alternativos libres', () => {
    expect(patchDeContactosNuevos(vacio, ['Pedro', 'Ana'], null))
      .toEqual({ patch: { first_name: 'Pedro', alternative_phone_1_note: 'Ana' }, sinLugar: [] })
  })
  it('un principal con teléfono o nombre no se pisa', () => {
    expect(patchDeContactosNuevos({ ...vacio, phone: '+34 600 0' }, ['Pedro'], null).patch)
      .toEqual({ alternative_phone_1_note: 'Pedro' })
  })
  it('un alternativo con número o nombre ya es alguien: se salta', () => {
    expect(patchDeContactosNuevos({ ...vacio, first_name: 'Laura', alternative_phone_1: '+34 600 1' }, ['Pedro'], null).patch)
      .toEqual({ alternative_phone_2_note: 'Pedro' })
  })
  it('sin casilleros libres no se carga y se avisa quién quedó afuera', () => {
    const lleno = { ...vacio, first_name: 'Laura', alternative_phone_1_note: 'Marc', alternative_phone_2_note: 'Ana' }
    expect(patchDeContactosNuevos(lleno, ['Pedro'], null)).toEqual({ patch: {}, sinLugar: ['Pedro'] })
  })
  it('el decisor se marca solo si el nuevo es el único con quien se habló y es decisor', () => {
    expect(patchDeContactosNuevos(vacio, ['Pedro'], 'Pedro').patch)
      .toEqual({ first_name: 'Pedro', contact_is_decision_maker: true })
    expect(patchDeContactosNuevos({ ...vacio, phone: '+34 600 0' }, ['Pedro'], 'Pedro').patch)
      .toEqual({ alternative_phone_1_note: 'Pedro', alternative_phone_1_is_decision_maker: true })
    expect(patchDeContactosNuevos(vacio, ['Pedro'], null).patch).toEqual({ first_name: 'Pedro' })
  })
})

describe('tieneDecisor', () => {
  const vacio = {
    first_name: null, last_name: null, phone: null,
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('alguien marcado como decisor: sí', () => {
    expect(tieneDecisor({ ...vacio, alternative_phone_1_note: 'Marc', alternative_phone_1_is_decision_maker: true })).toBe(true)
  })
  it('nadie marcado, o marcados como no decisores: no', () => {
    expect(tieneDecisor({ ...vacio, first_name: 'Laura', contact_is_decision_maker: false })).toBe(false)
    expect(tieneDecisor(vacio)).toBe(false)
    expect(tieneDecisor(null)).toBe(false)
  })
  it('una marca en un casillero sin nadie no cuenta', () => {
    expect(tieneDecisor({ ...vacio, alternative_phone_2_is_decision_maker: true })).toBe(false)
  })
})

describe('conDecisorApuntado', () => {
  const vacio = {
    first_name: null, last_name: null, phone: null,
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('si ya es un contacto (sin importar mayúsculas), lo marca y no lo duplica', () => {
    expect(conDecisorApuntado({ ...vacio, first_name: 'Laura', alternative_phone_1_note: 'Marc' }, {}, 'marc'))
      .toEqual({ patch: { alternative_phone_1_is_decision_maker: true }, sinLugar: false })
  })
  it('si es uno de los nuevos de esta misma actividad, marca ese casillero', () => {
    expect(conDecisorApuntado(vacio, { first_name: 'Pedro' }, 'Pedro'))
      .toEqual({ patch: { first_name: 'Pedro', contact_is_decision_maker: true }, sinLugar: false })
  })
  it('si no está, se carga en el primer casillero libre después de los nuevos, como decisor', () => {
    expect(conDecisorApuntado({ ...vacio, phone: '+34 600 0' }, { alternative_phone_1_note: 'Pedro' }, 'Marta'))
      .toEqual({ patch: { alternative_phone_1_note: 'Pedro', alternative_phone_2_note: 'Marta', alternative_phone_2_is_decision_maker: true }, sinLugar: false })
  })
  it('sin casillero libre no se carga y se avisa', () => {
    const lleno = { ...vacio, first_name: 'Laura', alternative_phone_1_note: 'Marc', alternative_phone_2_note: 'Ana' }
    expect(conDecisorApuntado(lleno, {}, 'Marta')).toEqual({ patch: {}, sinLugar: true })
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

describe('copiasDelTelefonoDeIdealista', () => {
  const sinAlternativos = {
    idealista_phone: '+34936173548',
    alternative_phone_1: null, alternative_phone_1_role: null, alternative_phone_1_notes: null, alternative_phone_1_is_decision_maker: null,
    alternative_phone_2: null, alternative_phone_2_role: null, alternative_phone_2_notes: null, alternative_phone_2_is_decision_maker: null,
  }
  it('el alternativo con el número de Idealista, aunque esté escrito distinto, es una copia', () => {
    expect(copiasDelTelefonoDeIdealista({ ...sinAlternativos, alternative_phone_2: '+34 936-17-35-48' })).toEqual([1])
  })
  it('sin teléfono de Idealista no hay copias', () => {
    expect(copiasDelTelefonoDeIdealista({ ...sinAlternativos, idealista_phone: null, alternative_phone_1: '' })).toEqual([])
  })
  it('uno con rol, notas o decisor ya es alguien: no se toca', () => {
    expect(copiasDelTelefonoDeIdealista({ ...sinAlternativos, alternative_phone_1: '+34936173548', alternative_phone_1_role: 'Dueño' })).toEqual([])
    expect(copiasDelTelefonoDeIdealista({ ...sinAlternativos, alternative_phone_1: '+34936173548', alternative_phone_1_notes: 'Llamar tarde' })).toEqual([])
    expect(copiasDelTelefonoDeIdealista({ ...sinAlternativos, alternative_phone_1: '+34936173548', alternative_phone_1_is_decision_maker: false })).toEqual([])
  })
})

describe('teléfono de oficina (el de Google Maps)', () => {
  const base = {
    first_name: null, last_name: null, phone: null, google_maps_phone: '+34 936 17 35 48',
    alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  }
  it('es oficina el número que coincide en dígitos con el de Google Maps', () => {
    expect(esTelefonoDeOficina('+34936173548', base)).toBe(true)
    expect(esTelefonoDeOficina('+34 600', base)).toBe(false)
    expect(esTelefonoDeOficina('', { google_maps_phone: null })).toBe(false)
  })
  it('la oficina sin nombre no es una persona con la que se habla', () => {
    expect(contactosDelCliente({ ...base, phone: '+34 600 1', alternative_phone_1: '+34936173548' })).toEqual(['Contacto principal'])
    expect(contactosDelCliente({ ...base, phone: '+34936173548', alternative_phone_1: '+34 600 2', alternative_phone_1_note: 'Marc' })).toEqual(['Marc'])
  })
  it('con nombre escrito sí es una persona, aunque atienda en el de la oficina', () => {
    expect(contactosDelCliente({ ...base, phone: '+34936173548', first_name: 'Laura' })).toEqual(['Laura'])
  })
  it('a qué teléfono se puede llamar: la oficina y el de cada contacto, sin repetir', () => {
    expect(telefonosDelCliente({ ...base, phone: '+34 600 1', first_name: 'Laura', alternative_phone_1: '+34 936-17-35-48' }))
      .toEqual([{ numero: '+34 600 1', etiqueta: 'Laura' }, { numero: '+34 936-17-35-48', etiqueta: 'Oficina' }])
  })
  it('el de Google Maps entra como oficina aunque no esté en ningún contacto', () => {
    expect(telefonosDelCliente({ ...base, alternative_phone_2: '+34 600 2' }))
      .toEqual([{ numero: '+34 600 2', etiqueta: '+34 600 2' }, { numero: '+34 936 17 35 48', etiqueta: 'Oficina' }])
  })
})
