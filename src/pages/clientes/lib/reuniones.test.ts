import { describe, expect, it } from 'vitest'
import { preguntaSiSeHizo, reunionDeLaTarea } from './reuniones'

const CLAVE = 'cartera-leads.reunion-equipo'
const reunion = (o: Partial<{ onboarding_task: string | null; status: string; deleted_at: string | null; starts_at: string; ends_at: string }> = {}) => ({
  onboarding_task: CLAVE, status: 'scheduled', deleted_at: null,
  starts_at: '2026-11-05T09:00:00Z', ends_at: '2026-11-05T10:00:00Z', ...o,
})

describe('reunionDeLaTarea', () => {
  it('solo las de esa tarea, sin borradas ni canceladas, la última primero', () => {
    const vieja = reunion({ starts_at: '2026-11-01T09:00:00Z' })
    const nueva = reunion({ starts_at: '2026-11-08T09:00:00Z' })
    const r = reunionDeLaTarea([
      vieja, nueva,
      reunion({ onboarding_task: null, starts_at: '2026-12-01T09:00:00Z' }),
      reunion({ onboarding_task: 'cartera-leads.reunion-dueno', starts_at: '2026-12-01T09:00:00Z' }),
      reunion({ deleted_at: '2026-10-31T00:00:00Z', starts_at: '2026-12-01T09:00:00Z' }),
    ], CLAVE)
    expect(r).toEqual({ activa: nueva, cancelada: false })
  })
  it('cancelada no es la activa, pero se avisa', () => {
    expect(reunionDeLaTarea([reunion({ status: 'cancelled' })], CLAVE)).toEqual({ activa: null, cancelada: true })
  })
})

describe('preguntaSiSeHizo', () => {
  const r = { activa: reunion(), cancelada: false }
  it('sin agendar, nunca', () => expect(preguntaSiSeHizo(false, r, new Date('2026-11-06'))).toBe(false))
  it('antes de que termine, no; desde que termina, sí', () => {
    expect(preguntaSiSeHizo(true, r, new Date('2026-11-05T09:30:00Z'))).toBe(false)
    expect(preguntaSiSeHizo(true, r, new Date('2026-11-05T10:00:00Z'))).toBe(true)
  })
  it('tildada sin reunión en el sistema pregunta enseguida, salvo que la hayan cancelado', () => {
    expect(preguntaSiSeHizo(true, { activa: null, cancelada: false }, new Date())).toBe(true)
    expect(preguntaSiSeHizo(true, { activa: null, cancelada: true }, new Date())).toBe(false)
  })
})
