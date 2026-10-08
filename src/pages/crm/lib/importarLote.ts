/* NUEVO. Leer un lote de inmobiliarias del Excel (formato BCN-S01) y dejarlo como lo espera
   `crm_importar_lote` (supabase/schema.sql). Acá vive TODO lo que se puede decidir mirando el
   archivo solo: columnas, formatos, obligatorias. Lo que depende de la base —si la inmobiliaria
   ya existe, si se parece a otra, qué etiqueta de CRM es nueva— lo decide la RPC.

   Un archivo con un solo error no entra: el agente que arma los lotes puede cambiar el formato
   de un día para el otro (pasó: `sdr_advice` → `sdr_research`), y es mejor enterarse en el
   preview que con 300 filas a medio cargar. */
import { MOTIVOS_DE_SELECCION, parsearFecha, type MotivoDeSeleccion } from './inmobiliaria'

/** Las 29 columnas del BCN-S01. Se buscan por nombre: el orden puede cambiar. */
export const COLUMNAS_DEL_LOTE = [
  'company_name', 'google_maps_url', 'google_maps_phone', 'idealista_url', 'idealista_phone',
  'idealista_listings', 'idealista_years', 'city', 'neighborhood', 'office_address', 'website',
  'agents_count', 'current_crm', 'email', 'first_name', 'last_name', 'contact_role', 'phone',
  'phone_source', 'alternative_phone_1', 'alternative_phone_1_source', 'alternative_phone_1_role',
  'alternative_phone_2', 'alternative_phone_2_source', 'alternative_phone_2_role',
  'selection_reason', 'import_batch', 'batch_activated_on', 'sdr_research',
] as const
type Columna = (typeof COLUMNAS_DEL_LOTE)[number]

/* El research trae siempre estas cuatro secciones (verificado en las 300 filas del BCN-S01): el
   import busca contactos nuevos adentro de dos de ellas, así que sin todas no se sabe leerlo. */
export const SECCIONES_DEL_RESEARCH = [
  'TIP PARA LA PRIMERA LLAMADA', 'PERSONAS DE LA EMPRESA', 'TELEFONOS DE CONTACTO', 'POR QUE SE ELIGIO',
] as const

/** Lo que devuelve read-excel-file por celda. */
export type Celda = string | number | boolean | Date | null | undefined

/* Lo que se manda a la RPC. `phone` y los alternativos NO están a propósito: todos esos números
   ya figuran en la sección «TELEFONOS DE CONTACTO» del research o son el de Google Maps
   (verificado fila por fila: no se pierde ninguno). */
export type FilaDelLote = {
  /** El renglón del Excel (el encabezado es el 1), para decir dónde está cada cosa. */
  fila: number
  company_name: string
  google_maps_url: string | null
  google_maps_phone: string | null
  idealista_url: string
  idealista_phone: string | null
  idealista_listings: number | null
  idealista_years: number | null
  city: string | null
  neighborhood: string | null
  office_address: string | null
  website: string | null
  agents_count: number | null
  current_crm: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  contact_role: string | null
  selection_reason: MotivoDeSeleccion
  import_batch: string
  batch_activated_on: string | null
  sdr_research: string
}

export type LoteLeido =
  | { ok: true; lote: string; filas: FilaDelLote[] }
  | { ok: false; errores: { fila: number | null; mensaje: string }[] }

const TELEFONO = /^\+34\d{9}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IDEALISTA = /^(https?:\/\/)?(www\.)?idealista\.com\//i

/** Una celda como texto: vacío es null. Una fecha del Excel llega como `Date` en UTC. */
function texto(c: Celda): string | null {
  if (c === null || c === undefined) return null
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10)
  const s = String(c).trim()
  return s === '' ? null : s
}

/** La misma clave que `crm_url_clave()` de la base: sin esquema, sin www y sin barra final. */
export function claveDeFicha(url: string): string {
  return url.trim().toLowerCase().replace(/^[a-z]+:\/\/(www\.)?/, '').replace(/\/+$/, '')
}

