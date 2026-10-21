import { describe, it, expect } from 'vitest'
import { groupAgendaByDay } from './googleAgenda'

describe('groupAgendaByDay', () => {
  const days = ['2026-08-03', '2026-08-04', '2026-08-05']

  it('agrupa eventos con horario por su fecha de inicio', () => {
    const grouped = groupAgendaByDay(
      [
        { id: 'ev1', summary: 'Visita 1', start: '2026-08-04T15:00:00-03:00', end: '2026-08-04T16:00:00-03:00', isAllDay: false },
        { id: 'ev2', summary: 'Visita 2', start: '2026-08-04T18:00:00-03:00', end: '2026-08-04T19:00:00-03:00', isAllDay: false },
      ],
      days,
    )
    expect(grouped['2026-08-04']).toHaveLength(2)
    expect(grouped['2026-08-03']).toEqual([])
    expect(grouped['2026-08-05']).toEqual([])
  })

  it('agrupa eventos de día completo por su fecha (sin recortar)', () => {
    const grouped = groupAgendaByDay(
      [{ id: 'ev3', summary: 'Feriado', start: '2026-08-05', end: '2026-08-06', isAllDay: true }],
      days,
    )
    expect(grouped['2026-08-05']).toEqual([
      { id: 'ev3', summary: 'Feriado', start: '2026-08-05', end: '2026-08-06', isAllDay: true },
    ])
  })

  it('ignora eventos fuera del rango de días pedido', () => {
    const grouped = groupAgendaByDay(
      [{ id: 'ev4', summary: 'Otra semana', start: '2026-08-10T10:00:00-03:00', end: '2026-08-10T11:00:00-03:00', isAllDay: false }],
      days,
    )
    expect(Object.values(grouped).flat()).toEqual([])
  })

  it('sin eventos, todos los días quedan con lista vacía', () => {
    const grouped = groupAgendaByDay([], days)
    expect(grouped).toEqual({ '2026-08-03': [], '2026-08-04': [], '2026-08-05': [] })
  })
})
