import { describe, expect, it } from 'vitest'
import { telefonoDelAlta } from './datosDelAlta'
import type { ClienteDelOnboarding } from '../types'

const cliente = (c: Partial<ClienteDelOnboarding> = {}): ClienteDelOnboarding => ({
  company_name: 'Inmo', first_name: null, last_name: null, email: null, phone: null,
  alternative_phone_1: null, alternative_phone_2: null,
  alternative_phone_1_is_decision_maker: null, alternative_phone_2_is_decision_maker: null,
  google_maps_phone: null, ...c,
})

describe('telefonoDelAlta', () => {
  it('el del responsable del equipo, primero', () => {
    expect(telefonoDelAlta({ phone: '+34600000001' }, cliente({ phone: '+34600000002' }))).toBe('+34600000001')
  })
  it('sin él, el principal del CRM', () => {
    expect(telefonoDelAlta({ phone: null }, cliente({ phone: '+34600000002' }))).toBe('+34600000002')
  })
  it('el alternativo del decisor antes que el otro', () => {
    expect(telefonoDelAlta(null, cliente({ alternative_phone_1: '+34600000003', alternative_phone_2: '+34600000004', alternative_phone_2_is_decision_maker: true })))
      .toBe('+34600000004')
  })
  it('el de la oficina (Google Maps) como último recurso', () => {
    expect(telefonoDelAlta({ phone: ' ' }, cliente({ google_maps_phone: '+34655109096' }))).toBe('+34655109096')
  })
  it('sin ninguno, null', () => {
    expect(telefonoDelAlta(null, cliente())).toBeNull()
  })
})
