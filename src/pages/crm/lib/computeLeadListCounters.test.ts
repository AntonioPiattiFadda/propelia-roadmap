import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, EtapaConPrioridad } from '../types'
import { computeLeadListCounters } from './computeLeadListCounters'
import { filtrosVacios, PRIORITY_NONE, type LeadFilterContext } from './leadFilters'

const NOW = new Date(2026, 8, 30, 12).getTime()
const etapa = (id: string, over: Partial<EtapaConPrioridad> = {}): EtapaConPrioridad => ({
  id, label: id, value: id, position: 1, priority_id: null, is_out_of_funnel: false, allow_delete: true,
  allow_reorder: true, allow_rename: true, management_tolerance_hours: 24, created_at: '', updated_at: '',
  deleted_at: null, priority: null, ...over,
})
const ctx: LeadFilterContext = {
  overdueLeadIds: new Set(['p']),
  etapas: new Map([['n', etapa('n')], ['d', etapa('d', { value: 'DISCARDED', is_out_of_funnel: true })]]),
  now: NOW,
}
const lead = (id: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: id, assigned_to: 'u', funnel_stage_id: 'n', channel_id: null, discard_reason: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: new Date(2026, 8, 1).toISOString(), updated_at: '', deleted_at: null, client: null, ...over,
})

describe('computeLeadListCounters', () => {
  const leads = [
    lead('g'),
    lead('p', { gestion_has_events: false }),
    lead('z', { gestion_reference_at: new Date(2026, 10, 1).toISOString(), gestion_postponed: true }),
    // Sin eventos: si no, cuenta como «gestionado» y el filtro de gestión lo saca de los conteos.
    lead('d', { funnel_stage_id: 'd', gestion_has_events: false }),
  ]
  const c = computeLeadListCounters(leads, { ...filtrosVacios(), gestionExcluded: new Set(['gestionado']) }, ctx)

  it('gestión cuenta sin su propio filtro, y sin los descartados escondidos', () => {
    expect([c.gestionTotal, c.pendienteCount, c.gestionadoCount, c.pospuestoCount]).toEqual([3, 1, 1, 1])
  })
  it('tareas vencidas', () => expect(c.overdueLeadCount).toBe(1))
  it('una etapa sola', () => expect(c.stageCount('n')).toBe(2)) // g queda afuera por el filtro de gestión
  it('elegir la etapa Descartado cuenta a los descartados', () => expect(c.stageCount('d')).toBe(1))
  it('prioridad: todos caen en «Sin prioridad»', () => expect(c.priorityCount(PRIORITY_NONE)).toBe(2))
  it('descartados que aparecerían al incluirlos', () => expect(c.discardedCount).toBe(1))
  it('lo que queda con todo puesto', () => expect(c.matchingCount).toBe(2))
})
