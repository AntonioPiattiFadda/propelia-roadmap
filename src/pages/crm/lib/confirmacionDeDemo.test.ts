import { describe, expect, it } from 'vitest'
import { tareasDeConfirmacionDeDemo } from './confirmacionDeDemo'

// Noviembre es horario de invierno en España (UTC+1): las 09:30 de Madrid son las 08:30Z.
const ANTES = new Date('2026-11-04T12:00:00Z')

describe('tareasDeConfirmacionDeDemo', () => {
  it('demo antes de las 11:30: una el día anterior y otra el mismo día, las dos a las 10:00', () => {
    expect(tareasDeConfirmacionDeDemo('2026-11-10T08:30:00Z', ANTES)).toEqual([
      { title: 'Confirmar la demo de mañana a las 09:30', due_date: '2026-11-09', due_time: '10:00' },
      { title: 'Confirmar la demo de hoy a las 09:30', due_date: '2026-11-10', due_time: '10:00' },
    ])
  })
  it('antes de las 11:30 (11:15) también lleva la del día anterior', () => {
    expect(tareasDeConfirmacionDeDemo('2026-11-10T10:15:00Z', ANTES)).toEqual([
      { title: 'Confirmar la demo de mañana a las 11:15', due_date: '2026-11-09', due_time: '10:00' },
      { title: 'Confirmar la demo de hoy a las 11:15', due_date: '2026-11-10', due_time: '10:00' },
    ])
  })
  it('a las 11:30 en punto ya no lleva la del día anterior', () => {
    expect(tareasDeConfirmacionDeDemo('2026-11-10T10:30:00Z', ANTES)).toEqual([
      { title: 'Confirmar la demo de hoy a las 11:30', due_date: '2026-11-10', due_time: '10:00' },
    ])
  })
  it('a la tarde, solo la del mismo día', () => {
    expect(tareasDeConfirmacionDeDemo('2026-11-10T15:00:00Z', ANTES)).toEqual([
      { title: 'Confirmar la demo de hoy a las 16:00', due_date: '2026-11-10', due_time: '10:00' },
    ])
  })
  it('si las 10:00 del día anterior ya pasaron, solo la del mismo día', () => {
    // Agendada a las 18:00 de Madrid para mañana a las 09:00.
    expect(tareasDeConfirmacionDeDemo('2026-11-05T08:00:00Z', new Date('2026-11-04T17:00:00Z'))).toEqual([
      { title: 'Confirmar la demo de hoy a las 09:00', due_date: '2026-11-05', due_time: '10:00' },
    ])
  })
  it('la del mismo día va siempre, aunque las 10:00 de ese día ya hayan pasado', () => {
    expect(tareasDeConfirmacionDeDemo('2026-11-04T16:00:00Z', ANTES)).toHaveLength(1)
  })
  it('el día y la hora son los de España, no los del instante en UTC', () => {
    // 23:30Z del 9 son las 00:30 del 10 en Madrid: la demo es el 10 y el aviso el 9.
    expect(tareasDeConfirmacionDeDemo('2026-11-09T23:30:00Z', ANTES).map(t => t.due_date)).toEqual(['2026-11-09', '2026-11-10'])
  })
  it('cruza el mes y el cambio de hora', () => {
    expect(tareasDeConfirmacionDeDemo('2026-12-01T08:00:00Z', ANTES)[0].due_date).toBe('2026-11-30')
    // 30/3/2026 ya es horario de verano (UTC+2); el 29 es el día del cambio.
    expect(tareasDeConfirmacionDeDemo('2026-03-30T07:30:00Z', new Date('2026-03-01T12:00:00Z'))).toEqual([
      { title: 'Confirmar la demo de mañana a las 09:30', due_date: '2026-03-29', due_time: '10:00' },
      { title: 'Confirmar la demo de hoy a las 09:30', due_date: '2026-03-30', due_time: '10:00' },
    ])
  })
})
