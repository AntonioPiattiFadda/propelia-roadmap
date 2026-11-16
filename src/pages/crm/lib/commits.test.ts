import { describe, expect, it } from 'vitest'
import { commitDelDia, commitDelPeriodo, conCommit, escribirCommits, leerCommits, tonoDelCommit } from './commits'

const A = 'persona-a'

describe('leerCommits', () => {
  it('vacío o roto es sin commits', () => {
    expect(leerCommits(null)).toEqual({})
    expect(leerCommits('')).toEqual({})
    expect(leerCommits('{roto')).toEqual({})
    expect(leerCommits('[1,2]')).toEqual({})
  })

  it('descarta lo que no es un número válido', () => {
    const c = leerCommits(JSON.stringify({ [A]: { '2026-11-16': { contestadas: 20, demos: 'x' }, malo: 3 } }))
    expect(c).toEqual({ [A]: { '2026-11-16': { contestadas: 20 } } })
  })

  it('ida y vuelta con escribirCommits', () => {
    const c = conCommit({}, A, '2026-11-16', 'demos', 2)
    expect(leerCommits(escribirCommits(c))).toEqual(c)
  })
})

describe('conCommit', () => {
  it('pone y saca un campo sin tocar el otro', () => {
    let c = conCommit({}, A, '2026-11-16', 'contestadas', 20)
    c = conCommit(c, A, '2026-11-16', 'demos', 2)
    expect(c[A]['2026-11-16']).toEqual({ contestadas: 20, demos: 2 })
    c = conCommit(c, A, '2026-11-16', 'contestadas', null)
    expect(c[A]['2026-11-16']).toEqual({ demos: 2 })
    c = conCommit(c, A, '2026-11-16', 'demos', null)
    expect(c[A]).toEqual({})
  })
})

describe('commitDelDia', () => {
  // 16/11/2026 es lunes.
  const c = conCommit(conCommit({}, A, '2026-11-16', 'contestadas', 20), A, '2026-11-18', 'contestadas', 30)

  it('antes del primero no hay commit', () => {
    expect(commitDelDia(c, A, '2026-11-13', 'contestadas')).toBeUndefined()
  })

  it('vale desde ese día hasta el próximo cambio', () => {
    expect(commitDelDia(c, A, '2026-11-16', 'contestadas')).toBe(20)
    expect(commitDelDia(c, A, '2026-11-17', 'contestadas')).toBe(20)
    expect(commitDelDia(c, A, '2026-11-18', 'contestadas')).toBe(30)
    expect(commitDelDia(c, A, '2026-11-20', 'contestadas')).toBe(30)
  })

  it('el fin de semana no hay commit', () => {
    expect(commitDelDia(c, A, '2026-11-21', 'contestadas')).toBeUndefined()
    expect(commitDelDia(c, A, '2026-11-22', 'contestadas')).toBeUndefined()
  })

  it('cada campo va por su lado', () => {
    expect(commitDelDia(c, A, '2026-11-17', 'demos')).toBeUndefined()
    expect(commitDelDia(c, 'otra', '2026-11-17', 'contestadas')).toBeUndefined()
  })
})

describe('commitDelPeriodo', () => {
  const c = conCommit(conCommit({}, A, '2026-11-16', 'contestadas', 20), A, '2026-11-18', 'contestadas', 30)

  it('suma los días hábiles de [desde, hasta)', () => {
    // lun 20 + mar 20 + mié 30 + jue 30 + vie 30; sáb y dom no.
    expect(commitDelPeriodo(c, A, '2026-11-16', '2026-11-23', 'contestadas')).toBe(130)
  })

  it('la semana en curso corta en hoy', () => {
    expect(commitDelPeriodo(c, A, '2026-11-16', '2026-11-18', 'contestadas')).toBe(40)
  })

  it('sin ningún día con commit es undefined', () => {
    expect(commitDelPeriodo(c, A, '2026-11-09', '2026-11-16', 'contestadas')).toBeUndefined()
  })
})

describe('tonoDelCommit', () => {
  it('verde si alcanzó, rojo si no, nada sin datos', () => {
    expect(tonoDelCommit(20, 20)).toBe('verde')
    expect(tonoDelCommit(25, 20)).toBe('verde')
    expect(tonoDelCommit(19, 20)).toBe('rojo')
    expect(tonoDelCommit(undefined, 20)).toBeUndefined()
    expect(tonoDelCommit(5, undefined)).toBeUndefined()
  })
})
