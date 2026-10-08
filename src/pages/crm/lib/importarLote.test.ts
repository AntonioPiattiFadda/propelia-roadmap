import { describe, expect, it } from 'vitest'
import { COLUMNAS_DEL_LOTE, leerLote, type Celda } from './importarLote'

const RESEARCH = [
  'TIP PARA LA PRIMERA LLAMADA', 'Pregunta por el gerente.', '',
  'PERSONAS DE LA EMPRESA', 'Ana Pérez | CEO | https://inmo.com | [DECISOR]', '',
  'TELEFONOS DE CONTACTO', 'Sin numeros adicionales', '',
  'POR QUE SE ELIGIO', 'Usa Inmovilla.',
].join('\n')

// Una fila válida del formato BCN-S01, con lo que haga falta pisado.
function fila(p: Partial<Record<(typeof COLUMNAS_DEL_LOTE)[number], Celda>> = {}): Celda[] {
  const base: Record<string, Celda> = {
    company_name: 'Finques Prat', google_maps_url: 'https://www.google.com/maps/search/?api=1&query=x',
    google_maps_phone: '+34661416906', idealista_url: 'https://www.idealista.com/pro/finques-prat/',
    idealista_phone: '+34936173548', idealista_listings: '30', idealista_years: 2, city: 'Barcelona',
    neighborhood: 'Eixample', office_address: 'Av. Diagonal, 630', website: 'http://www.finquesprat.cat',
    agents_count: null, current_crm: 'Inmovilla', email: 'Info@FinquesPrat.cat', first_name: 'Ana',
    last_name: 'Pérez', contact_role: 'CEO', phone: '+34690719794', phone_source: 'agency_web',
    alternative_phone_1: null, alternative_phone_1_source: null, alternative_phone_1_role: null,
    alternative_phone_2: null, alternative_phone_2_source: null, alternative_phone_2_role: null,
    selection_reason: 'inmovilla', import_batch: 'BCN-S01', batch_activated_on: '2026-10-07',
    sdr_research: RESEARCH,
  }
  const v = { ...base, ...p }
  return COLUMNAS_DEL_LOTE.map(c => v[c])
}
const hoja = (...filas: Celda[][]): Celda[][] => [[...COLUMNAS_DEL_LOTE], ...filas]
const errores = (h: Celda[][]) => { const r = leerLote(h); return r.ok ? [] : r.errores.map(e => e.mensaje) }

describe('leerLote — encabezados', () => {
  it('el formato BCN-S01 tiene 29 columnas', () => expect(COLUMNAS_DEL_LOTE).toHaveLength(29))

  it('una hoja vacía no es un lote', () => expect(errores([])).toEqual(['El archivo no tiene filas.']))

  it('las columnas se buscan por nombre, no por posición', () => {
    const cols = [...COLUMNAS_DEL_LOTE].reverse()
    const r = leerLote([cols, [...fila()].reverse()])
    expect(r.ok && r.filas[0].company_name).toBe('Finques Prat')
  })

  it('falta una columna: se rechaza el archivo entero', () => {
    const cols = COLUMNAS_DEL_LOTE.filter(c => c !== 'sdr_research')
    expect(errores([cols, fila().slice(0, -1)])).toContain('Falta la columna «sdr_research».')
  })

  it('una columna que no conoce: se rechaza (el formato cambió)', () => {
    expect(errores([[...COLUMNAS_DEL_LOTE, 'sdr_advice'], [...fila(), 'x']]))
      .toContain('Columna desconocida: «sdr_advice». ¿Cambió el formato del Excel?')
  })

  it('una columna repetida: se rechaza', () => {
    expect(errores([[...COLUMNAS_DEL_LOTE, 'city'], [...fila(), 'x']])).toContain('La columna «city» está dos veces.')
  })

  it('tolera espacios alrededor del nombre de la columna', () => {
    const r = leerLote([COLUMNAS_DEL_LOTE.map(c => ` ${c} `), fila()])
    expect(r.ok).toBe(true)
  })
})

