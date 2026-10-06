import { describe, expect, it } from 'vitest'
import type { CrmMeeting, CrmTask, EtapaConPrioridad, LeadDetalle, Usuario } from '../types'
import {
  agruparPorDia, armarMetaDeActividad, horaDe, leerMetaDeActividad, lineaDeTiempo, type ItemActividad,
} from './actividad'

const vacio: LeadDetalle = { tasks: [], comments: [], events: [], meetings: [], stageHistory: [], assignmentHistory: [] }
const etapas = new Map([
  ['n', { id: 'n', label: 'Nuevo' } as EtapaConPrioridad],
  ['c', { id: 'c', label: 'Contactado' } as EtapaConPrioridad],
])
const usuarios = [{ id: 'a', nombre: 'Antonio' }, { id: 'l', nombre: 'Lorenzo' }] as Usuario[]

describe('lineaDeTiempo', () => {
  const detalle: LeadDetalle = {
    ...vacio,
    comments: [
      { id: 'c1', lead_id: 'x', description: 'hola', long_description: null, comment_type: 'MANUAL', created_by: 'a', created_at: '2026-09-30T10:00:00Z', deleted_at: null },
      { id: 'c2', lead_id: 'x', description: 'Lead reasignado de Antonio a Lorenzo.', long_description: null, comment_type: 'SYSTEM', created_by: 'a', created_at: '2026-09-30T12:00:00Z', deleted_at: null },
    ],
    events: [
      { id: 'e1', lead_id: 'x', action: 'MANUAL', effective_at: '2026-09-30T11:00:00Z', note: null, created_by: 'l', created_at: '2026-09-30T11:00:00Z', deleted_at: null },
      { id: 'e2', lead_id: 'x', action: 'POSTPONED', effective_at: '2026-10-05T09:00:00Z', note: 'viaja', created_by: 'l', created_at: '2026-09-30T13:00:00Z', deleted_at: null },
    ],
    stageHistory: [
      { id: 's1', lead_id: 'x', from_stage_id: null, to_stage_id: 'n', changed_by: null, changed_at: '2026-09-30T09:00:00Z' },
      { id: 's2', lead_id: 'x', from_stage_id: 'n', to_stage_id: 'borrada', changed_by: 'a', changed_at: '2026-09-30T09:30:00Z' },
    ],
  }
  const items = lineaDeTiempo(detalle, etapas, usuarios)

  it('ordena de lo más viejo a lo más nuevo (el chat se lee de arriba abajo)', () => {
    expect(items.map(i => i.id)).toEqual(['s1', 's2', 'c1', 'e1', 'c2', 'e2'])
  })
  it('las gestiones se fechan cuando se hicieron, no a dónde se pospusieron', () => {
    expect(items.find(i => i.id === 'e2')).toMatchObject({ tipo: 'pospuesto', fecha: '2026-09-30T13:00:00Z' })
  })
  it('una etapa que ya no está en el catálogo se nombra igual', () => {
    expect(items.find(i => i.id === 's2')?.texto).toBe('Etapa: Nuevo → (etapa borrada)')
    expect(items.find(i => i.id === 's1')?.texto).toBe('Entró en Nuevo')
  })
  it('comentarios SYSTEM como sistema', () => {
    expect(items.find(i => i.id === 'c2')?.tipo).toBe('sistema')
  })
  it('el pospuesto dice hasta cuándo y la nota', () => {
    expect(items.find(i => i.id === 'e2')?.texto).toMatch(/^Gestión pospuesta hasta \d{2}\/\d{2} · viaja$/)
  })
})

describe('lineaDeTiempo · reuniones', () => {
  const reunion = (id: string, extra: Partial<CrmMeeting> = {}): CrmMeeting => ({
    id, lead_id: 'x', assigned_to: 'l', title: 'Demo', description: null, status: 'scheduled', cancel_reason: null,
    // Hora local armada a mano: el texto se lee en la zona de quien mira.
    starts_at: new Date(2026, 9, 7, 12, 0).toISOString(), ends_at: new Date(2026, 9, 7, 13, 0).toISOString(),
    created_by: 'a', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z', deleted_at: null, ...extra,
  })
  const items = lineaDeTiempo({ ...vacio, meetings: [
    reunion('m1'), reunion('m2', { title: null }), reunion('m3', { deleted_at: '2026-10-02T00:00:00Z' }), reunion('m4', { title: 'Con el dueño' }),
  ] }, etapas, usuarios)

  it('se fechan cuando se agendaron, no cuando son', () => {
    expect(items.find(i => i.id === 'm1')).toMatchObject({ tipo: 'reunion', fecha: '2026-10-01T10:00:00Z', autorId: 'a' })
  })
  it('explican que se agendó una demo y para cuándo; el título «Demo» no se repite', () => {
    expect(items.find(i => i.id === 'm1')?.texto).toBe('Se agendó una demo para el 07/10 a las 12:00')
    expect(items.find(i => i.id === 'm2')?.texto).toBe('Se agendó una demo para el 07/10 a las 12:00')
    expect(items.find(i => i.id === 'm4')?.texto).toBe('Se agendó una demo para el 07/10 a las 12:00 · Con el dueño')
  })
  it('las borradas no aparecen', () => {
    expect(items.some(i => i.id === 'm3')).toBe(false)
  })
})

