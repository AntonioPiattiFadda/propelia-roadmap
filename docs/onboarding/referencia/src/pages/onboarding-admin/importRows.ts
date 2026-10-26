import { PROPERTY_TYPE_LABELS, PROPERTY_TYPE_ORDER } from '@/lib/propertyTypeLabels'
import type { AddressPayload } from '@/service/addresses.service'
import type { PropertyInsert } from '@/types/properties.types'
import { buildAddressPayload, buildPropertyPayload, FORM_STATE_EMPTY, type FormState } from '../propiedades/propertyPayload'
import { validateForm } from '../propiedades/propertyValidation'

/**
 * Import de propiedades desde Excel (onboarding › Cargar la cartera, sólo superadmin).
 *
 * Las columnas son los campos de la carga rápida (QuickLoadSection) más el código del
 * anuncio de Idealista. Cada fila se convierte en el MISMO `FormState` que arma el form, así
 * la validación (`validateForm`) y el payload (`buildPropertyPayload`) son los de siempre y
 * no una segunda versión que se desincronice.
 */

export type ImportColumnKey =
  | 'idealista_code' | 'property_type' | 'street' | 'street_number' | 'postal_code' | 'city'
  | 'operation' | 'sale_price' | 'rent_price' | 'bedrooms' | 'bathrooms' | 'has_elevator'
  | 'sqm_built' | 'has_balcony'

export const IMPORT_COLUMNS: { key: ImportColumnKey; header: string; example: string | number }[] = [
  { key: 'idealista_code', header: 'Código anuncio Idealista', example: '108765432' },
  { key: 'property_type', header: 'Tipo', example: 'Piso' },
  { key: 'street', header: 'Calle', example: 'Carrer de Manso' },
  { key: 'street_number', header: 'Número', example: '58' },
  { key: 'postal_code', header: 'Código postal', example: '08015' },
  { key: 'city', header: 'Ciudad', example: 'Barcelona' },
  { key: 'operation', header: 'Operación', example: 'Venta' },
  { key: 'sale_price', header: 'Precio venta', example: 250000 },
  { key: 'rent_price', header: 'Precio alquiler', example: '' },
  { key: 'bedrooms', header: 'Habitaciones', example: 3 },
  { key: 'bathrooms', header: 'Baños', example: 2 },
  { key: 'has_elevator', header: 'Ascensor', example: 'Sí' },
  { key: 'sqm_built', header: 'm² construidos', example: 85 },
  { key: 'has_balcony', header: 'Balcón', example: 'No' },
]

export type Cell = string | number | boolean | Date | null | undefined

export type ParsedImportRow = {
  /** Número de fila en el Excel (la cabecera es la 1), para que el error se pueda ubicar. */
  rowNumber: number
  form: FormState
  idealistaCode: string | null
  errors: string[]
  warnings: string[]
}

export type ParsedSheet =
  | { ok: true; rows: ParsedImportRow[] }
  | { ok: false; error: string }

/** Minúsculas, sin acentos ni símbolos: "m² construidos" y "M2 Construidos" son la misma columna. */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/²/g, '2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const HEADER_TO_KEY = new Map(IMPORT_COLUMNS.map(c => [norm(c.header), c.key]))

const cellText = (v: Cell): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

/**
 * Números como los escribe una inmobiliaria en España: "250.000", "250.000 €", "1.250,50",
 * "85,5". Un punto seguido de exactamente 3 dígitos es separador de miles; la coma, decimal.
 * Devuelve el string que espera el form ('' si está vacía) o `null` si no es un número.
 */
export function parseSpanishNumber(v: Cell): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  const raw = cellText(v).replace(/[€\s]/g, '').replace(/m2$/i, '')
  if (!raw) return ''
  let s = raw
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : null
}

