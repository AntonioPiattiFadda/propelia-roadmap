import { describe, expect, it } from 'vitest'
import {
  alternarPagado, conNota, escribirPagados, leerPagados, mesCorto, mesesClaudeToni,
} from './claudeToni'

describe('leerPagados', () => {
  it('lee el objeto guardado: clave presente es mes pagado, con su nota', () => {
    expect(leerPagados('{"2026-10":{"nota":"transferencia 3/10"},"2026-09":{"nota":""}}'))
      .toEqual({ '2026-09': { nota: '' }, '2026-10': { nota: 'transferencia 3/10' } })
  })

  it('acepta la lista vieja: cada mes pagado, sin nota', () => {
    expect(leerPagados('["2026-10","2026-09"]')).toEqual({ '2026-09': { nota: '' }, '2026-10': { nota: '' } })
  })

  it('vacío o roto es ninguno pagado', () => {
    expect(leerPagados('')).toEqual({})
    expect(leerPagados('no es json')).toEqual({})
    expect(leerPagados('null')).toEqual({})
    expect(leerPagados('"2026-10"')).toEqual({})
  })

  it('se queda solo con los meses bien escritos', () => {
    expect(leerPagados('["2026-10", 3, "2026-13", "octubre", "2026-10", null]')).toEqual({ '2026-10': { nota: '' } })
    expect(leerPagados('{"2026-13":{"nota":"x"},"octubre":{},"2026-10":{"nota":"ok"}}')).toEqual({ '2026-10': { nota: 'ok' } })
  })

  it('una nota que no es texto se lee vacía, pero el mes sigue pagado', () => {
    expect(leerPagados('{"2026-10":{"nota":7},"2026-09":true,"2026-08":null}'))
      .toEqual({ '2026-08': { nota: '' }, '2026-09': { nota: '' }, '2026-10': { nota: '' } })
  })
})

describe('escribirPagados', () => {
  it('es el objeto en JSON, con los meses ordenados: lo mismo que lee leerPagados', () => {
    const texto = escribirPagados({ '2026-10': { nota: 'b' }, '2026-09': { nota: 'a' } })
    expect(texto).toBe('{"2026-09":{"nota":"a"},"2026-10":{"nota":"b"}}')
    expect(leerPagados(texto)).toEqual({ '2026-09': { nota: 'a' }, '2026-10': { nota: 'b' } })
  })
})

describe('alternarPagado', () => {
  it('marca un mes sin pagar, sin nota', () => {
    expect(alternarPagado({ '2026-09': { nota: 'x' } }, '2026-10'))
      .toEqual({ '2026-09': { nota: 'x' }, '2026-10': { nota: '' } })
  })

  it('desmarca uno pagado y su nota se va con él', () => {
    expect(alternarPagado({ '2026-09': { nota: 'x' }, '2026-10': { nota: 'y' } }, '2026-09'))
      .toEqual({ '2026-10': { nota: 'y' } })
  })
})

describe('conNota', () => {
  it('le pone la nota a un mes pagado, sin los espacios de las puntas', () => {
    expect(conNota({ '2026-10': { nota: '' } }, '2026-10', '  transferencia 3/10 '))
      .toEqual({ '2026-10': { nota: 'transferencia 3/10' } })
  })

  it('a un mes sin pagar no le hace nada: la nota es solo de los pagados', () => {
    const pagados = { '2026-10': { nota: '' } }
    expect(conNota(pagados, '2026-09', 'x')).toEqual(pagados)
  })
})

describe('mesesClaudeToni', () => {
  it('va del de arranque a los que vienen, el más viejo arriba', () => {
    expect(mesesClaudeToni({}, '2026-01', '2026-01', 2)).toEqual([
      { period: '2026-01', pagado: false, nota: '' },
      { period: '2026-02', pagado: false, nota: '' },
      { period: '2026-03', pagado: false, nota: '' },
    ])
  })

  it('por defecto muestra un año por delante de este mes', () => {
    const meses = mesesClaudeToni({}, '2026-10', '2026-10')
    expect(meses[0].period).toBe('2026-10')
    expect(meses[meses.length - 1].period).toBe('2027-10')
  })

  it('marca los pagados con su nota', () => {
    const meses = mesesClaudeToni({ '2026-02': { nota: 'transferencia' } }, '2026-01', '2026-01', 2)
    expect(meses[1]).toEqual({ period: '2026-02', pagado: true, nota: 'transferencia' })
    expect(meses.map(m => m.pagado)).toEqual([false, true, false])
  })

  it('cruza el año', () => {
    expect(mesesClaudeToni({}, '2026-11', '2026-11', 2).map(m => m.period)).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('un pagado antes del arranque o más adelante igual se ve', () => {
    const meses = mesesClaudeToni({ '2025-12': { nota: '' }, '2026-05': { nota: '' } }, '2026-01', '2026-01', 1)
    expect(meses.map(m => m.period)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
    expect(meses.filter(m => m.pagado).map(m => m.period)).toEqual(['2025-12', '2026-05'])
  })
})

describe('mesCorto', () => {
  it('es la abreviatura en castellano con mayúscula y el año en dos cifras, sin punto', () => {
    expect(mesCorto('2026-10')).toBe('Oct 26')
    expect(mesCorto('2026-01')).toBe('Ene 26')
    expect(mesCorto('2025-12')).toBe('Dic 25')
    expect(mesCorto('2026-08')).toBe('Ago 26')
  })
})
