import { describe, expect, it } from 'vitest'
import type { CrmPriority, CrmStage } from '../types'
import { catalogoDeEtapas, etapaDelLead, etapasVivas } from './effectiveStage'

const prio = (over: Partial<CrmPriority>): CrmPriority => ({
  id: 'p1', name: 'Verde', color: '#639922', position: 1, management_tolerance_hours: 24,
  show_in_filters: true, created_at: '', updated_at: '', deleted_at: null, ...over,
})
const etapa = (over: Partial<CrmStage>): CrmStage => ({
  id: 's1', label: 'Nuevo', value: 'NEW', position: 1, priority_id: 'p1', is_out_of_funnel: false,
  allow_delete: false, allow_reorder: false, allow_rename: true, management_tolerance_hours: 24,
  created_at: '', updated_at: '', deleted_at: null, ...over,
})

describe('etapaDelLead', () => {
  const catalogo = catalogoDeEtapas(
    [etapa({}), etapa({ id: 's2', label: 'Vieja', position: 2, deleted_at: '2026-09-01T00:00:00Z', priority_id: null })],
    [prio({})],
  )
  it('resuelve la etapa con su prioridad', () => {
    expect(etapaDelLead({ funnel_stage_id: 's1' }, catalogo)?.priority?.color).toBe('#639922')
  })
  // Review Focus 2: un lead sin etapa o con una que ya no está en el catálogo no revienta.
  it('funnel_stage_id null → null', () => {
    expect(etapaDelLead({ funnel_stage_id: null }, catalogo)).toBeNull()
  })
  it('un id que no está en el catálogo → null', () => {
    expect(etapaDelLead({ funnel_stage_id: 'nada' }, catalogo)).toBeNull()
  })
  it('una etapa borrada (soft) todavía se lee con su nombre, sin prioridad', () => {
    expect(etapaDelLead({ funnel_stage_id: 's2' }, catalogo)).toMatchObject({ label: 'Vieja', priority: null })
  })
  it('etapasVivas saca las borradas y ordena por posición', () => {
    expect(etapasVivas(catalogo.values()).map(e => e.id)).toEqual(['s1'])
  })
})
