import { describe, expect, it } from 'vitest'
import type { EtapaConPrioridad, LeadDetalle, Usuario } from '../types'
import { lineaDeTiempo } from './actividad'

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
