import { describe, it, expect } from 'vitest'
import {
  datesValueFromParams,
  datesValueFromStored,
  paramsFromDatesValue,
  parseStoredDates,
  recallForMode,
  serializeDatesForStorage,
  type StoredDates,
} from './urlState'
import type { DatesValue } from './types'

describe('datesValueFromParams', () => {
  it('sin `to` en la URL es un día suelto', () => {
    expect(datesValueFromParams('2026-09-20', null)).toEqual<DatesValue>({
      mode: 'single',
      primary: { from: '2026-09-20', to: '2026-09-20' },
      compare: null,
    })
  })

  it('con `to` en la URL es un rango', () => {
    expect(datesValueFromParams('2026-09-01', '2026-09-30')).toEqual<DatesValue>({
      mode: 'range',
      primary: { from: '2026-09-01', to: '2026-09-30' },
      compare: null,
    })
  })

  it('un `to` igual al `from` sigue siendo un rango, porque el usuario lo eligió así', () => {
    expect(datesValueFromParams('2026-09-20', '2026-09-20').mode).toBe('range')
  })

  it('ordena un rango invertido a mano en la URL', () => {
    expect(datesValueFromParams('2026-09-30', '2026-09-01').primary).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })

  it('ignora un `to` vacío', () => {
    expect(datesValueFromParams('2026-09-20', '').mode).toBe('single')
  })

  it('nunca devuelve un rango de comparación', () => {
    expect(datesValueFromParams('2026-09-01', '2026-09-30').compare).toBeNull()
  })
})

