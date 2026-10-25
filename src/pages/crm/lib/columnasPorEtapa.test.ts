import { describe, expect, it } from 'vitest'
import type { CrmStage } from '../types'
import { agruparPorEtapa, SIN_ETAPA, type ColumnaDeEtapa } from './columnasPorEtapa'
import { catalogoDeEtapas } from './effectiveStage'

const etapa = (id: string, position: number, over: Partial<CrmStage> = {}): CrmStage => ({
  id, label: id.toUpperCase(), value: id, position, priority_id: null, is_out_of_funnel: false,
  allow_delete: true, allow_reorder: true, allows_tasks: true, allow_rename: true, management_tolerance_hours: 24, management_type: null,
  created_at: '', updated_at: '', deleted_at: null, ...over,
})
const ETAPAS = catalogoDeEtapas([
  etapa('contactado', 2),
  etapa('nuevo', 1),
  etapa('descartado', 3, { is_out_of_funnel: true }),
  etapa('vieja', 0, { deleted_at: '2026-10-01' }),
])
const lead = (id: string, funnel_stage_id: string | null) => ({ id, funnel_stage_id })
const resumen = (cols: ColumnaDeEtapa<ReturnType<typeof lead>>[]) => cols.map(c => [c.id, c.leads.map(l => l.id)])

describe('agruparPorEtapa', () => {
  it('una columna por etapa viva del funnel, en su orden, aunque esté vacía', () => {
    expect(resumen(agruparPorEtapa([lead('a', 'contactado')], ETAPAS))).toEqual([
      ['nuevo', []], ['contactado', ['a']],
    ])
  })
  it('cada lead en la columna de su etapa, respetando el orden en que llegan', () => {
    const cols = agruparPorEtapa([lead('a', 'nuevo'), lead('b', 'contactado'), lead('c', 'nuevo')], ETAPAS)
    expect(resumen(cols)).toEqual([['nuevo', ['a', 'c']], ['contactado', ['b']]])
  })
  it('la columna lleva la etapa y su nombre', () => {
    const [nuevo] = agruparPorEtapa([], ETAPAS)
    expect(nuevo.titulo).toBe('NUEVO')
    expect(nuevo.etapa?.id).toBe('nuevo')
  })
  it('las fuera del funnel (Descartado) solo aparecen si tienen leads', () => {
    expect(resumen(agruparPorEtapa([lead('d', 'descartado')], ETAPAS))).toEqual([
      ['nuevo', []], ['contactado', []], ['descartado', ['d']],
    ])
  })
  it('una etapa borrada no hace desaparecer a sus leads: columna al final, con su nombre', () => {
    const cols = agruparPorEtapa([lead('v', 'vieja')], ETAPAS)
    expect(resumen(cols)).toEqual([['nuevo', []], ['contactado', []], ['vieja', ['v']]])
    expect(cols[2].titulo).toBe('VIEJA')
  })
  it('sin etapa o con una que no está en el catálogo: «Sin etapa», última de todas', () => {
    const cols = agruparPorEtapa([lead('x', null), lead('y', 'fantasma'), lead('v', 'vieja')], ETAPAS)
    expect(resumen(cols)).toEqual([['nuevo', []], ['contactado', []], ['vieja', ['v']], [SIN_ETAPA, ['x', 'y']]])
    expect(cols[3].titulo).toBe('Sin etapa')
    expect(cols[3].etapa).toBeNull()
  })
  it('con etapas elegidas en el filtro: solo esas columnas, vacías o no', () => {
    const cols = agruparPorEtapa([lead('a', 'nuevo')], ETAPAS, new Set(['contactado', 'descartado']))
    expect(resumen(cols)).toEqual([['contactado', []], ['descartado', []]])
  })
})
