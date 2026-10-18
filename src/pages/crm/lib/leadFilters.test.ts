import { describe, expect, it } from 'vitest'
import type { CrmClient, CrmLeadRow, CrmStage } from '../types'
import { filterLeads, filtrosVacios, leadsDeCarteras, type LeadFilterContext, type LeadFilterState } from './leadFilters'

const NOW = new Date(2026, 8, 30, 12).getTime()
const etapa = (id: string, over: Partial<CrmStage> = {}): CrmStage => ({
  id, label: id, value: id.toUpperCase(), position: 1, priority_id: null, is_out_of_funnel: false,
  allow_delete: true, allow_reorder: true, allow_rename: true, management_tolerance_hours: 24, management_type: null,
  created_at: '', updated_at: '', deleted_at: null, ...over,
})
const ETAPAS = new Map<string, CrmStage>([
  ['nuevo', etapa('nuevo')],
  ['descartado', etapa('descartado', { value: 'DISCARDED', is_out_of_funnel: true, management_tolerance_hours: null })],
])
const ctx = (over: Partial<LeadFilterContext> = {}): LeadFilterContext =>
  ({ overdueLeadIds: new Set(), leadIdsConTareas: new Set(), etapas: ETAPAS, now: NOW, ...over })
const cliente = (over: Partial<CrmClient> = {}): CrmClient => ({
  id: 'c', first_name: null, last_name: null, company_name: null, email: null, phone: null,
  alternative_phone_1: null, alternative_phone_1_note: null, alternative_phone_2: null, alternative_phone_2_note: null,
  notes: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
  website: null, idealista_url: null, city: null, neighborhood: null, office_address: null, agents_count: null, current_crm: null, current_crm_id: null, google_maps_url: null, sdr_advice: null, idealista_years: null, idealista_listings: null,
  contact_role: null, contact_notes: null, alternative_phone_1_role: null, alternative_phone_1_notes: null,
  alternative_phone_2_role: null, alternative_phone_2_notes: null,
  alternative_phone_1_email: null, alternative_phone_2_email: null,
  contact_is_decision_maker: null, alternative_phone_1_is_decision_maker: null, alternative_phone_2_is_decision_maker: null,
  import_batch: null, batch_activated_on: null, selection_reason: null, phone_source: null,
  alternative_phone_1_source: null, alternative_phone_2_source: null, google_maps_phone: null, idealista_phone: null,
  ...over,
})
const lead = (id: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: 'c', assigned_to: 'yo', funnel_stage_id: 'nuevo', channel_id: null, discard_reason: null, recontact_at: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: new Date(2026, 8, 1).toISOString(), updated_at: '', deleted_at: null,
  client: cliente(), ...over,
})
const f = (over: Partial<LeadFilterState>): LeadFilterState => ({ ...filtrosVacios(), ...over })

describe('buscador (Review Focus 1)', () => {
  const sinContacto = lead('a', { client: cliente({ company_name: 'Inmo Sur' }) })
  const conTel = lead('b', { client: cliente({ first_name: 'Ana', phone: '+34 600 111 222' }) })
  const sinCliente = lead('c', { client: null })

  it('encuentra por empresa aunque no tenga teléfono ni email', () => {
    expect(filterLeads([sinContacto, conTel], f({ q: 'inmo' }), ctx()).map(l => l.id)).toEqual(['a'])
  })
  it('una búsqueda de dígitos no iguala al que tiene el teléfono vacío', () => {
    expect(filterLeads([sinContacto, conTel, sinCliente], f({ q: '600 111' }), ctx()).map(l => l.id)).toEqual(['b'])
  })
  it('letras con un número no se leen como teléfono', () => {
    expect(filterLeads([conTel], f({ q: 'inmo 6' }), ctx())).toEqual([])
  })
  it('un lead sin cliente embebido no revienta', () => {
    expect(filterLeads([sinCliente], f({ q: 'algo' }), ctx())).toEqual([])
  })
  it('mayúsculas y espacios de más no importan', () => {
    expect(filterLeads([conTel], f({ q: '  ANA ' }), ctx()).map(l => l.id)).toEqual(['b'])
  })
})

describe('descartados', () => {
  const vivo = lead('v')
  const descartado = lead('d', { funnel_stage_id: 'descartado', client: cliente({ company_name: 'Muerta' }) })
  it('se esconden por defecto', () => {
    expect(filterLeads([vivo, descartado], f({}), ctx()).map(l => l.id)).toEqual(['v'])
  })
  it('Descartado junto a otra etapa muestra las dos', () => {
    const elegidas = new Set(['descartado', vivo.funnel_stage_id!])
    expect(filterLeads([vivo, descartado], f({ stageFilter: elegidas }), ctx())).toHaveLength(2)
  })
  it('la búsqueda los encuentra igual', () => {
    expect(filterLeads([vivo, descartado], f({ q: 'muerta' }), ctx()).map(l => l.id)).toEqual(['d'])
  })
  it('elegir la etapa Descartado en el filtro de etapa los muestra', () => {
    expect(filterLeads([vivo, descartado], f({ stageFilter: new Set(['descartado']) }), ctx()).map(l => l.id)).toEqual(['d'])
  })
})

