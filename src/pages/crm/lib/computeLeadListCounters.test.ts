import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, CrmStage } from '../types'
import { computeLeadListCounters } from './computeLeadListCounters'
import { filtrosVacios, type LeadFilterContext } from './leadFilters'

const NOW = new Date(2026, 8, 30, 12).getTime()
const etapa = (id: string, over: Partial<CrmStage> = {}): CrmStage => ({
  id, label: id, value: id, position: 1, priority_id: null, is_out_of_funnel: false, allow_delete: true,
  allow_reorder: true, allows_tasks: true, allow_rename: true, management_tolerance_hours: 24, management_type: null, created_at: '', updated_at: '',
  deleted_at: null, ...over,
})
const ctx: LeadFilterContext = {
  overdueLeadIds: new Set(['p']),
  leadIdsParaHoy: new Set(['g', 'p', 'd']),
  leadIdsConTareas: new Set(['g', 'p', 'd']),
  etapas: new Map([['n', etapa('n')], ['d', etapa('d', { value: 'DISCARDED', is_out_of_funnel: true })]]),
  now: NOW,
}
const lead = (id: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: id, assigned_to: 'u', funnel_stage_id: 'n', channel_id: null, discard_reason: null, recontact_at: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: new Date(2026, 8, 1).toISOString(), updated_at: '', deleted_at: null, client: null, ...over,
})

describe('computeLeadListCounters', () => {
  const leads = [lead('g'), lead('p'), lead('z'), lead('d', { funnel_stage_id: 'd' })]
  const c = computeLeadListCounters(leads, { ...filtrosVacios(), stageFilter: new Set(['n']) }, ctx)

  it('tareas vencidas', () => expect(c.overdueLeadCount).toBe(1))
  // d tiene tareas pero está descartado y escondido: quedan g y p.
  it('con tareas pendientes, sin su propio filtro', () => {
    expect(c.conTareasCount).toBe(2)
    expect(computeLeadListCounters(leads, { ...filtrosVacios(), conTareas: true }, ctx).conTareasCount).toBe(2)
  })
  // z es el único visible sin pendientes (d está descartado y escondido).
  it('sin tareas pendientes, sin su propio filtro', () => {
    expect(c.sinTareasCount).toBe(1)
    expect(computeLeadListCounters(leads, { ...filtrosVacios(), conTareas: true }, ctx).sinTareasCount).toBe(1)
  })
  it('una etapa sola', () => expect(c.stageCount('n')).toBe(3))
  it('elegir la etapa Descartado cuenta a los descartados', () => expect(c.stageCount('d')).toBe(1))
  it('lo que queda con todo puesto', () => expect(c.matchingCount).toBe(3))
  // d tiene una para hoy pero está descartado: quedan g y p.
  it('tareas para hoy y vencidas, prendido o no', () => {
    expect(c.paraHoyCount).toBe(2)
    expect(computeLeadListCounters(leads, { ...filtrosVacios(), paraHoy: true }, ctx).paraHoyCount).toBe(2)
  })
})

describe('para recontactar', () => {
  const leads = [
    lead('g'),
    lead('r', { funnel_stage_id: 'd', recontact_at: '2026-09-30' }),
    lead('f', { funnel_stage_id: 'd', recontact_at: '2027-03-30' }),
  ]
  it('cuenta los descartados con la fecha cumplida, prendido o no', () => {
    expect(computeLeadListCounters(leads, filtrosVacios(), ctx).recontactarCount).toBe(1)
    expect(computeLeadListCounters(leads, { ...filtrosVacios(), paraRecontactar: true }, ctx).recontactarCount).toBe(1)
    expect(computeLeadListCounters(leads, filtrosVacios(), ctx).pendienteAgendarCount).toBe(0)
  })
})
