import { describe, expect, it } from 'vitest'
import { GESTIONES_DE_ETAPA, gestionDeEtapa } from './gestionDeEtapa'

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