describe('lineaDeTiempo · tareas', () => {
  const tarea = (id: string, extra: Partial<CrmTask> = {}): CrmTask => ({
    id, lead_id: 'x', title: 'Llamar al dueño', due_date: '2026-10-07', assigned_to: 'l', completed: false, completed_at: null,
    planned_for: null, recurrence: null, created_by: 'a', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
    deleted_at: null, ...extra,
  })
  const items = lineaDeTiempo({ ...vacio, tasks: [tarea('t1'), tarea('t2', { due_date: null }), tarea('t3', { deleted_at: '2026-10-02T00:00:00Z' })] }, etapas, usuarios)

  it('se fechan cuando se agendaron, no cuando vencen', () => {
    expect(items.find(i => i.id === 't1')).toMatchObject({ tipo: 'tarea', fecha: '2026-10-01T10:00:00Z', autorId: 'a' })
  })
  it('explican que se agendó una tarea, cuál y para cuándo', () => {
    expect(items.find(i => i.id === 't1')?.texto).toBe('Se agendó la tarea «Llamar al dueño» para el 07/10')
    expect(items.find(i => i.id === 't2')?.texto).toBe('Se agendó la tarea «Llamar al dueño», sin fecha')
  })
  it('las borradas no aparecen', () => {
    expect(items.some(i => i.id === 't3')).toBe(false)
  })
})

describe('metaDeActividad', () => {
  it('ida y vuelta: tipo y con quién', () => {
    const guardado = armarMetaDeActividad({ tipo: 'llamada', con: ['Laura Gómez', 'Marc'] })
    expect(leerMetaDeActividad(guardado)).toEqual({ tipo: 'llamada', con: ['Laura Gómez', 'Marc'] })
  })
  it('una nota sin nadie no guarda nada: es un comentario de los de siempre', () => {
    expect(armarMetaDeActividad({ tipo: 'nota', con: [] })).toBeNull()
  })
  it('se lee por la marca y no por la forma: lo que no la tiene no es meta', () => {
    expect(leerMetaDeActividad(null)).toBeNull()
    expect(leerMetaDeActividad('{"tipo":"llamada","con":[]}')).toBeNull()
    expect(leerMetaDeActividad('un texto largo cualquiera')).toBeNull()
  })
  it('con la marca pero roto o con otra forma, tampoco', () => {
    expect(leerMetaDeActividad('<!--act-->{roto')).toBeNull()
    expect(leerMetaDeActividad('<!--act-->{"tipo":"otra","con":[]}')).toBeNull()
    expect(leerMetaDeActividad('<!--act-->{"tipo":"nota","con":[3]}')).toBeNull()
  })
})

describe('lineaDeTiempo · llamadas y con quién', () => {
  const comentario = (id: string, long_description: string | null) => ({
    id, lead_id: 'x', description: 'no contestó', long_description, comment_type: 'MANUAL' as const,
    created_by: 'a', created_at: '2026-10-01T10:00:00Z', deleted_at: null,
  })
  const items = lineaDeTiempo({ ...vacio, comments: [
    comentario('k1', armarMetaDeActividad({ tipo: 'llamada', con: ['Laura'] })),
    comentario('k2', armarMetaDeActividad({ tipo: 'nota', con: ['Marc'] })),
    comentario('k3', null),
  ] }, etapas, usuarios)

  it('una llamada se lee como llamada, con su gente', () => {
    expect(items.find(i => i.id === 'k1')).toMatchObject({ tipo: 'llamada', texto: 'no contestó', con: ['Laura'] })
  })
  it('una nota con gente sigue siendo nota', () => {
    expect(items.find(i => i.id === 'k2')).toMatchObject({ tipo: 'comentario', con: ['Marc'] })
  })
  it('un comentario viejo, sin meta, no tiene a nadie', () => {
    expect(items.find(i => i.id === 'k3')).toMatchObject({ tipo: 'comentario', con: [] })
  })
})

describe('agruparPorDia', () => {
  const hoy = '2026-10-05'
  const item = (id: string, fecha: Date): ItemActividad => ({ id, tipo: 'comentario', fecha: fecha.toISOString(), texto: id, autorId: null })
  const grupos = agruparPorDia([
    item('a', new Date(2026, 8, 28, 9)),
    item('b', new Date(2026, 9, 4, 23, 30)),
    item('c', new Date(2026, 9, 5, 8)),
    item('d', new Date(2026, 9, 5, 17)),
    item('e', new Date(2025, 11, 31, 10)),
  ], hoy)

  it('un grupo por día local, en el orden en que llegan los items', () => {
    expect(grupos.map(g => g.dia)).toEqual(['2026-09-28', '2026-10-04', '2026-10-05', '2025-12-31'])
    expect(grupos[2].items.map(i => i.id)).toEqual(['c', 'd'])
  })
  it('hoy y ayer se nombran; el resto, día de la semana, día y mes', () => {
    expect(grupos.map(g => g.rotulo)).toEqual(['lun 28 sep', 'Ayer', 'Hoy', 'mié 31 dic 25'])
  })
})

describe('horaDe', () => {
  it('HH:mm en la zona de quien mira', () => {
    expect(horaDe(new Date(2026, 9, 5, 7, 5).toISOString())).toBe('07:05')
  })
})