/** `null` = vacía (sin responder). `undefined` = no se entiende. */
export function parseYesNo(v: Cell): boolean | null | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : undefined
  const t = norm(cellText(v))
  if (!t) return null
  if (['si', 's', 'yes', 'true', 'x', '1'].includes(t)) return true
  if (['no', 'n', 'false', '0'].includes(t)) return false
  return undefined
}

const TYPE_BY_TEXT = new Map<string, string>([
  ...PROPERTY_TYPE_ORDER.map(v => [norm(v), v] as [string, string]),
  ...Object.entries(PROPERTY_TYPE_LABELS).map(([v, label]) => [norm(label), v] as [string, string]),
  // Sinónimos frecuentes en las carteras.
  ['casa', 'house'], ['chalet', 'house'], ['apartamento', 'apartment'], ['atico', 'apartment'],
  ['duplex', 'apartment'], ['estudio', 'apartment'], ['local', 'commercial'], ['nave', 'commercial'],
  ['parking', 'garage'], ['plaza de garaje', 'garage'], ['solar', 'land'],
])

export function parsePropertyType(v: Cell): string | null | undefined {
  const t = norm(cellText(v))
  if (!t) return null
  return TYPE_BY_TEXT.get(t)
}

/** Venta, alquiler o las dos. Vacía: se deduce de qué precio vino. */
export function parseOperation(
  v: Cell, salePrice: string, rentPrice: string,
): { for_sale: boolean; for_rent: boolean } | undefined {
  const t = norm(cellText(v))
  if (!t) return { for_sale: salePrice !== '', for_rent: rentPrice !== '' }
  const sale = /\bventa\b|\bsale\b|\bvender\b/.test(t)
  const rent = /\balquiler\b|\brent\b|\balquilar\b/.test(t)
  if (!sale && !rent) return undefined
  return { for_sale: sale, for_rent: rent }
}

/** El código del anuncio es numérico ("108765432"); Excel lo puede traer como número. */
export function parseIdealistaCode(v: Cell): string | null | undefined {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? String(v) : undefined
  const t = cellText(v)
  if (!t) return null
  return /^\d+$/.test(t) ? t : undefined
}

export function parseRow(rowNumber: number, get: (key: ImportColumnKey) => Cell): ParsedImportRow {
  const errors: string[] = []
  const warnings: string[] = []

  const num = (key: ImportColumnKey, label: string): string => {
    const parsed = parseSpanishNumber(get(key))
    if (parsed === null) {
      errors.push(`${label}: "${cellText(get(key))}" no es un número`)
      return ''
    }
    return parsed
  }
  const yesNo = (key: ImportColumnKey, label: string): boolean | null => {
    const parsed = parseYesNo(get(key))
    if (parsed === undefined) {
      errors.push(`${label}: "${cellText(get(key))}" tiene que ser Sí o No`)
      return null
    }
    return parsed
  }

  const propertyType = parsePropertyType(get('property_type'))
  if (propertyType === undefined) errors.push(`Tipo: "${cellText(get('property_type'))}" no es un tipo conocido`)

  const salePrice = num('sale_price', 'Precio de venta')
  const rentPrice = num('rent_price', 'Precio de alquiler')
  const operation = parseOperation(get('operation'), salePrice, rentPrice)
  if (operation === undefined) errors.push(`Operación: "${cellText(get('operation'))}" tiene que ser Venta, Alquiler o Venta y alquiler`)

  const idealistaCode = parseIdealistaCode(get('idealista_code'))
  if (idealistaCode === undefined) errors.push(`Código anuncio Idealista: "${cellText(get('idealista_code'))}" tiene que ser sólo números`)
  else if (idealistaCode === null) warnings.push('Sin código de Idealista: los leads de este anuncio no se van a vincular solos')

  const form: FormState = {
    ...FORM_STATE_EMPTY,
    infoBasica: {
      ...FORM_STATE_EMPTY.infoBasica,
      property_type: propertyType ?? '',
      street: cellText(get('street')),
      street_number: cellText(get('street_number')),
      postal_code: cellText(get('postal_code')),
      city: cellText(get('city')),
      for_sale: operation?.for_sale ?? false,
      for_rent: operation?.for_rent ?? false,
      sale_price: salePrice,
      rent_price: rentPrice,
    },
    detalle: {
      ...FORM_STATE_EMPTY.detalle,
      bedrooms: num('bedrooms', 'Habitaciones'),
      bathrooms: num('bathrooms', 'Baños'),
      has_elevator: yesNo('has_elevator', 'Ascensor'),
      sqm_built: num('sqm_built', 'm² construidos'),
      has_balcony: yesNo('has_balcony', 'Balcón'),
    },
  }

  // Lo que falta, con las reglas de la carga rápida. Si el valor estaba pero no se entendió,
  // ya hay un error más preciso arriba: no se repite como "falta".
  const unparsed = new Set<string>([
    ...(propertyType === undefined ? ['property_type'] : []),
    ...(operation === undefined ? ['operation'] : []),
  ])
  for (const issue of validateForm(form)?.issues ?? []) {
    if (unparsed.has(issue.key)) continue
    if (errors.some(e => e.startsWith(`${issue.label}:`))) continue
    // `validateForm` cuelga calle y número del mismo issue (comparten input en el form).
    if (issue.key === 'street' && form.infoBasica.street) errors.push('Falta el número de la calle')
    else errors.push(`Falta ${issue.label.toLowerCase()}`)
  }

  return { rowNumber, form, idealistaCode: idealistaCode ?? null, errors, warnings }
}

