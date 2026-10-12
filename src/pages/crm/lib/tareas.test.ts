import { describe, expect, it } from 'vitest'
import type { CrmTask } from '../types'
import {
  estaVencida, idsConTareasVencidas, ordenarPorEstado, ordenarPorProximaTarea, porVencimiento, proximaTareaPorLead,
  tareasVencidasPorLead, type EtapaOrdenable,
} from './tareas'

const tarea = (over: Partial<CrmTask>): CrmTask => ({
  id: 't', lead_id: 'l1', title: 'x', due_date: '2026-09-30', planned_for: null, assigned_to: 'u',
  completed: false, completed_at: null, recurrence: null, created_by: null, created_at: '',
  updated_at: '', deleted_at: null, ...over,
})
const HOY = '2026-09-30'

describe('estaVencida (Review Focus 4)', () => {
  it('la que vence hoy NO', () => expect(estaVencida(tarea({}), HOY)).toBe(false))
  it('la de ayer sí', () => expect(estaVencida(tarea({ due_date: '2026-09-29' }), HOY)).toBe(true))
  it('completada, borrada o sin fecha: no', () => {
    expect(estaVencida(tarea({ due_date: '2026-09-29', completed: true }), HOY)).toBe(false)
    expect(estaVencida(tarea({ due_date: '2026-09-29', deleted_at: '2026-09-29' }), HOY)).toBe(false)
    expect(estaVencida(tarea({ due_date: null }), HOY)).toBe(false)
  })
})

describe('idsConTareasVencidas / tareasVencidasPorLead', () => {
  const tareas = [
    tarea({ id: 'a', lead_id: 'l1', due_date: '2026-09-01' }),
    tarea({ id: 'b', lead_id: 'l1', due_date: '2026-09-02' }),
    tarea({ id: 'c', lead_id: 'l2', due_date: HOY }),
    tarea({ id: 'd', lead_id: null, due_date: '2026-09-01' }),
  ]
  it('solo leads, sin las sueltas', () => {
    expect([...idsConTareasVencidas(tareas, HOY)]).toEqual(['l1'])
  })
  it('agrupadas por lead', () => {
    expect(tareasVencidasPorLead(tareas, HOY).get('l1')?.map(t => t.id)).toEqual(['a', 'b'])
  })
})

describe('porVencimiento', () => {
  it('la más temprana primero y las sin fecha al final', () => {
    const lista = [
      tarea({ id: 'sin', due_date: null }),
      tarea({ id: 'tarde', due_date: '2026-10-05' }),
      tarea({ id: 'temprano', due_date: '2026-09-01' }),
    ]
    expect([...lista].sort(porVencimiento).map(t => t.id)).toEqual(['temprano', 'tarde', 'sin'])
  })
  it('compara el día y no la hora', () => {
    expect(porVencimiento(tarea({ due_date: '2026-09-01T23:00:00' }), tarea({ due_date: '2026-09-01' }))).toBe(0)
  })
})

describe('proximaTareaPorLead', () => {
  const tareas = [
    tarea({ id: 'a', lead_id: 'l1', due_date: '2026-10-05' }),
    tarea({ id: 'b', lead_id: 'l1', due_date: '2026-09-02' }),
    tarea({ id: 'c', lead_id: 'l1', due_date: null }),
    tarea({ id: 'd', lead_id: 'l2', due_date: null }),
    tarea({ id: 'e', lead_id: null, due_date: '2026-09-01' }),
    tarea({ id: 'f', lead_id: 'l3', due_date: '2026-09-01', completed: true }),
    tarea({ id: 'g', lead_id: 'l3', due_date: '2026-09-01', deleted_at: '2026-09-01' }),
  ]
  const proximas = proximaTareaPorLead(tareas)
  it('la que vence primero y cuántas pendientes tiene el lead', () => {
    expect(proximas.get('l1')?.tarea.id).toBe('b')
    expect(proximas.get('l1')?.pendientes).toBe(3)
  })
  it('una sin fecha también cuenta como pendiente', () => {
    expect(proximas.get('l2')).toEqual({ tarea: tareas[3], pendientes: 1 })
  })
  it('sin las sueltas, las completadas ni las borradas', () => {
    expect([...proximas.keys()].sort()).toEqual(['l1', 'l2'])
  })
})

describe('ordenarPorProximaTarea', () => {
  const proximas = proximaTareaPorLead([
    tarea({ id: 'a', lead_id: 'hoy', due_date: HOY }),
    tarea({ id: 'b', lead_id: 'vencida', due_date: '2026-09-10' }),
    tarea({ id: 'c', lead_id: 'sinFecha', due_date: null }),
    tarea({ id: 'd', lead_id: 'empate', due_date: HOY }),
  ])
  const leads = ['sinTarea', 'sinFecha', 'hoy', 'empate', 'vencida'].map(id => ({ id }))
  it('vencidas arriba, después por fecha, sin fecha y sin tarea al final; el empate respeta el orden', () => {
    expect(ordenarPorProximaTarea(leads, proximas).map(l => l.id))
      .toEqual(['vencida', 'hoy', 'empate', 'sinFecha', 'sinTarea'])
  })
  it('no muta la lista de entrada', () => {
    ordenarPorProximaTarea(leads, proximas)
    expect(leads.map(l => l.id)).toEqual(['sinTarea', 'sinFecha', 'hoy', 'empate', 'vencida'])
  })
})

describe('ordenarPorEstado', () => {
  const etapas: Record<string, EtapaOrdenable | null> = {
    nuevo: { position: 1, is_out_of_funnel: false },
    meeting: { position: 5, is_out_of_funnel: false },
    seguimiento: { position: 4, is_out_of_funnel: false },
    descartado: { position: 6, is_out_of_funnel: true },
    sinEtapa: null,
  }
  const proximas = proximaTareaPorLead([
    tarea({ id: 'a', lead_id: 'meetingTarde', due_date: '2026-10-05' }),
    tarea({ id: 'b', lead_id: 'meetingVencida', due_date: '2026-09-10' }),
  ])
  const etapaDe = (l: { id: string; e: string }) => etapas[l.e]
  const leads = [
    { id: 'n', e: 'nuevo' }, { id: 'd', e: 'descartado' }, { id: 'x', e: 'sinEtapa' },
    { id: 'meetingTarde', e: 'meeting' }, { id: 's', e: 'seguimiento' }, { id: 'meetingVencida', e: 'meeting' },
  ]
  it('lo más avanzado del funnel arriba, descartados y sin etapa al final; el empate va por la próxima tarea', () => {
    expect(ordenarPorEstado(leads, proximas, etapaDe).map(l => l.id))
      .toEqual(['meetingVencida', 'meetingTarde', 's', 'n', 'd', 'x'])
  })
  it('no muta la lista de entrada', () => {
    ordenarPorEstado(leads, proximas, etapaDe)
    expect(leads.map(l => l.id)).toEqual(['n', 'd', 'x', 'meetingTarde', 's', 'meetingVencida'])
  })
})
