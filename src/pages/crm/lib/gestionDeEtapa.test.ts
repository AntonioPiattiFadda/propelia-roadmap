import { describe, expect, it } from 'vitest'
import { GESTIONES_DE_ETAPA, alternarGrupo, etapasPorGestion, gestionDeEtapa, permiteAgendarTarea } from './gestionDeEtapa'

describe('alternarGrupo', () => {
  it('si falta alguna del grupo, las agrega todas sin tocar las de otros grupos', () => {
    expect([...alternarGrupo(new Set(['x', 'a']), ['a', 'b'])].sort()).toEqual(['a', 'b', 'x'])
  })

  it('si ya están todas, las saca todas y deja las de otros grupos', () => {
    expect([...alternarGrupo(new Set(['x', 'a', 'b']), ['a', 'b'])]).toEqual(['x'])
  })

  it('no modifica el set de entrada', () => {
    const antes = new Set(['a'])
    alternarGrupo(antes, ['a', 'b'])
    expect([...antes]).toEqual(['a'])
  })
})

const e = (id: string, management_type: string | null, is_out_of_funnel = false) =>
  ({ id, management_type, is_out_of_funnel })

describe('etapasPorGestion', () => {
  it('arma Primer contacto y Seguimiento, en ese orden, respetando el orden de entrada', () => {
    const grupos = etapasPorGestion([e('a', 'por_tarea'), e('b', 'sin_contactar'), e('c', 'por_tarea')])
    expect(grupos.map(g => [g.label, g.etapas.map(x => x.id)])).toEqual([
      ['Primer contacto', ['b']],
      ['Seguimiento', ['a', 'c']],
    ])
  })

  it('las sin clasificar y las fuera del funnel van al final, en «Otros»', () => {
    const grupos = etapasPorGestion([e('d', 'sin_contactar', true), e('x', null), e('b', 'sin_contactar')])
    expect(grupos.map(g => [g.label, g.etapas.map(x => x.id)])).toEqual([
      ['Primer contacto', ['b']],
      ['Otros', ['x', 'd']],
    ])
  })

  it('no devuelve grupos vacíos', () => {
    expect(etapasPorGestion([])).toEqual([])
  })
})

describe('gestionDeEtapa', () => {
  it('reconoce los dos valores del check de la base', () => {
    expect(gestionDeEtapa('sin_contactar')).toBe('sin_contactar')
    expect(gestionDeEtapa('por_tarea')).toBe('por_tarea')
  })

  it('null, vacío o un valor desconocido es «sin clasificar»', () => {
    expect(gestionDeEtapa(null)).toBeNull()
    expect(gestionDeEtapa(undefined)).toBeNull()
    expect(gestionDeEtapa('')).toBeNull()
    expect(gestionDeEtapa('otra')).toBeNull()
  })

  it('cada gestión tiene su rótulo', () => {
    expect(GESTIONES_DE_ETAPA.map(g => g.value)).toEqual(['sin_contactar', 'por_tarea'])
    expect(GESTIONES_DE_ETAPA.every(g => g.label.length > 0)).toBe(true)
  })
})

describe('permiteAgendarTarea', () => {
  it('sin etapa se puede agendar', () => {
    expect(permiteAgendarTarea(null)).toBe(true)
    expect(permiteAgendarTarea(undefined)).toBe(true)
  })

  it('solo un «No» explícito lo impide', () => {
    expect(permiteAgendarTarea({ allows_tasks: true })).toBe(true)
    expect(permiteAgendarTarea({ allows_tasks: false })).toBe(false)
  })
})
