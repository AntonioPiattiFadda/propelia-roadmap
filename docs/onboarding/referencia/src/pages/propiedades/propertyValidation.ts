import {
  getMissingFieldsForIdealista, idealistaProfileFor,
  type PropertyLike,
} from '@/lib/propertyFieldRequirements'
import { isEnergyRating } from '@/lib/energyCertificate'
import { COWORKING, COWORKING_AREA_MESSAGE, COWORKING_RENT_ONLY_MESSAGE, coworkingAreaOutOfRange, isCoworkingAllowed } from '@/lib/coworking'
import { buildAddressPayload, buildPropertyPayload, toNum, type FormState } from './propertyPayload'
import type { DetalleState } from './components/DetalleSection'
import type { PublicacionState } from './components/PublicacionSection'

export type InfoBasicaErrors = Partial<Record<'property_type' | 'street' | 'operation' | 'sale_price' | 'rent_price' | 'address_visibility', string>>
// Con Idealista encendido cualquier campo de Detalle (incluidos los de tipología) puede
// quedar obligatorio, así que la clave es cualquier campo del estado y no una lista fija.
export type DetalleErrors = Partial<Record<keyof DetalleState, string>>

export type FormErrors = {
  infoBasica?:  InfoBasicaErrors
  detalle?:     DetalleErrors
}

export type ErrorSection = keyof FormErrors

/** Un dato que falta: la sección y la clave del error, para poder llevar el scroll al campo. */
export type ValidationIssue = {
  section: ErrorSection
  key: string
  label: string
}

export type ValidationResult = {
  errors: FormErrors
  firstSection: ErrorSection
  labels: string[]
  issues: ValidationIssue[]
}

export type ValidateOptions = {
  /** Se publica en Idealista: suma los obligatorios del portal a los de matching. */
  idealista?: boolean
  /**
   * La propiedad tiene un anuncio vivo en Idealista (G11 del spec
   * 2026-09-29-idealista-energy-g-design.md): con "disponible", la letra es obligatoria aunque
   * este guardado no publique.
   */
  idealistaLinked?: boolean
}

/** El form va a publicar en Idealista: destino "portales" con Idealista marcado. */
export const publishesToIdealista = (pb: Pick<PublicacionState, 'destination' | 'portal_idealista'>): boolean =>
  pb.destination === 'portals' && pb.portal_idealista

/**
 * El estado del form traducido a `PropertyLike`, que es lo que entiende el pre-vuelo de
 * Idealista (propertyFieldRequirements.ts). Sale de los MISMOS builders que arman el
 * payload que se guarda: si el pre-vuelo leyera el form por su cuenta, podría dar por
 * cargado algo que el payload termina escribiendo como null.
 */
export function formToPropertyLike(form: FormState): PropertyLike {
  const payload = buildPropertyPayload(form)
  const address = buildAddressPayload(form.infoBasica)
  return {
    ...payload,
    property_type: payload.property_type ?? null,
    for_sale: form.infoBasica.for_sale,
    for_rent: form.infoBasica.for_rent,
    sale_price: payload.sale_price ?? null,
    rent_price: payload.rent_price ?? null,
    bedrooms: payload.bedrooms ?? null,
    bathrooms: payload.bathrooms ?? null,
    has_elevator: payload.has_elevator ?? null,
    has_balcony: payload.has_balcony ?? null,
    sqm_built: payload.sqm_built ?? null,
    address: { ...address, street: address.street ?? null },
  }
}

/**
 * La `key` de un requisito del pre-vuelo NO siempre es el nombre del campo del form.
 * Los que no están acá coinciden (bedrooms, energy_class, los de tipología...).
 */
const FORM_KEY_OF_REQUIREMENT: Record<string, string> = {
  operation_price: 'operation',
  address: 'street',
  area_constructed: 'sqm_built',
}

/** Requisitos que viven en `infoBasica`; el resto son campos de `detalle`. */
const INFO_BASICA_REQUIREMENTS = new Set(['property_type', 'operation_price', 'address', 'address_visibility'])

// El contacto de Idealista es del agente, no del inmueble: no hay campo en el form.
const NOT_IN_FORM = new Set(['contact'])

