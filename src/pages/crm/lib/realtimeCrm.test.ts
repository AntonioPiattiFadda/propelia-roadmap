import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, CrmTask } from '../types'
import {
  RECARGAR, campoDelAviso, esLlamadaDe, leadsConCliente, leadsConComentario, leadsConLead, tareasConTarea,
  type AvisoRealtime,
} from './realtimeCrm'

const lead = (id: string, extra: Partial<CrmLeadRow> = {}) =>
  ({ id, assigned_to: 'u1', deleted_at: null, client: { id: `c-${id}`, company_name: `Inmo ${id}` }, ultima_actividad_at: null, ...extra }) as unknown as CrmLeadRow
const tarea = (id: string, extra: Partial<CrmTask> = {}) =>
  ({ id, lead_id: 'l1', title: 'Llamar', completed: false, deleted_at: null, ...extra }) as unknown as CrmTask
const aviso = (eventType: AvisoRealtime['eventType'], nuevo: Record<string, unknown>, viejo: Record<string, unknown> = {}): AvisoRealtime =>
  ({ eventType, new: nuevo, old: viejo })

const T1 = '2026-11-24T10:00:00.123456+00:00'
const T2 = '2026-11-24T11:00:00.5+00:00'

describe('leadsConComentario', () => {
  it('un registro a mano nuevo pasa a ser la última actividad de su lead', () => {
    const leads = [lead('l1'), lead('l2')]
    const r = leadsConComentario(leads, aviso('INSERT', { lead_id: 'l2', comment_type: 'MANUAL', created_at: T1, deleted_at: null }))
    expect(r).not.toBe(RECARGAR)
    expect((r as CrmLeadRow[])[1].ultima_actividad_at).toBe(T1)
    expect((r as CrmLeadRow[])[0]).toBe(leads[0])
  })
  it('uno más viejo que la última actividad no cambia nada', () => {
    const leads = [lead('l1', { ultima_actividad_at: T2 })]
    expect(leadsConComentario(leads, aviso('INSERT', { lead_id: 'l1', comment_type: 'MANUAL', created_at: T1 }))).toBe(leads)
  })
  it('los del sistema no son actividad', () => {
    const leads = [lead('l1')]
    expect(leadsConComentario(leads, aviso('INSERT', { lead_id: 'l1', comment_type: 'SYSTEM', created_at: T1 }))).toBe(leads)
  })
  it('un lead que no está en la lista no hace nada', () => {
    const leads = [lead('l1')]
    expect(leadsConComentario(leads, aviso('INSERT', { lead_id: 'otro', comment_type: 'MANUAL', created_at: T1 }))).toBe(leads)
  })
  it('borrar el último registro recarga; borrar uno anterior no', () => {
    const leads = [lead('l1', { ultima_actividad_at: T2 })]
    expect(leadsConComentario(leads, aviso('UPDATE', { lead_id: 'l1', comment_type: 'MANUAL', created_at: '2026-11-24T11:00:00.500+00:00', deleted_at: T2 }))).toBe(RECARGAR)
    expect(leadsConComentario(leads, aviso('UPDATE', { lead_id: 'l1', comment_type: 'MANUAL', created_at: T1, deleted_at: T2 }))).toBe(leads)
  })
  it('editar el texto no la mueve', () => {
    const leads = [lead('l1', { ultima_actividad_at: T2 })]
    expect(leadsConComentario(leads, aviso('UPDATE', { lead_id: 'l1', comment_type: 'MANUAL', created_at: T1, deleted_at: null }))).toBe(leads)
  })
  it('un DELETE de verdad recarga', () => {
    expect(leadsConComentario([lead('l1')], aviso('DELETE', {}, { id: 'x' }))).toBe(RECARGAR)
  })
})

describe('leadsConLead', () => {
  it('un cambio se fusiona y conserva el cliente y la última actividad', () => {
    const leads = [lead('l1', { ultima_actividad_at: T1 })]
    const r = leadsConLead(leads, aviso('UPDATE', { id: 'l1', funnel_stage_id: 'e2', deleted_at: null })) as CrmLeadRow[]
    expect(r[0].funnel_stage_id).toBe('e2')
    expect(r[0].client?.company_name).toBe('Inmo l1')
    expect(r[0].ultima_actividad_at).toBe(T1)
  })
  it('un lead borrado se va de la lista', () => {
    const r = leadsConLead([lead('l1'), lead('l2')], aviso('UPDATE', { id: 'l1', deleted_at: T1 })) as CrmLeadRow[]
    expect(r.map(l => l.id)).toEqual(['l2'])
  })
  it('uno nuevo, o uno que no estaba, recarga: falta su cliente', () => {
    expect(leadsConLead([lead('l1')], aviso('INSERT', { id: 'l9' }))).toBe(RECARGAR)
    expect(leadsConLead([lead('l1')], aviso('UPDATE', { id: 'l9', deleted_at: null }))).toBe(RECARGAR)
  })
  it('un aviso sin registro (demasiado grande) recarga', () => {
    expect(leadsConLead([lead('l1')], aviso('UPDATE', {}))).toBe(RECARGAR)
  })
})