describe('paramsFromDatesValue', () => {
  it('un día suelto borra `to` de la URL', () => {
    const value: DatesValue = {
      mode: 'single',
      primary: { from: '2026-09-20', to: '2026-09-20' },
      compare: null,
    }

    expect(paramsFromDatesValue(value)).toEqual({ from: '2026-09-20', to: null })
  })

  it('un rango escribe los dos extremos', () => {
    const value: DatesValue = {
      mode: 'range',
      primary: { from: '2026-09-01', to: '2026-09-30' },
      compare: null,
    }

    expect(paramsFromDatesValue(value)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('no escribe el rango de comparación en la URL', () => {
    const value: DatesValue = {
      mode: 'compare',
      primary: { from: '2026-09-01', to: '2026-09-30' },
      compare: { from: '2026-08-01', to: '2026-08-31' },
    }

    expect(paramsFromDatesValue(value)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })
})

const single = (day: string): DatesValue => ({
  mode: 'single',
  primary: { from: day, to: day },
  compare: null,
})

const range = (from: string, to: string): DatesValue => ({
  mode: 'range',
  primary: { from, to },
  compare: null,
})

describe('serializeDatesForStorage', () => {
  it('guarda el día en su propio casillero', () => {
    expect(JSON.parse(serializeDatesForStorage(single('2026-09-20'), null))).toEqual<StoredDates>({
      mode: 'single',
      single: '2026-09-20',
      range: null,
    })
  })

  it('guarda el rango en su propio casillero', () => {
    expect(JSON.parse(serializeDatesForStorage(range('2026-09-01', '2026-09-30'), null))).toEqual<StoredDates>({
      mode: 'range',
      single: null,
      range: { from: '2026-09-01', to: '2026-09-30' },
    })
  })

  it('guardar un día NO se lleva puesto el rango que el usuario ya tenía', () => {
    const prev: StoredDates = {
      mode: 'range',
      single: null,
      range: { from: '2026-03-14', to: '2026-04-02' },
    }

    expect(JSON.parse(serializeDatesForStorage(single('2026-09-20'), prev))).toEqual<StoredDates>({
      mode: 'single',
      single: '2026-09-20',
      range: { from: '2026-03-14', to: '2026-04-02' },
    })
  })

  it('guardar un rango NO se lleva puesto el día que el usuario ya tenía', () => {
    const prev: StoredDates = { mode: 'single', single: '2026-09-20', range: null }

    expect(JSON.parse(serializeDatesForStorage(range('2026-03-14', '2026-04-02'), prev))).toEqual<StoredDates>({
      mode: 'range',
      single: '2026-09-20',
      range: { from: '2026-03-14', to: '2026-04-02' },
    })
  })

  it('no guarda el rango de comparación', () => {
    const value: DatesValue = {
      mode: 'compare',
      primary: { from: '2026-09-01', to: '2026-09-30' },
      compare: { from: '2026-08-01', to: '2026-08-31' },
    }

    expect(JSON.parse(serializeDatesForStorage(value, null))).toEqual<StoredDates>({
      mode: 'range',
      single: null,
      range: { from: '2026-09-01', to: '2026-09-30' },
    })
  })
})

describe('recallForMode', () => {
  const stored: StoredDates = {
    mode: 'single',
    single: '2026-09-20',
    range: { from: '2026-03-14', to: '2026-04-02' },
  }

  it('devuelve el último día elegido en modo Día', () => {
    expect(recallForMode(stored, 'single')).toEqual({ from: '2026-09-20', to: '2026-09-20' })
  })

  it('devuelve el último rango elegido en modo Rango', () => {
    expect(recallForMode(stored, 'range')).toEqual({ from: '2026-03-14', to: '2026-04-02' })
  })

  it('sin memoria de ese modo devuelve null, y el llamador decide la semilla', () => {
    expect(recallForMode({ mode: 'single', single: '2026-09-20', range: null }, 'range')).toBeNull()
  })

  it('compare está parkeado: no recuerda nada', () => {
    expect(recallForMode(stored, 'compare')).toBeNull()
  })

  it('sin nada guardado no recuerda nada', () => {
    expect(recallForMode(null, 'range')).toBeNull()
  })
})

describe('datesValueFromStored', () => {
  it('restaura el modo activo con SU valor, no con el del otro modo', () => {
    const stored: StoredDates = {
      mode: 'range',
      single: '2026-09-20',
      range: { from: '2026-03-14', to: '2026-04-02' },
    }

    expect(datesValueFromStored(stored)).toEqual(range('2026-03-14', '2026-04-02'))
  })

  it('restaura un día suelto', () => {
    const stored: StoredDates = { mode: 'single', single: '2026-09-20', range: null }

    expect(datesValueFromStored(stored)).toEqual(single('2026-09-20'))
  })

  it('si el casillero del modo activo está vacío no hay nada que restaurar', () => {
    expect(datesValueFromStored({ mode: 'range', single: '2026-09-20', range: null })).toBeNull()
  })

  it('sin nada guardado no hay nada que restaurar', () => {
    expect(datesValueFromStored(null)).toBeNull()
  })
})

describe('parseStoredDates', () => {
  it('lee lo que escribió serializeDatesForStorage', () => {
    const raw = serializeDatesForStorage(range('2026-09-01', '2026-09-30'), {
      mode: 'single',
      single: '2026-09-20',
      range: null,
    })

    expect(parseStoredDates(raw)).toEqual<StoredDates>({
      mode: 'range',
      single: '2026-09-20',
      range: { from: '2026-09-01', to: '2026-09-30' },
    })
  })

  it('devuelve null si no hay nada guardado', () => {
    expect(parseStoredDates(null)).toBeNull()
  })

  it('migra la forma vieja de un día suelto', () => {
    expect(parseStoredDates('{"from":"2026-01-05","to":null}')).toEqual<StoredDates>({
      mode: 'single',
      single: '2026-01-05',
      range: null,
    })
  })

  it('migra la forma vieja de un rango', () => {
    expect(parseStoredDates('{"from":"2026-01-01","to":"2026-01-31"}')).toEqual<StoredDates>({
      mode: 'range',
      single: null,
      range: { from: '2026-01-01', to: '2026-01-31' },
    })
  })

  it('ordena un rango guardado al revés', () => {
    const raw = '{"mode":"range","single":null,"range":{"from":"2026-01-31","to":"2026-01-01"}}'

    expect(parseStoredDates(raw)?.range).toEqual({ from: '2026-01-01', to: '2026-01-31' })
  })

  it('un casillero corrupto se descarta sin llevarse puesto al otro', () => {
    const raw = '{"mode":"range","single":"ayer","range":{"from":"2026-01-01","to":"2026-01-31"}}'

    expect(parseStoredDates(raw)).toEqual<StoredDates>({
      mode: 'range',
      single: null,
      range: { from: '2026-01-01', to: '2026-01-31' },
    })
  })

  it.each([
    ['texto suelto', 'no soy json'],
    ['array', '[1,2,3]'],
    ['sin modo', '{"single":"2026-09-20","range":null}'],
    ['modo desconocido', '{"mode":"compare","single":"2026-09-20","range":null}'],
    ['forma vieja sin from', '{"to":"2026-09-30"}'],
    ['forma vieja con from de otro formato', '{"from":"20/09/2026","to":null}'],
    ['forma vieja con from numérico', '{"from":20260920,"to":null}'],
    ['forma vieja con to de otro formato', '{"from":"2026-09-01","to":"30-09-2026"}'],
  ])('ignora storage corrupto: %s', (_caso, raw) => {
    expect(parseStoredDates(raw)).toBeNull()
  })
})

describe('ida y vuelta', () => {
  const cases: DatesValue[] = [
    { mode: 'single', primary: { from: '2026-09-20', to: '2026-09-20' }, compare: null },
    { mode: 'range', primary: { from: '2026-09-01', to: '2026-09-30' }, compare: null },
    { mode: 'range', primary: { from: '2026-01-01', to: '2026-12-31' }, compare: null },
  ]

  it.each(cases)('sobrevive el round-trip por la URL ($mode)', (value) => {
    const params = paramsFromDatesValue(value)

    expect(datesValueFromParams(params.from, params.to)).toEqual(value)
  })
})