export function leerLote(hoja: Celda[][]): LoteLeido {
  const errores: { fila: number | null; mensaje: string }[] = []
  const general = (mensaje: string) => errores.push({ fila: null, mensaje })
  if (hoja.length === 0) return { ok: false, errores: [{ fila: null, mensaje: 'El archivo no tiene filas.' }] }

  // ---------- Encabezados ----------
  const encabezados = hoja[0].map(c => texto(c) ?? '')
  const indice = new Map<string, number>()
  encabezados.forEach((h, i) => {
    if (!h) return
    if (indice.has(h)) general(`La columna «${h}» está dos veces.`)
    else indice.set(h, i)
  })
  for (const h of indice.keys()) {
    if (!(COLUMNAS_DEL_LOTE as readonly string[]).includes(h)) {
      general(`Columna desconocida: «${h}». ¿Cambió el formato del Excel?`)
    }
  }
  for (const c of COLUMNAS_DEL_LOTE) if (!indice.has(c)) general(`Falta la columna «${c}».`)
  if (errores.length > 0) return { ok: false, errores }

  // ---------- Filas ----------
  const filas: FilaDelLote[] = []
  const fichas = new Map<string, number>()
  let lote: string | null = null

  hoja.slice(1).forEach((celdas, i) => {
    const n = i + 2
    const valor = (c: Columna) => texto(celdas[indice.get(c)!])
    if (COLUMNAS_DEL_LOTE.every(c => valor(c) === null)) return
    const error = (mensaje: string) => errores.push({ fila: n, mensaje: `Fila ${n}: ${mensaje}` })

    const obligatoria = (c: Columna) => {
      const v = valor(c)
      if (v === null) error(`falta «${c}».`)
      return v ?? ''
    }
    const telefono = (c: Columna) => {
      const v = valor(c)?.replace(/\s+/g, '') ?? null
      if (v !== null && !TELEFONO.test(v)) error(`«${c}» tiene que ser +34 y 9 cifras.`)
      return v
    }
    const entero = (c: Columna) => {
      const v = valor(c)
      if (v === null) return null
      if (!/^\d+$/.test(v)) { error(`«${c}» tiene que ser un entero ≥ 0.`); return null }
      return Number(v)
    }

    const company_name = obligatoria('company_name')
    const idealista_url = obligatoria('idealista_url')
    if (idealista_url) {
      if (!IDEALISTA.test(idealista_url)) error('«idealista_url» no es una ficha de Idealista.')
      const clave = claveDeFicha(idealista_url)
      const antes = fichas.get(clave)
      if (antes !== undefined) error(`la ficha de Idealista ya está en la fila ${antes}.`)
      else fichas.set(clave, n)
    }

    const motivo = obligatoria('selection_reason')
    const selection_reason = MOTIVOS_DE_SELECCION.find(m => m.valor === motivo)?.valor
    if (motivo && !selection_reason) {
      error(`«selection_reason» tiene que ser ${MOTIVOS_DE_SELECCION.map(m => m.valor).join(', ').replace(/, (?=[^,]*$)/, ' o ')}.`)
    }

    const import_batch = obligatoria('import_batch')
    if (import_batch) {
      if (lote === null) lote = import_batch
      else if (import_batch !== lote) error(`el lote es «${import_batch}» y el archivo es del «${lote}». Un archivo, un lote.`)
    }

    const fecha = parsearFecha(valor('batch_activated_on') ?? '')
    if (!fecha.ok) error('«batch_activated_on» tiene que ser una fecha AAAA-MM-DD.')

    const email = valor('email')?.toLowerCase() ?? null
    if (email !== null && !EMAIL.test(email)) error('«email» no es un email.')

    const sdr_research = obligatoria('sdr_research')
    if (sdr_research) {
      const faltan = SECCIONES_DEL_RESEARCH.filter(s => !sdr_research.includes(s))
      if (faltan.length > 0) error(`a «sdr_research» le faltan secciones: ${faltan.join(', ')}.`)
    }

    // «Sin identificar» no es un CRM: es no saberlo (la RPC hace el mismo corte).
    const crm = valor('current_crm')
    const current_crm = crm && crm.toLowerCase() === 'sin identificar' ? null : crm

    filas.push({
      fila: n, company_name,
      google_maps_url: valor('google_maps_url'), google_maps_phone: telefono('google_maps_phone'),
      idealista_url, idealista_phone: telefono('idealista_phone'),
      idealista_listings: entero('idealista_listings'), idealista_years: entero('idealista_years'),
      city: valor('city'), neighborhood: valor('neighborhood'), office_address: valor('office_address'),
      website: valor('website'), agents_count: entero('agents_count'), current_crm, email,
      first_name: valor('first_name'), last_name: valor('last_name'), contact_role: valor('contact_role'),
      selection_reason: selection_reason ?? 'new', import_batch,
      batch_activated_on: fecha.ok ? fecha.valor : null, sdr_research,
    })
  })

  if (filas.length === 0 && errores.length === 0) general('El archivo no tiene filas.')
  if (errores.length > 0 || lote === null) return { ok: false, errores }
  return { ok: true, lote, filas }
}