/**
 * La primera fila no vacía es la cabecera. Las columnas se reconocen por nombre (sin
 * importar mayúsculas ni acentos) y en cualquier orden; las que no son de la plantilla se
 * ignoran. Las filas totalmente vacías se saltean.
 */
export function parseSheet(data: Cell[][]): ParsedSheet {
  const isEmpty = (row: Cell[]) => row.every(c => cellText(c) === '')
  const headerIndex = data.findIndex(r => !isEmpty(r))
  if (headerIndex === -1) return { ok: false, error: 'El Excel está vacío' }

  const columnOf = new Map<ImportColumnKey, number>()
  data[headerIndex].forEach((h, i) => {
    const key = HEADER_TO_KEY.get(norm(cellText(h)))
    if (key && !columnOf.has(key)) columnOf.set(key, i)
  })
  const missing = IMPORT_COLUMNS.filter(c => !columnOf.has(c.key)).map(c => c.header)
  if (missing.length) {
    return { ok: false, error: `Faltan columnas: ${missing.join(', ')}. Descargá la plantilla y usá esos nombres.` }
  }

  const rows: ParsedImportRow[] = []
  const seenCodes = new Map<string, number>()
  for (let i = headerIndex + 1; i < data.length; i++) {
    if (isEmpty(data[i])) continue
    const row = parseRow(i + 1, key => data[i][columnOf.get(key)!])
    if (row.idealistaCode) {
      const first = seenCodes.get(row.idealistaCode)
      if (first) row.errors.push(`El código ${row.idealistaCode} ya está en la fila ${first}`)
      else seenCodes.set(row.idealistaCode, row.rowNumber)
    }
    rows.push(row)
  }
  if (!rows.length) return { ok: false, error: 'El Excel tiene la cabecera pero ninguna fila' }
  return { ok: true, rows }
}

/** Lo que va al RPC: el payload de siempre, sin agentes (se asignan después, con el equipo). */
export function buildImportPropertyPayload(row: ParsedImportRow): PropertyInsert {
  return {
    ...buildPropertyPayload(row.form),
    captured_by: null,
    commercialized_by: null,
    idealista_property_id: row.idealistaCode,
  }
}

export function buildImportAddressPayload(row: ParsedImportRow): AddressPayload {
  return buildAddressPayload(row.form.infoBasica)
}
