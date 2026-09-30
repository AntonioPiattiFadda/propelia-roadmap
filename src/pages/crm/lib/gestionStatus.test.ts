import { describe, expect, it } from 'vitest'
import {
  aplicarGestionOptimista, claveDeGestion, gestionDeLead, getGestionStatus, type LeadGestion,
} from './gestionStatus'

// Portado de propelia-frontend (src/tests/gestion-status.test.ts) sin los casos de cruces con
// propiedades (reset del sistema), que acá no existen.
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m, d, h, mi, 0, 0).toISOString()
const ev = (iso: string, id = 'e1', action: 'MANUAL' | 'POSTPONED' = 'MANUAL', createdAt = iso) =>
  ({ id, effective_at: iso, created_at: createdAt, action })
// 2026-07-13 20:00 hora local
const NOW = new Date(2026, 6, 13, 20, 0, 0, 0).getTime()

describe('getGestionStatus', () => {
  it('sin tolerancia ("Nunca"): Gestionado verde', () => {
    for (const tolerance of [null, undefined, 0] as const) {
      expect(getGestionStatus([], tolerance, local(2026, 6, 13, 8), NOW))
        .toMatchObject({ label: 'Gestionado', variant: 'green', postponed: false })
    }
  })
  it('sin tolerancia: una postergación a futuro igual marca postponed', () => {
    const s = getGestionStatus([ev(local(2026, 6, 20, 9), 'e1', 'POSTPONED')], null, local(2026, 6, 1, 8), NOW)
    expect(s).toMatchObject({ label: 'Gestionado', postponed: true })
  })
  it('sin eventos: Pendiente, con referencia en created_at', () => {
    const s = getGestionStatus([], 24, local(2026, 6, 13, 8), NOW)
    expect(s).toMatchObject({ label: 'Pendiente', variant: 'red', hasEvents: false, referenceDate: local(2026, 6, 13, 8) })
  })
  it('evento MANUAL del mismo día: Gestionado', () => {
    expect(getGestionStatus([ev(local(2026, 6, 13, 9))], 24, local(2026, 6, 1, 8), NOW).label).toBe('Gestionado')
  })
  it('usa el evento más reciente, no el primero del array', () => {
    const s = getGestionStatus([ev(local(2026, 6, 1, 10), 'a'), ev(local(2026, 6, 13, 9), 'b')], 24, local(2026, 6, 1, 8), NOW)
    expect(s.referenceDate).toBe(local(2026, 6, 13, 9))
  })
  it('evento de un día calendario anterior con 24h: Pendiente', () => {
    expect(getGestionStatus([ev(local(2026, 6, 12, 23))], 24, local(2026, 6, 1, 8), NOW).label).toBe('Pendiente')
  })
  it('168h: no vence al día siguiente, vence a los 7 días calendario', () => {
    const ref = local(2026, 6, 13, 9)
    expect(getGestionStatus([ev(ref)], 168, local(2026, 6, 1, 8), new Date(2026, 6, 14, 1).getTime()).label).toBe('Gestionado')
    expect(getGestionStatus([ev(ref)], 168, local(2026, 6, 1, 8), new Date(2026, 6, 20, 1).getTime()).label).toBe('Pendiente')
  })
  it('POSTPONED lejano: Gestionado + postponed', () => {
    const s = getGestionStatus([ev(local(2026, 9, 1, 10), 'e1', 'POSTPONED')], 24, local(2026, 6, 1, 8), NOW)
    expect(s).toMatchObject({ label: 'Gestionado', postponed: true })
  })
  it('POSTPONED vencido y ya cruzó medianoche: Pendiente como un MANUAL', () => {
    const s = getGestionStatus([ev(local(2026, 6, 11, 10), 'e1', 'POSTPONED')], 24, local(2026, 6, 1, 8), NOW)
    expect(s).toMatchObject({ label: 'Pendiente', postponed: false })
  })
})

const lead = (over: Partial<LeadGestion> = {}): LeadGestion => ({
  created_at: local(2026, 6, 1, 8),
  gestion_reference_at: null,
  gestion_postponed: false,
  gestion_has_events: false,
  ...over,
})

describe('gestionDeLead (las columnas que precalcula crm_gestion_refresh)', () => {
  it('sin referencia escrita cae a created_at, igual que la base', () => {
    expect(gestionDeLead(lead(), 24, NOW)).toMatchObject({ label: 'Pendiente', referenceDate: local(2026, 6, 1, 8) })
  })
  it('con una gestión de hoy: Gestionado', () => {
    expect(gestionDeLead(lead({ gestion_reference_at: local(2026, 6, 13, 9), gestion_has_events: true }), 24, NOW).label).toBe('Gestionado')
  })
  it('pospuesto a futuro: postponed', () => {
    const s = gestionDeLead(lead({ gestion_reference_at: local(2026, 9, 1, 9), gestion_has_events: true, gestion_postponed: true }), 24, NOW)
    expect(s.postponed).toBe(true)
  })
})

describe('claveDeGestion', () => {
  it('tres claves: pospuesto gana sobre gestionado', () => {
    expect(claveDeGestion({ label: 'Pendiente', variant: 'red', postponed: false, referenceDate: '', hasEvents: true })).toBe('pendiente')
    expect(claveDeGestion({ label: 'Gestionado', variant: 'green', postponed: false, referenceDate: '', hasEvents: true })).toBe('gestionado')
    expect(claveDeGestion({ label: 'Gestionado', variant: 'green', postponed: true, referenceDate: '', hasEvents: true })).toBe('pospuesto')
  })
})

describe('aplicarGestionOptimista (espejo de crm_gestion_refresh: gana el effective_at mayor)', () => {
  it('sin eventos previos, el nuevo manda', () => {
    const r = aplicarGestionOptimista(lead(), { action: 'MANUAL', effective_at: local(2026, 6, 13, 9) })
    expect(r).toMatchObject({ gestion_reference_at: local(2026, 6, 13, 9), gestion_has_events: true, gestion_postponed: false })
  })
  it('una gestión de hoy NO pisa una postergación a futuro', () => {
    const pospuesto = lead({ gestion_reference_at: local(2026, 9, 1, 9), gestion_has_events: true, gestion_postponed: true })
    expect(aplicarGestionOptimista(pospuesto, { action: 'MANUAL', effective_at: local(2026, 6, 13, 9) })).toBe(pospuesto)
  })
  it('posponer marca postponed', () => {
    const r = aplicarGestionOptimista(lead(), { action: 'POSTPONED', effective_at: local(2026, 9, 1, 9) })
    expect(r.gestion_postponed).toBe(true)
  })
})
