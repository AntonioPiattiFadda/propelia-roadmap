import { describe, expect, it } from 'vitest'
import type { CrmTask } from '../types'
import { estaVencida, idsConTareasVencidas, tareasVencidasPorLead } from './tareas'

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