describe('para recontactar', () => {
  const vivo = lead('v')
  const vencido = lead('r', { funnel_stage_id: 'descartado', recontact_at: '2026-09-30' })
  const porVenir = lead('p', { funnel_stage_id: 'descartado', recontact_at: '2026-10-01' })
  const sinFecha = lead('s', { funnel_stage_id: 'descartado' })
  it('apagado no cambia nada: los descartados siguen escondidos', () => {
    expect(filterLeads([vivo, vencido, porVenir, sinFecha], f({}), ctx()).map(l => l.id)).toEqual(['v'])
  })
  it('prendido muestra solo los descartados con la fecha cumplida (hoy incluido)', () => {
    expect(filterLeads([vivo, vencido, porVenir, sinFecha], f({ paraRecontactar: true }), ctx()).map(l => l.id)).toEqual(['r'])
  })
  it('skip lo apaga (para el contador)', () => {
    expect(filterLeads([vivo, vencido], f({ paraRecontactar: true }), ctx(), ['recontactar']).map(l => l.id)).toEqual(['v'])
  })
})

describe('etapa y tareas', () => {
  const sinEtapa = lead('s', { funnel_stage_id: null })
  const verde = lead('v')
  it('filtrar por etapa deja afuera al que no tiene etapa (Review Focus 2)', () => {
    expect(filterLeads([sinEtapa, verde], f({ stageFilter: new Set(['nuevo']) }), ctx()).map(l => l.id)).toEqual(['v'])
    expect(filterLeads([sinEtapa, verde], f({}), ctx())).toHaveLength(2)
  })
  it('tareas vencidas: solo los del conjunto', () => {
    expect(filterLeads([verde, sinEtapa], f({ overdueOnly: true }), ctx({ overdueLeadIds: new Set(['s']) })).map(l => l.id)).toEqual(['s'])
  })
  it('skip apaga una dimensión (para los contadores)', () => {
    expect(filterLeads([verde], f({ overdueOnly: true }), ctx(), ['overdue'])).toHaveLength(1)
  })
  it('con tareas: solo los que tienen alguna pendiente', () => {
    expect(filterLeads([verde, sinEtapa], f({ conTareas: true }), ctx({ leadIdsConTareas: new Set(['v']) })).map(l => l.id)).toEqual(['v'])
    expect(filterLeads([verde, sinEtapa], f({ conTareas: true }), ctx(), ['tareas'])).toHaveLength(2)
  })
  it('con tareas no levanta el descarte', () => {
    const descartado = lead('d', { funnel_stage_id: 'descartado' })
    expect(filterLeads([descartado], f({ conTareas: true }), ctx({ leadIdsConTareas: new Set(['d']) }))).toEqual([])
  })
  it('sin tareas: solo los que no tienen ninguna pendiente', () => {
    expect(filterLeads([verde, sinEtapa], f({ sinTareas: true }), ctx({ leadIdsConTareas: new Set(['v']) })).map(l => l.id)).toEqual(['s'])
    expect(filterLeads([verde, sinEtapa], f({ sinTareas: true }), ctx({ leadIdsConTareas: new Set(['v']) }), ['tareas'])).toHaveLength(2)
  })
  it('sin tareas tampoco levanta el descarte', () => {
    const descartado = lead('d', { funnel_stage_id: 'descartado' })
    expect(filterLeads([descartado], f({ sinTareas: true }), ctx())).toEqual([])
  })
})

describe('leadsDeCarteras', () => {
  it('se queda con los de las carteras elegidas', () => {
    expect(leadsDeCarteras([lead('a'), lead('b', { assigned_to: 'otro' })], ['otro']).map(l => l.id)).toEqual(['b'])
  })
})

describe('objetivo (los números de «Objetivos semanales»)', () => {
  const leads = [lead('a'), lead('b'), lead('d', { funnel_stage_id: 'descartado' })]

  it('deja solo los leads del objetivo, descartados incluidos', () => {
    const r = filterLeads(leads, f({ objetivo: 'contestadas' }), ctx({ leadsDelObjetivo: new Set(['a', 'd']) }))
    expect(r.map(l => l.id)).toEqual(['a', 'd'])
  })

  it('mientras no llegaron los datos no pasa ninguno', () => {
    expect(filterLeads(leads, f({ objetivo: 'demos' }), ctx())).toEqual([])
  })
})