/**
 * Qué campos del form exige Idealista para ESTE inmueble (base + tipología, con los
 * condicionales resueltos contra lo que ya está cargado). Son claves del form, listas
 * para decidir el asterisco.
 */
export function idealistaRequiredKeys(form: FormState): Set<string> {
  const like = formToPropertyLike(form)
  const keys = idealistaProfileFor(like.property_type, like)
    .filter(r => !NOT_IN_FORM.has(r.key))
    .map(r => FORM_KEY_OF_REQUIREMENT[r.key] ?? r.key)
  return new Set(keys)
}

// Las etiquetas del pre-vuelo son para un listado; en el toast alcanza con el nombre.
const SHORT_LABELS: Record<string, string> = {
  energy_class: 'Certificado energético',
  address: 'Dirección',
}

const ADDRESS_PARTS: { key: keyof NonNullable<PropertyLike['address']>; label: string }[] = [
  { key: 'street', label: 'calle' },
  { key: 'street_number', label: 'número' },
  { key: 'postal_code', label: 'código postal' },
  { key: 'city', label: 'ciudad' },
  { key: 'country', label: 'país' },
  { key: 'latitude', label: 'ubicación en el mapa' },
]

function missingAddressMessage(like: PropertyLike): string {
  const a = like.address
  const missing = ADDRESS_PARTS
    .filter(({ key }) => a?.[key] == null || a[key] === '')
    .map(p => p.label)
  const list = missing.length ? missing.join(', ') : 'calle, número, código postal y ciudad'
  return `Idealista necesita la dirección completa (falta: ${list}). Elegila de la lista de sugerencias.`
}

/** El error de la letra cuando el certificado está disponible. Lo reusa la regla de G11. */
export const IDEALISTA_ENERGY_LETTER_MESSAGE = 'Con el certificado disponible, Idealista exige la letra de consumo (A a G)'

function idealistaFieldMessage(key: string, like: PropertyLike): string {
  // En trámite o exento ya no llegan acá: Idealista recibe `G` (spec
  // 2026-09-29-idealista-energy-g-design.md). Lo que falta con `disponible` es la letra.
  if (key === 'energy_class' && like.energy_certificate_status === 'disponible') {
    return IDEALISTA_ENERGY_LETTER_MESSAGE
  }
  return 'Idealista exige este dato para publicar'
}