describe('leadsConCliente', () => {
  it('cambia el cliente en el lead que cuelga de él, sin perder lo que el aviso no trae', () => {
    const leads = [lead('l1'), lead('l2')]
    const r = leadsConCliente(leads, aviso('UPDATE', { id: 'c-l2', phone: '+34 600' })) as CrmLeadRow[]
    expect(r[1].client?.phone).toBe('+34 600')
    expect(r[1].client?.company_name).toBe('Inmo l2')
    expect(r[0]).toBe(leads[0])
  })
  it('un cliente que no es de la lista no hace nada; uno nuevo tampoco', () => {
    const leads = [lead('l1')]
    expect(leadsConCliente(leads, aviso('UPDATE', { id: 'otro' }))).toBe(leads)
    expect(leadsConCliente(leads, aviso('INSERT', { id: 'otro' }))).toBe(leads)
  })
})

describe('tareasConTarea', () => {
  it('una pendiente nueva se suma', () => {
    const r = tareasConTarea([tarea('t1')], aviso('INSERT', { id: 't2', completed: false, deleted_at: null })) as CrmTask[]
    expect(r.map(t => t.id)).toEqual(['t1', 't2'])
  })
  it('completada o borrada, se va', () => {
    expect((tareasConTarea([tarea('t1'), tarea('t2')], aviso('UPDATE', { id: 't1', completed: true })) as CrmTask[]).map(t => t.id)).toEqual(['t2'])
    expect((tareasConTarea([tarea('t1')], aviso('UPDATE', { id: 't1', deleted_at: T1 })) as CrmTask[])).toEqual([])
    expect((tareasConTarea([tarea('t1')], aviso('DELETE', {}, { id: 't1' })) as CrmTask[])).toEqual([])
  })
  it('editada, se fusiona', () => {
    const r = tareasConTarea([tarea('t1')], aviso('UPDATE', { id: 't1', due_time: '10:30:00' })) as CrmTask[]
    expect(r[0].due_time).toBe('10:30:00')
    expect(r[0].title).toBe('Llamar')
  })
  it('una que vuelve a estar pendiente y no conocíamos recarga', () => {
    expect(tareasConTarea([], aviso('UPDATE', { id: 't9', completed: false, deleted_at: null }))).toBe(RECARGAR)
  })
  it('una completada que no estaba no hace nada', () => {
    const tareas = [tarea('t1')]
    expect(tareasConTarea(tareas, aviso('INSERT', { id: 't9', completed: true }))).toBe(tareas)
  })
})

describe('campoDelAviso y esLlamadaDe', () => {
  it('lee del registro nuevo y, si no, del viejo', () => {
    expect(campoDelAviso(aviso('UPDATE', { lead_id: 'l1' }), 'lead_id')).toBe('l1')
    expect(campoDelAviso(aviso('DELETE', {}, { lead_id: 'l2' }), 'lead_id')).toBe('l2')
    expect(campoDelAviso(aviso('DELETE', {}, { id: 'x' }), 'lead_id')).toBeNull()
  })
  it('reconoce las keys del contador de una persona', () => {
    expect(esLlamadaDe(['crm', 'llamadas', 'u1', '2026-11-24', '2026-11-25'], 'u1')).toBe(true)
    expect(esLlamadaDe(['crm', 'llamadas', 'u2', '2026-11-24', '2026-11-25'], 'u1')).toBe(false)
    expect(esLlamadaDe(['crm', 'llamadas', 'hacia-demo', 'u1'], 'u1')).toBe(true)
    expect(esLlamadaDe(['crm', 'llamadas', 'hacia-demo', 'u2'], 'u1')).toBe(false)
    expect(esLlamadaDe(['crm', 'leads'], 'u1')).toBe(false)
  })
})
