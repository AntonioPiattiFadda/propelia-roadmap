import { describe, it, expect } from 'vitest'
import {
  buildImportPropertyPayload,
  IMPORT_COLUMNS,
  parseIdealistaCode,
  parseSheet,
  parseSpanishNumber,
  parseYesNo,
  type Cell,
} from '@/pages/onboarding-admin/importRows'

const HEADER = IMPORT_COLUMNS.map(c => c.header)

/** Una fila completa y válida, con lo que se quiera pisar por cabecera. */
function row(overrides: Record<string, Cell> = {}): Cell[] {
  const base: Record<string, Cell> = {
    'Código anuncio Idealista': '108765432',
    'Tipo': 'Piso',
    'Calle': 'Carrer de Manso',
    'Número': '58',
    'Código postal': '08015',
    'Ciudad': 'Barcelona',
    'Operación': 'Venta',
    'Precio venta': '250.000 €',
    'Precio alquiler': '',
    'Habitaciones': 3,
    'Baños': 2,
    'Ascensor': 'Sí',
    'm² construidos': '85,5',
    'Balcón': 'No',
  }
  const merged = { ...base, ...overrides }
  return HEADER.map(h => merged[h])
}

describe('parseo de celdas', () => {
  it('números como se escriben en España', () => {
    expect(parseSpanishNumber('250.000')).toBe('250000')
    expect(parseSpanishNumber('250.000 €')).toBe('250000')
    expect(parseSpanishNumber('1.250,50')).toBe('1250.5')
    expect(parseSpanishNumber('85,5')).toBe('85.5')
    expect(parseSpanishNumber('85.5')).toBe('85.5')
    expect(parseSpanishNumber(1200)).toBe('1200')
    expect(parseSpanishNumber('')).toBe('')
    expect(parseSpanishNumber('consultar')).toBeNull()
  })

  it('sí / no', () => {
    expect(parseYesNo('Sí')).toBe(true)
    expect(parseYesNo('si')).toBe(true)
    expect(parseYesNo('NO')).toBe(false)
    expect(parseYesNo(true)).toBe(true)
    expect(parseYesNo('')).toBeNull()
    expect(parseYesNo('quizás')).toBeUndefined()
  })

  it('el código de Idealista es sólo números, venga como texto o como número', () => {
    expect(parseIdealistaCode(108765432)).toBe('108765432')
    expect(parseIdealistaCode(' 108765432 ')).toBe('108765432')
    expect(parseIdealistaCode('')).toBeNull()
    expect(parseIdealistaCode('ABC-1')).toBeUndefined()
  })
})

describe('parseSheet', () => {
  it('una fila completa queda lista y arma el payload sin agentes', () => {
    const parsed = parseSheet([HEADER, row()])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const [r] = parsed.rows
    expect(r.errors).toEqual([])
    expect(r.rowNumber).toBe(2)

    const payload = buildImportPropertyPayload(r)
    expect(payload).toMatchObject({
      property_type: 'apartment',
      for_sale: true,
      for_rent: false,
      sale_price: 250000,
      price: 250000,
      operation_type: 'sale',
      bedrooms: 3,
      bathrooms: 2,
      has_elevator: true,
      has_balcony: false,
      sqm_built: 85.5,
      idealista_property_id: '108765432',
      captured_by: null,
      commercialized_by: null,
    })
  })

  it('reconoce las columnas sin importar orden, mayúsculas ni acentos', () => {
    const header = [...HEADER].reverse().map(h => h.toUpperCase().replace('Ó', 'O'))
    const parsed = parseSheet([header, [...row()].reverse()])
    expect(parsed.ok && parsed.rows[0].errors).toEqual([])
  })

  it('sin operación, la deduce del precio que vino', () => {
    const parsed = parseSheet([HEADER, row({ 'Operación': '', 'Precio venta': '', 'Precio alquiler': '900' })])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows[0].errors).toEqual([])
    expect(buildImportPropertyPayload(parsed.rows[0])).toMatchObject({ for_rent: true, for_sale: false, rent_price: 900 })
  })

  it('exige lo mismo que la carga rápida', () => {
    const parsed = parseSheet([HEADER, row({ 'Tipo': '', 'Número': '', 'Habitaciones': '', 'Ascensor': '' })])
    expect(parsed.ok && parsed.rows[0].errors).toEqual([
      'Falta tipo de inmueble',
      'Falta el número de la calle',
      'Falta habitaciones',
      'Falta ascensor',
    ])
  })

  it('un valor que no se entiende da un error preciso, no un "falta"', () => {
    const parsed = parseSheet([HEADER, row({ 'Tipo': 'Castillo', 'Ascensor': 'quizás', 'Precio venta': 'consultar' })])
    expect(parsed.ok && parsed.rows[0].errors).toEqual([
      'Tipo: "Castillo" no es un tipo conocido',
      'Precio de venta: "consultar" no es un número',
      'Ascensor: "quizás" tiene que ser Sí o No',
    ])
  })

  it('código repetido dentro del Excel: la segunda fila no se importa', () => {
    const parsed = parseSheet([HEADER, row(), row()])
    expect(parsed.ok && parsed.rows.map(r => r.errors)).toEqual([[], ['El código 108765432 ya está en la fila 2']])
  })

  it('sin código: se importa, con aviso', () => {
    const parsed = parseSheet([HEADER, row({ 'Código anuncio Idealista': '' })])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows[0].errors).toEqual([])
    expect(parsed.rows[0].warnings).toHaveLength(1)
    expect(buildImportPropertyPayload(parsed.rows[0]).idealista_property_id).toBeNull()
  })

  it('saltea filas vacías y avisa si faltan columnas', () => {
    const parsed = parseSheet([[], HEADER, [null, ''], row()])
    expect(parsed.ok && parsed.rows.map(r => r.rowNumber)).toEqual([4])

    const missing = parseSheet([HEADER.filter(h => h !== 'Baños'), row()])
    expect(missing).toEqual({ ok: false, error: expect.stringContaining('Faltan columnas: Baños') })
  })
})
