import { describe, expect, it } from 'vitest'
import { tareasDeCierreDeDemo } from './cierreDeDemo'

describe('tareasDeCierreDeDemo', () => {
  it('cerrar venta a los 5 días de la demo y con promoción a los 10, a las 10:00', () => {
    expect(tareasDeCierreDeDemo('2026-11-10T15:00:00Z')).toEqual([
      { title: 'Cerrar venta', due_date: '2026-11-15', due_time: '10:00' },
      { title: 'Cerrar venta con promoción (descuento)', due_date: '2026-11-20', due_time: '10:00' },
    ])
  })
  it('cuenta desde el día de la demo en España, no en UTC', () => {
    // 23:30Z del 9 son las 00:30 del 10 en Madrid.
    expect(tareasDeCierreDeDemo('2026-11-09T23:30:00Z').map(t => t.due_date)).toEqual(['2026-11-15', '2026-11-20'])
  })
  it('cruza el mes y el año', () => {
    expect(tareasDeCierreDeDemo('2026-12-28T10:00:00Z').map(t => t.due_date)).toEqual(['2027-01-02', '2027-01-07'])
  })
})
