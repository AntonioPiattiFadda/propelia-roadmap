import { describe, expect, it } from 'vitest'
import { armarMetaDeActividad } from './actividad'
import { esObjetivo, objetivosDe } from './objetivos'

const llamada = (lead_id: string, resultado: 'contestada' | 'no_respondida', decisor?: boolean) => ({
  lead_id,
  long_description: armarMetaDeActividad({ tipo: 'llamada', con: [], resultado, ...(decisor !== undefined && { decisor }) }),
})

describe('objetivosDe', () => {
  const r = objetivosDe(
    [
      llamada('a', 'contestada', true),
      llamada('a', 'no_respondida'),
      llamada('b', 'contestada'),
      llamada('c', 'no_respondida'),
      llamada('c', 'no_respondida'),
      { lead_id: 'd', long_description: null }, // una nota: no cuenta
    ],
    [{ lead_id: 'b' }, { lead_id: 'e' }, { lead_id: null }],
  )

  it('cuenta llamadas y demos, no leads', () => {
    expect(r.resumen).toEqual({ contestadas: 2, decisores: 1, noRespondidas: 3, demos: 3 })
  })

  it('junta los leads de cada número, sin repetir', () => {
    expect([...r.leads.contestadas].sort()).toEqual(['a', 'b'])
    expect([...r.leads.decisores]).toEqual(['a'])
    expect([...r.leads.noRespondidas].sort()).toEqual(['a', 'c'])
    expect([...r.leads.demos].sort()).toEqual(['b', 'e'])
  })
})

describe('esObjetivo', () => {
  it('acepta solo los cuatro', () => {
    expect(esObjetivo('demos')).toBe(true)
    expect(esObjetivo('otra')).toBe(false)
    expect(esObjetivo(null)).toBe(false)
  })
})