// Bloquean exactamente los mismos campos que la carga rápida (MATCHING_PROFILE
// en propertyFieldRequirements.ts), para no exigir en el wizard completo nada
// que la carga rápida no pida. Con `idealista` se suman los obligatorios del portal
// (idealistaProfileFor), para que el anuncio no rebote contra su API.
export function validateForm(form: FormState, options: ValidateOptions = {}): ValidationResult | null {
  const infoBasica: InfoBasicaErrors = {}
  const detalle: DetalleErrors = {}
  const issues: ValidationIssue[] = []
  const miss = (section: ErrorSection, key: string, label: string) => issues.push({ section, key, label })

  const ib = form.infoBasica
  if (!ib.property_type) {
    infoBasica.property_type = 'Seleccioná el tipo de inmueble'
    miss('infoBasica', 'property_type', 'Tipo de inmueble')
  }
  // Calle y número comparten UN input, así que los dos errores cuelgan de `street`: uno
  // colgado de un `street_number` inexistente sería un error sin input al lado. El
  // `else if` evita empujar 'Dirección' dos veces al mismo listado.
  if (!ib.street.trim()) {
    infoBasica.street = 'Ingresá la dirección'
    miss('infoBasica', 'street', 'Dirección')
  } else if (!ib.street_number.trim()) {
    infoBasica.street = 'La dirección tiene que incluir el número (ej: Carrer de Manso 58)'
    miss('infoBasica', 'street', 'Dirección')
  }
  if (!ib.for_sale && !ib.for_rent) {
    infoBasica.operation = 'Marcá si la operación es venta o alquiler'
    miss('infoBasica', 'operation', 'Operación')
  }
  if (ib.for_sale && toNum(ib.sale_price) == null) {
    infoBasica.sale_price = 'Ingresá el precio de venta'
    miss('infoBasica', 'sale_price', 'Precio de venta')
  }
  if (ib.for_rent && toNum(ib.rent_price) == null) {
    infoBasica.rent_price = 'Ingresá el precio de alquiler'
    miss('infoBasica', 'rent_price', 'Precio de alquiler')
  }

  const d = form.detalle
  if (toNum(d.bedrooms) == null) {
    detalle.bedrooms = 'Ingresá el número de habitaciones'
    miss('detalle', 'bedrooms', 'Habitaciones')
  }
  if (toNum(d.bathrooms) == null) {
    detalle.bathrooms = 'Ingresá el número de baños'
    miss('detalle', 'bathrooms', 'Baños')
  }
  if (d.has_elevator == null) {
    detalle.has_elevator = 'Indicá si tiene ascensor'
    miss('detalle', 'has_elevator', 'Ascensor')
  }

  if (options.idealista) {
    // Las tipologías que Idealista no deja crear (traspaso, casa rústica) NO frenan el
    // guardado: el tipo es write-once y un error ahí trababa la ficha para siempre. Ese
    // bloqueo es del "Crear anuncio" y lo aplica useCreateIdealistaAd (idealistaCreateBlocker).

    const like = formToPropertyLike(form)
    for (const req of getMissingFieldsForIdealista(like)) {
      if (NOT_IN_FORM.has(req.key)) continue
      const formKey = FORM_KEY_OF_REQUIREMENT[req.key] ?? req.key

      if (INFO_BASICA_REQUIREMENTS.has(req.key)) {
        const errKey = formKey as keyof InfoBasicaErrors
        // Tipo y operación+precio ya los cubre matching con su propio mensaje.
        if (req.key === 'property_type' || req.key === 'operation_price') continue
        if (infoBasica[errKey]) continue
        infoBasica[errKey] = req.key === 'address' ? missingAddressMessage(like) : idealistaFieldMessage(req.key, like)
        miss('infoBasica', errKey, SHORT_LABELS[req.key] ?? req.label)
      } else {
        const errKey = formKey as keyof DetalleState
        if (detalle[errKey]) continue
        detalle[errKey] = idealistaFieldMessage(req.key, like)
        miss('detalle', errKey, SHORT_LABELS[req.key] ?? req.label)
      }
    }

    // Coworking (spec 2026-10-12 §2): dos reglas de Idealista que dependen de un VALOR, no de
    // si el campo está cargado, así que el pre-vuelo no las expresa. Las dos cuelgan de
    // campos EDITABLES. La operación es write-once y un error ahí repetiría Balmes 23. La
    // distribución no da error: la corrige el alta.
    if (ib.property_type === 'office' && d.office_subtype === COWORKING) {
      if (!detalle.sqm_built && coworkingAreaOutOfRange(toNum(d.sqm_built))) {
        detalle.sqm_built = COWORKING_AREA_MESSAGE
        miss('detalle', 'sqm_built', 'M² construidos')
      }
      if (!detalle.office_subtype && !isCoworkingAllowed(ib)) {
        detalle.office_subtype = COWORKING_RENT_ONLY_MESSAGE
        miss('detalle', 'office_subtype', 'Tipo de oficina')
      }
    }
  }

  // G11: vinculada a Idealista y "disponible" sin letra dejaría el anuncio en `G` con la ficha
  // diciendo "disponible". Si el pre-vuelo de Idealista ya marcó la letra, no se repite.
  if (
    options.idealistaLinked
    && !detalle.energy_class
    && form.detalle.energy_certificate_status === 'disponible'
    && !isEnergyRating(form.detalle.energy_class)
  ) {
    detalle.energy_class = IDEALISTA_ENERGY_LETTER_MESSAGE
    miss('detalle', 'energy_class', SHORT_LABELS.energy_class)
  }

  const errors: FormErrors = {}
  if (Object.keys(infoBasica).length) errors.infoBasica = infoBasica
  if (Object.keys(detalle).length) errors.detalle = detalle
  if (!Object.keys(errors).length) return null

  const firstSection: ErrorSection = errors.infoBasica ? 'infoBasica' : 'detalle'
  return { errors, firstSection, labels: issues.map(i => i.label), issues }
}
