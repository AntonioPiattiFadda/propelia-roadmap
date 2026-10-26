import { describe, expect, it } from 'vitest'
import type { AgendaEvent } from './agendaEvents'
import { eventosEnHoraDeEspana, horaEnTuZona, instanteDelFormulario, relojDeEspana } from './horaDeEspana'

describe('horaEnTuZona', () => {
  const instante = new Date('2026-11-10T09:00:00Z') // 10:00 en España
  it('la hora de quien agenda, en Venezuela', () => {
    expect(horaEnTuZona(instante, '2026-11-10', 'America/Caracas')).toBe('05:00')
  })
  it('avisa si en tu zona cae otro día', () => {
    expect(horaEnTuZona(new Date('2026-11-10T00:30:00Z'), '2026-11-10', 'America/Caracas')).toBe('20:30 (día anterior)')
  })
  it('en España no dice nada: es la misma hora', () => {
    expect(horaEnTuZona(instante, '2026-11-10', 'Europe/Madrid')).toBeNull()
  })
})

describe('relojDeEspana', () => {
  it('lee el día, la hora y los minutos del reloj de España, con horario de verano', () => {
    expect(relojDeEspana('2026-07-10T08:30:00Z')).toEqual({ ymd: '2026-07-10', hora: '10:30', minutos: 630 })
  })
  it('y con el de invierno', () => {
    expect(relojDeEspana('2026-11-10T08:30:00Z')).toEqual({ ymd: '2026-11-10', hora: '09:30', minutos: 570 })
  })
  it('cambia de día cuando en España ya es mañana', () => {
    expect(relojDeEspana('2026-11-10T23:30:00Z').ymd).toBe('2026-11-11')
  })
})

describe('instanteDelFormulario', () => {
  it('con hora de España, las 10:00 son las 10:00 de Madrid sea cual sea la zona del navegador', () => {
    expect(instanteDelFormulario('2026-11-10', '10:00', true).toISOString()).toBe('2026-11-10T09:00:00.000Z')
    expect(instanteDelFormulario('2026-07-10', '10:00', true).toISOString()).toBe('2026-07-10T08:00:00.000Z')
  })
  it('sin ella, la hora local del navegador, como siempre', () => {
    expect(instanteDelFormulario('2026-11-10', '10:00', false).getTime()).toBe(new Date('2026-11-10T10:00').getTime())
  })
})

describe('eventosEnHoraDeEspana', () => {
  const evento = (e: Partial<AgendaEvent>): AgendaEvent => ({
    id: 'a', title: 'Demo', startIso: '', endIso: '', isAllDay: false, source: 'meeting', colorId: null, ...e,
  })
  it('pasa los eventos con hora al reloj de España, sin zona: la grilla los lee como locales', () => {
    const [e] = eventosEnHoraDeEspana([evento({ startIso: '2026-11-10T09:00:00+00:00', endIso: '2026-11-10T10:00:00+00:00' })])
    expect([e.startIso, e.endIso]).toEqual(['2026-11-10T10:00:00', '2026-11-10T11:00:00'])
    expect(new Date(e.startIso).getHours()).toBe(10)
  })
  it('el día del evento es el de España', () => {
    const [e] = eventosEnHoraDeEspana([evento({ startIso: '2026-11-10T23:30:00Z', endIso: '2026-11-11T00:30:00Z' })])
    expect(e.startIso.slice(0, 10)).toBe('2026-11-11')
  })
  it('los de todo el día no se tocan', () => {
    const todoElDia = evento({ startIso: '2026-11-10', endIso: '2026-11-11', isAllDay: true })
    expect(eventosEnHoraDeEspana([todoElDia])).toEqual([todoElDia])
  })
})
