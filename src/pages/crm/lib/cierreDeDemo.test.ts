import { describe, expect, it } from 'vitest'
import { responsableDelCierre, tareasDeCierreDeDemo } from './cierreDeDemo'

describe('tareasDeCierreDeDemo', () => {
  it('cerrar venta a los 3 días de la demo y con promoción a los 7, a las 10:00', () => {
    expect(tareasDeCierreDeDemo('2026-11-10T15:00:00Z')).toEqual([
      { title: 'Cerrar venta', due_date: '2026-11-13', due_time: '10:00' },
      { title: 'Cerrar venta con promoción (descuento)', due_date: '2026-11-17', due_time: '10:00' },
    ])
  })
  it('cuenta desde el día de la demo en España, no en UTC', () => {
    // 23:30Z del 9 son las 00:30 del 10 en Madrid.
    expect(tareasDeCierreDeDemo('2026-11-09T23:30:00Z').map(t => t.due_date)).toEqual(['2026-11-13', '2026-11-17'])
  })
  it('cruza el mes y el año', () => {
    expect(tareasDeCierreDeDemo('2026-12-28T10:00:00Z').map(t => t.due_date)).toEqual(['2026-12-31', '2027-01-04'])
  })
})

describe('responsableDelCierre', () => {
  const sdr = { id: 'sdr', email: 'ana@propelia.es', activo: true }
  const lorenzo = { id: 'lorenzo', email: 'lorenzopiattifadda@gmail.com', activo: true }

  it('es siempre Lorenzo, no quien agenda', () => {
    expect(responsableDelCierre([sdr, lorenzo])).toBe('lorenzo')
  })
  it('compara el email sin mayúsculas ni espacios', () => {
    expect(responsableDelCierre([{ ...lorenzo, email: ' LorenzoPiattiFadda@gmail.com ' }])).toBe('lorenzo')
  })
  it('sin Lorenzo activo no hay a quién asignarlas', () => {
    expect(responsableDelCierre([sdr, { ...lorenzo, activo: false }])).toBeNull()
    expect(responsableDelCierre([sdr])).toBeNull()
  })
})
