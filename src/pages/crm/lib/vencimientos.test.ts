import { describe, expect, it } from 'vitest'
import { opcionesDeVencimiento } from './vencimientos'

describe('opcionesDeVencimiento', () => {
  it('un lunes: hoy, mañana, el resto de la semana hasta el viernes y después los saltos', () => {
    expect(opcionesDeVencimiento('2026-10-12')).toEqual([
      { label: 'Hoy', value: '2026-10-12' },
      { label: 'Mañana', value: '2026-10-13' },
      { label: 'Miércoles', value: '2026-10-14' },
      { label: 'Jueves', value: '2026-10-15' },
      { label: 'Viernes', value: '2026-10-16' },
      { label: 'En 1 semana', value: '2026-10-19' },
      { label: 'En 2 semanas', value: '2026-10-26' },
      { label: 'En 1 mes', value: '2026-11-12' },
    ])
  })

  it('un viernes no ofrece días de la semana: ya no quedan hábiles', () => {
    expect(opcionesDeVencimiento('2026-10-16').map(o => o.label))
      .toEqual(['Hoy', 'En 1 semana', 'En 2 semanas', 'En 1 mes'])
  })

  it('un sábado tampoco', () => {
    expect(opcionesDeVencimiento('2026-10-17').map(o => o.label))
      .toEqual(['Hoy', 'En 1 semana', 'En 2 semanas', 'En 1 mes'])
  })

  it('el mes se corta en el último día cuando el siguiente es más corto', () => {
    const mes = opcionesDeVencimiento('2026-01-31').find(o => o.label === 'En 1 mes')
    expect(mes?.value).toBe('2026-02-28')
  })

  it('el mes cruza de año', () => {
    const mes = opcionesDeVencimiento('2026-12-15').find(o => o.label === 'En 1 mes')
    expect(mes?.value).toBe('2027-01-15')
  })
})
