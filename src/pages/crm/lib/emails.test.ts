import { describe, expect, it } from 'vitest'
import type { CrmEmail } from '../types'
import { avisosSinVer, cuandoSeMando, estadoDelEnvio, motivoLegible, noLlegaronDelLead, noLlego, sigueEnElPerfil } from './emails'

const email = (over: Partial<CrmEmail>): CrmEmail => ({
  id: 'e', resend_id: 'r', lead_id: 'L', sent_by: 'yo', to_email: 'a@b.com', subject: 'Hola', plantilla: null,
  status: 'sent', status_detail: null, status_at: null, sent_at: '2026-10-20T10:00:00Z', seen_at: null, seen_by: null, ...over,
})

describe('noLlego', () => {
  it('rebotado, fallido, suprimido y spam no llegaron; enviado, demorado y entregado sí', () => {
    expect(['bounced', 'failed', 'suppressed', 'complained'].every(s => noLlego({ status: s }))).toBe(true)
    expect(['sent', 'delivery_delayed', 'delivered'].some(s => noLlego({ status: s }))).toBe(false)
  })
})

describe('avisosSinVer', () => {
  it('solo los míos que no llegaron y no vi, el más nuevo primero', () => {
    const lista = [
      email({ id: '1', status: 'bounced', sent_at: '2026-10-20T09:00:00Z' }),
      email({ id: '2', status: 'bounced', sent_at: '2026-10-20T11:00:00Z' }),
      email({ id: '3', status: 'bounced', seen_at: '2026-10-20T12:00:00Z' }),
      email({ id: '4', status: 'delivered' }),
      email({ id: '5', status: 'failed', sent_by: 'otro' }),
    ]
    expect(avisosSinVer(lista, 'yo').map(e => e.id)).toEqual(['2', '1'])
    expect(avisosSinVer(lista, null)).toEqual([])
  })
})

describe('noLlegaronDelLead', () => {
  it('los del lead que no llegaron, vistos o no y de quien sea', () => {
    const lista = [
      email({ id: '1', status: 'bounced', seen_at: 'x' }),
      email({ id: '2', status: 'suppressed', sent_by: 'otro' }),
      email({ id: '3', status: 'delivered' }),
      email({ id: '4', status: 'bounced', lead_id: 'M' }),
    ]
    expect(noLlegaronDelLead(lista, 'L').map(e => e.id).sort()).toEqual(['1', '2'])
  })
})

describe('motivoLegible', () => {
  it('siempre en español, nunca el texto de Resend', () => {
    const duro = "The recipient's email provider sent a hard bounce message, but didn't specify the reason for the hard bounce."
    expect(motivoLegible({ status: 'bounced', status_detail: duro })).toMatch(/no existe/)
    expect(motivoLegible({ status: 'bounced', status_detail: null })).toMatch(/no existe/)
    expect(motivoLegible({ status: 'bounced', status_detail: 'Mailbox full' })).toMatch(/llena/)
    expect(motivoLegible({ status: 'bounced', status_detail: 'Message rejected due to spam content' })).toMatch(/rechazó/)
    expect(motivoLegible({ status: 'suppressed', status_detail: null })).toMatch(/rebotó antes/)
    expect(motivoLegible({ status: 'bounced', status_detail: 'The recipient is on the suppression list' })).toMatch(/rebotó antes/)
    expect(motivoLegible({ status: 'failed', status_detail: 'reached_daily_quota' })).toMatch(/tope/)
    expect(motivoLegible({ status: 'failed', status_detail: 'algo raro' })).toMatch(/No se pudo enviar/)
    expect(motivoLegible({ status: 'complained', status_detail: null })).toMatch(/spam/)
    expect(motivoLegible({ status: 'delivered', status_detail: null })).toBeNull()
  })
})

describe('sigueEnElPerfil', () => {
  it('compara sin mayúsculas ni espacios, en los tres emails', () => {
    const c = { email: 'Ana@X.com ', alternative_phone_1_email: null, alternative_phone_2_email: 'b@y.com' }
    expect(sigueEnElPerfil('ana@x.com', c)).toBe(true)
    expect(sigueEnElPerfil('b@y.com', c)).toBe(true)
    expect(sigueEnElPerfil('otro@x.com', c)).toBe(false)
    expect(sigueEnElPerfil('ana@x.com', null)).toBe(false)
  })
})

describe('cuandoSeMando', () => {
  const ahora = new Date(2026, 9, 20, 15, 0)
  it('hoy, ayer o el día', () => {
    expect(cuandoSeMando(new Date(2026, 9, 20, 9, 5).toISOString(), ahora)).toBe('hoy 09:05')
    expect(cuandoSeMando(new Date(2026, 9, 19, 23, 59).toISOString(), ahora)).toBe('ayer 23:59')
    expect(cuandoSeMando(new Date(2026, 9, 12, 10, 0).toISOString(), ahora)).toBe('12/10 10:00')
  })
})

describe('estadoDelEnvio', () => {
  it('pendiente hasta que Resend confirma; entregado o lo que falló cierran', () => {
    expect(estadoDelEnvio(null)).toMatchObject({ tono: 'pendiente', final: false })
    expect(estadoDelEnvio('sent')).toMatchObject({ tono: 'pendiente', final: false })
    expect(estadoDelEnvio('delivery_delayed')).toMatchObject({ tono: 'aviso', final: false })
    expect(estadoDelEnvio('delivered')).toMatchObject({ texto: 'Entregado', tono: 'ok', final: true })
    expect(estadoDelEnvio('bounced')).toMatchObject({ texto: 'Rebotó', tono: 'error', final: true })
  })
})
