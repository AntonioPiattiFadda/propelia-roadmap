import { describe, expect, it } from 'vitest'
import type { CrmStage } from '../types'
import { catalogoDeEtapas, etapaDelLead, etapaSiguiente, etapasVivas } from './effectiveStage'

const etapa = (over: Partial<CrmStage>): CrmStage => ({
  id: 's1', label: 'Nuevo', value: 'NEW', position: 1, priority_id: 'p1', is_out_of_funnel: false,
  allow_delete: false, allow_reorder: false, allow_rename: true, management_tolerance_hours: 24, management_type: null,
  created_at: '', updated_at: '', deleted_at: null, ...over,
})

describe('etapaDelLead', () => {
  const catalogo = catalogoDeEtapas(
    [etapa({}), etapa({ id: 's2', label: 'Vieja', position: 2, deleted_at: '2026-09-01T00:00:00Z' })],
  )
  it('resuelve la etapa por id', () => {
    expect(etapaDelLead({ funnel_stage_id: 's1' }, catalogo)?.label).toBe('Nuevo')
  })
  // Review Focus 2: un lead sin etapa o con una que ya no está en el catálogo no revienta.
  it('funnel_stage_id null → null', () => {
    expect(etapaDelLead({ funnel_stage_id: null }, catalogo)).toBeNull()
  })
  it('un id que no está en el catálogo → null', () => {
    expect(etapaDelLead({ funnel_stage_id: 'nada' }, catalogo)).toBeNull()
  })
  it('una etapa borrada (soft) todavía se lee con su nombre', () => {
    expect(etapaDelLead({ funnel_stage_id: 's2' }, catalogo)).toMatchObject({ label: 'Vieja' })
  })
  it('etapasVivas saca las borradas y ordena por posición', () => {
    expect(etapasVivas(catalogo.values()).map(e => e.id)).toEqual(['s1'])
  })
  it('etapasVivas deja Descartado al final aunque tenga una posición anterior', () => {
    expect(etapasVivas([
      etapa({ id: 'desc', value: 'DISCARDED', is_out_of_funnel: true, position: 3 }),
      etapa({ id: 'nueva', position: 5 }),
      etapa({ id: 'primera', position: 1 }),
    ]).map(e => e.id)).toEqual(['primera', 'nueva', 'desc'])
  })
})

describe('etapaSiguiente', () => {
  const catalogo = catalogoDeEtapas([
    etapa({ id: 'a', label: 'Nuevo', position: 1 }),
    etapa({ id: 'b', label: 'Borrada', position: 2, deleted_at: '2026-09-01T00:00:00Z' }),
    etapa({ id: 'c', label: 'Contactado', position: 3 }),
    etapa({ id: 'x', label: 'Descartado', position: 4, is_out_of_funnel: true }),
    etapa({ id: 'd', label: 'Demo', position: 5 }),
  ])
  const siguiente = (id: string | null) => etapaSiguiente({ funnel_stage_id: id }, catalogo)?.id ?? null

  it('la próxima viva por posición, salteando las borradas', () => {
    expect(siguiente('a')).toBe('c')
  })
  it('saltea las que están fuera del funnel', () => {
    expect(siguiente('c')).toBe('d')
  })
  it('desde la última no hay siguiente', () => {
    expect(siguiente('d')).toBeNull()
  })
  it('un lead fuera del funnel (descartado) no se avanza', () => {
    expect(siguiente('x')).toBeNull()
  })
  it('desde una etapa borrada sigue por su posición', () => {
    expect(siguiente('b')).toBe('c')
  })
  it('sin etapa, la primera del funnel', () => {
    expect(siguiente(null)).toBe('a')
  })
})
