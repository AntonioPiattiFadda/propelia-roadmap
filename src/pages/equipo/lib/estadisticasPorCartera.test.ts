import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, CrmMeeting, CrmTask, EtapaConPrioridad, Usuario } from '@/pages/crm/types'
import { estadisticasPorCartera } from './estadisticasPorCartera'

const NOW = new Date(2026, 8, 30, 12).getTime()
const HOY = '2026-09-30'
const u = (id: string): Usuario => ({ id, email: '', nombre: id, iniciales: 'XX', color: '#000', rol: 'SDR', activo: true })
const etapa = (id: string, position: number, over: Partial<EtapaConPrioridad> = {}): EtapaConPrioridad => ({
  id, label: id, value: id, position, priority_id: null, is_out_of_funnel: false, allow_delete: true, allow_reorder: true,
  allow_rename: true, management_tolerance_hours: 24, created_at: '', updated_at: '', deleted_at: null, priority: null, ...over,
})
const ETAPAS = new Map([
  ['nuevo', etapa('nuevo', 1, { priority: { id: 'p', name: 'Verde', color: '#0f0', position: 1, management_tolerance_hours: 24, show_in_filters: true, created_at: '', updated_at: '', deleted_at: null } })],
  ['vieja', etapa('vieja', 2, { deleted_at: '2026-09-01' })],
  ['desc', etapa('desc', 3, { value: 'DISCARDED', is_out_of_funnel: true, management_tolerance_hours: null })],
])
const lead = (id: string, assigned: string, over: Partial<CrmLeadRow> = {}): CrmLeadRow => ({
  id, client_id: id, assigned_to: assigned, funnel_stage_id: 'nuevo', channel_id: null, discard_reason: null,
  created_via: 'manual', last_important_event_at: '', last_opened_at: null,
  gestion_reference_at: new Date(2026, 8, 30, 9).toISOString(), gestion_postponed: false, gestion_has_events: true,
  created_by: null, created_at: '', updated_at: '', deleted_at: null, client: null, ...over,
})
const tarea = (id: string, assigned: string, due: string, leadId: string | null = null): CrmTask => ({
  id, lead_id: leadId, title: '', due_date: due, planned_for: null, assigned_to: assigned, completed: false,
  completed_at: null, recurrence: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
})
const reunion = (id: string, assigned: string, status: CrmMeeting['status']): CrmMeeting => ({
  id, lead_id: null, assigned_to: assigned, starts_at: '', ends_at: '', status, title: null, description: null,
  cancel_reason: null, created_by: null, created_at: '', updated_at: '', deleted_at: null,
})

describe('estadisticasPorCartera', () => {
  const [ana, beto] = estadisticasPorCartera({
    carteras: [u('ana'), u('beto')],
    leads: [
      lead('a1', 'ana'),
      lead('a2', 'ana', { gestion_has_events: false }),         // gestión vencida
      lead('a3', 'ana', { funnel_stage_id: null }),             // sin etapa
      lead('a4', 'ana', { funnel_stage_id: 'vieja' }),          // etapa borrada: se sigue leyendo
      lead('a5', 'ana', { funnel_stage_id: 'desc' }),           // descartado: no es activo
    ],
    tareasPendientes: [
      tarea('t1', 'ana', '2026-09-29', 'a1'),
      tarea('t1b', 'ana', '2026-09-01', 'a1'),                 // otra vencida del mismo lead: sigue siendo un lead
      tarea('t2', 'ana', HOY, 'a2'),                           // vence hoy: no está vencida
      tarea('t3', 'ana', '2026-09-01', 'a5'),                  // lead descartado: no cuenta
      tarea('t4', 'ana', '2026-09-01'),                        // sin lead: el CRM no la puede mostrar
      tarea('t5', 'beto', '2026-09-01', 'a3'),                 // lead de ana reasignado, la tarea quedó a nombre de beto
    ],
    reunionesDelMes: [reunion('r1', 'ana', 'scheduled'), reunion('r2', 'ana', 'completed'), reunion('r3', 'ana', 'cancelled')],
    etapas: ETAPAS,
    hoy: HOY,
    now: NOW,
  })

  it('una fila por cartera, en el orden dado', () => {
    expect([ana.usuario.id, beto.usuario.id]).toEqual(['ana', 'beto'])
  })
  it('activos sin los descartados', () => expect(ana.leadsActivos).toBe(4))
  it('por etapa en orden de funnel, sin etapa al final y en gris', () => {
    expect(ana.porEtapa.map(t => [t.label, t.cantidad])).toEqual([['nuevo', 2], ['vieja', 1], ['Sin etapa', 1]])
    expect(ana.porEtapa[0].color).toBe('#0f0')
  })
  // Solo a2 (sin eventos): sin etapa no hay plazo, así que a3 está «Gestionado», y a1/a4 tienen
  // una gestión de hoy. Sale de claveDeGestion, la misma regla del CRM.
  it('gestiones vencidas', () => expect(ana.gestionesVencidas).toBe(1))
  // Lo que muestra el CRM al tocar el número (overdueOnly sobre la cartera): leads activos de la
  // cartera con alguna tarea vencida. Se cuenta por el dueño del LEAD, no por el de la tarea.
  it('leads con tareas vencidas: la regla del chip del CRM', () => {
    expect(ana.leadsConTareasVencidas).toBe(2) // a1 (dos tareas, un lead) y a3 (tarea a nombre de beto)
    expect(beto.leadsConTareasVencidas).toBe(0)
  })
  it('reuniones del mes sin las canceladas', () => expect(ana.reunionesMes).toBe(2))
  it('una cartera sin nada da ceros, no revienta', () => {
    expect(beto).toMatchObject({ leadsActivos: 0, porEtapa: [], gestionesVencidas: 0, leadsConTareasVencidas: 0, reunionesMes: 0 })
  })
})
