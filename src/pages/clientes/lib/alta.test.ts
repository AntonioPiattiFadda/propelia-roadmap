import { describe, expect, it } from 'vitest'
import { cuentaDe, equipoInicial, equipoValido, erroresDelEquipo, erroresGenerales, personaVacia, separarTelefono, telefonoE164 } from './alta'

const ana = personaVacia({ nombre: 'Ana', apellido: 'Ruiz', email: 'ana@inmo.es', rol: 'admin', responsable: true })
const luis = personaVacia({ nombre: 'Luis', apellido: 'Pérez', email: 'luis@inmo.es' })

describe('erroresDelEquipo', () => {
  it('un equipo bien cargado no tiene errores', () => {
    expect(erroresDelEquipo([ana, luis]).size).toBe(0)
    expect(equipoValido([ana, luis])).toBe(true)
  })
  it('marca nombre, apellido y email', () => {
    const mal = personaVacia({ email: 'ana@' })
    expect(erroresDelEquipo([mal]).get(mal.clave)).toEqual(['Falta el nombre', 'Falta el apellido', 'Email mal escrito'])
  })
  it('el email repetido, sin importar mayúsculas, lo marca en el segundo', () => {
    const otra = { ...luis, email: 'ANA@inmo.es ' }
    expect(erroresDelEquipo([ana, otra]).get(otra.clave)).toEqual(['Email repetido'])
    expect(erroresDelEquipo([ana, otra]).has(ana.clave)).toBe(false)
  })
  it('el responsable tiene que ser Administrador', () => {
    const r = { ...ana, rol: 'agent' as const }
    expect(erroresDelEquipo([r]).get(r.clave)).toEqual(['El responsable tiene que ser Administrador'])
  })
  it('el teléfono es opcional, pero escrito tiene que estar completo', () => {
    expect(erroresDelEquipo([{ ...ana, telefono: '' }]).size).toBe(0)
    expect(erroresDelEquipo([{ ...ana, telefono: '12' }]).get(ana.clave)).toEqual(['Teléfono incompleto'])
    expect(erroresDelEquipo([{ ...ana, telefono: '637 45 81 14' }]).size).toBe(0)
  })
})

describe('erroresGenerales', () => {
  it('pide al menos una persona y exactamente un responsable', () => {
    expect(erroresGenerales([])).toEqual(['Falta cargar al menos una persona'])
    expect(erroresGenerales([luis])).toEqual(['Elegí quién es el responsable'])
    expect(erroresGenerales([ana, { ...luis, responsable: true }])).toEqual(['Solo puede haber un responsable'])
    expect(erroresGenerales([ana, luis])).toEqual([])
  })
})

describe('los teléfonos', () => {
  it('suma el prefijo elegido y saca los espacios', () => {
    expect(telefonoE164({ prefijo: '+34', telefono: '637 45 81 14' })).toBe('+34637458114')
    expect(telefonoE164({ prefijo: '+34', telefono: '+351 912 345 678' })).toBe('+351912345678')
    expect(telefonoE164({ prefijo: '+34', telefono: '' })).toBe('')
  })
  it('separa el prefijo conocido más largo', () => {
    expect(separarTelefono('+34637458114')).toEqual({ prefijo: '+34', telefono: '637458114' })
    expect(separarTelefono('+351912345678')).toEqual({ prefijo: '+351', telefono: '912345678' })
    expect(separarTelefono('637458114')).toEqual({ prefijo: '+34', telefono: '637458114' })
    expect(separarTelefono(null)).toEqual({ prefijo: '+34', telefono: '' })
  })
})

describe('equipoInicial', () => {
  it('sin equipo guardado, arranca con el contacto del CRM como responsable', () => {
    const [p, ...resto] = equipoInicial([], { first_name: 'Facundo', last_name: 'Benedetti', email: 'f@inmo.es', phone: '+34637458114' })
    expect(resto).toHaveLength(0)
    expect(p).toMatchObject({ nombre: 'Facundo', apellido: 'Benedetti', email: 'f@inmo.es', prefijo: '+34', telefono: '637458114', rol: 'admin', responsable: true })
  })
  it('con equipo guardado, lo toma con el responsable primero', () => {
    const base = { last_name: 'X', email: null, phone: null, created_at: '2026-11-01T00:00:00Z' }
    const equipo = equipoInicial([
      { ...base, first_name: 'Agente', role: 'agent', is_owner: false },
      { ...base, first_name: 'Dueño', role: 'admin', is_owner: true, created_at: '2026-11-02T00:00:00Z' },
    ], null)
    expect(equipo.map(p => [p.nombre, p.rol, p.responsable])).toEqual([['Dueño', 'admin', true], ['Agente', 'agent', false]])
  })
})

describe('cuentaDe', () => {
  it('arma la cuenta del puente con la contraseña de siempre', () => {
    expect(cuentaDe({ ...ana, email: ' Ana@Inmo.es ', telefono: '600111222' }, 2026)).toEqual({
      first_name: 'Ana', last_name: 'Ruiz', email: 'ana@inmo.es', phone: '+34600111222', role: 'admin', is_owner: true, password: 'ana.ruiz',
    })
  })
})