describe('leerLote — filas', () => {
  it('convierte una fila válida a lo que espera la base', () => {
    const r = leerLote(hoja(fila()))
    expect(r).toEqual({
      ok: true, lote: 'BCN-S01',
      filas: [{
        fila: 2, company_name: 'Finques Prat', google_maps_url: 'https://www.google.com/maps/search/?api=1&query=x',
        google_maps_phone: '+34661416906', idealista_url: 'https://www.idealista.com/pro/finques-prat/',
        idealista_phone: '+34936173548', idealista_listings: 30, idealista_years: 2, city: 'Barcelona',
        neighborhood: 'Eixample', office_address: 'Av. Diagonal, 630', website: 'http://www.finquesprat.cat',
        agents_count: null, current_crm: 'Inmovilla', email: 'info@finquesprat.cat', first_name: 'Ana',
        last_name: 'Pérez', contact_role: 'CEO', selection_reason: 'inmovilla', import_batch: 'BCN-S01',
        batch_activated_on: '2026-10-07', sdr_research: RESEARCH,
      }],
    })
  })

  it('los teléfonos del contacto y los alternativos no se leen: ya están en el research', () => {
    const r = leerLote(hoja(fila({ phone: 'cualquier cosa', alternative_phone_1: 'no es un teléfono' })))
    expect(r.ok).toBe(true)
    expect(r.ok && Object.keys(r.filas[0])).not.toContain('phone')
  })

  it('saltea las filas vacías del final', () => {
    const r = leerLote(hoja(fila(), COLUMNAS_DEL_LOTE.map(() => null), COLUMNAS_DEL_LOTE.map(() => '  ')))
    expect(r.ok && r.filas).toHaveLength(1)
  })

  it('sin filas de datos no hay lote', () => expect(errores(hoja())).toEqual(['El archivo no tiene filas.']))

  it('obligatorias: empresa, ficha de Idealista, motivo, lote y research', () => {
    const e = errores(hoja(fila({ company_name: ' ', idealista_url: null, selection_reason: '', import_batch: null, sdr_research: '' })))
    expect(e).toEqual(expect.arrayContaining([
      'Fila 2: falta «company_name».', 'Fila 2: falta «idealista_url».', 'Fila 2: falta «selection_reason».',
      'Fila 2: falta «import_batch».', 'Fila 2: falta «sdr_research».',
    ]))
  })

  it('la ficha tiene que ser de Idealista', () => {
    expect(errores(hoja(fila({ idealista_url: 'https://fotocasa.es/x' }))))
      .toContain('Fila 2: «idealista_url» no es una ficha de Idealista.')
  })

  it('la misma ficha dos veces en el archivo (con o sin www ni barra final) se rechaza', () => {
    expect(errores(hoja(fila(), fila({ idealista_url: 'https://idealista.com/pro/FINQUES-PRAT' }))))
      .toContain('Fila 3: la ficha de Idealista ya está en la fila 2.')
  })

  it('un solo lote por archivo', () => {
    expect(errores(hoja(fila(), fila({ idealista_url: 'https://www.idealista.com/pro/otra/', import_batch: 'BCN-S02' }))))
      .toContain('Fila 3: el lote es «BCN-S02» y el archivo es del «BCN-S01». Un archivo, un lote.')
  })

  it('teléfonos de Google Maps e Idealista: +34 y 9 cifras (los espacios se toleran)', () => {
    const r = leerLote(hoja(fila({ google_maps_phone: '+34 661 41 69 06' })))
    expect(r.ok && r.filas[0].google_maps_phone).toBe('+34661416906')
    expect(errores(hoja(fila({ idealista_phone: '936173548' }))))
      .toContain('Fila 2: «idealista_phone» tiene que ser +34 y 9 cifras.')
  })

  it('enteros no negativos, como número o como texto', () => {
    expect(errores(hoja(fila({ idealista_listings: '-1' })))).toContain('Fila 2: «idealista_listings» tiene que ser un entero ≥ 0.')
    expect(errores(hoja(fila({ agents_count: 2.5 })))).toContain('Fila 2: «agents_count» tiene que ser un entero ≥ 0.')
  })

  it('la fecha: texto AAAA-MM-DD o una celda de fecha del Excel', () => {
    const r = leerLote(hoja(fila({ batch_activated_on: new Date(Date.UTC(2026, 9, 7)) })))
    expect(r.ok && r.filas[0].batch_activated_on).toBe('2026-10-07')
    expect(errores(hoja(fila({ batch_activated_on: '07/10/2026' }))))
      .toContain('Fila 2: «batch_activated_on» tiene que ser una fecha AAAA-MM-DD.')
  })

  it('el motivo tiene que ser uno de los del check de la base', () => {
    expect(errores(hoja(fila({ selection_reason: 'big' }))))
      .toContain('Fila 2: «selection_reason» tiene que ser inmovilla, new o small.')
  })

  it('el email se guarda en minúsculas y tiene que parecer un email', () => {
    expect(errores(hoja(fila({ email: 'info@' })))).toContain('Fila 2: «email» no es un email.')
  })

  it('el research tiene que traer sus cuatro secciones', () => {
    expect(errores(hoja(fila({ sdr_research: 'TIP PARA LA PRIMERA LLAMADA\nhola' }))))
      .toContain('Fila 2: a «sdr_research» le faltan secciones: PERSONAS DE LA EMPRESA, TELEFONOS DE CONTACTO, POR QUE SE ELIGIO.')
  })

  it('«Sin identificar» no es un CRM', () => {
    const r = leerLote(hoja(fila({ current_crm: 'Sin identificar' })))
    expect(r.ok && r.filas[0].current_crm).toBeNull()
  })
})
