import type { Property, PropertyInsert, PropertyUpdate } from '@/types/properties.types'
import type { AddressPayload } from '@/service/addresses.service'
import type { Tables } from '@/types/database.types'
import { normalizeEnergyForSave } from '@/lib/energyCertificate'
import { INFO_BASICA_EMPTY, type InfoBasicaState } from './components/InfoBasicaSection'
import { MATERIAL_EMPTY, type MaterialState } from './components/MaterialSection'
import { DETALLE_EMPTY, type DetalleState } from './components/DetalleSection'
import { NOTAS_VALORACION_EMPTY, type NotasValoracionState } from './components/NotasValoracionSection'
import { DESCRIPCION_EMPTY, type DescripcionState } from './components/DescripcionSection'
import { DOCUMENTACION_EMPTY, type DocumentacionState } from './components/DocumentacionSection'
import { PUBLICACION_EMPTY, type PublicacionState } from './components/PublicacionSection'

export type FormState = {
  infoBasica:      InfoBasicaState
  material:        MaterialState
  detalle:         DetalleState
  notasValoracion: NotasValoracionState
  descripcion:     DescripcionState
  documentacion:   DocumentacionState
  publicacion:     PublicacionState
}

export const FORM_STATE_EMPTY: FormState = {
  infoBasica:      INFO_BASICA_EMPTY,
  material:        MATERIAL_EMPTY,
  detalle:         DETALLE_EMPTY,
  notasValoracion: NOTAS_VALORACION_EMPTY,
  descripcion:     DESCRIPCION_EMPTY,
  documentacion:   DOCUMENTACION_EMPTY,
  publicacion:     PUBLICACION_EMPTY,
}

export const toNum = (s: string): number | null => {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const orNull = (s: string): string | null => (s.trim() ? s.trim() : null)

export function buildAddressPayload(
  ib: Pick<InfoBasicaState, 'street' | 'street_number' | 'addr_floor' | 'door' | 'neighborhood' | 'city' | 'province' | 'postal_code' | 'country' | 'latitude' | 'longitude' | 'zone_id' | 'google_components'>,
): AddressPayload {
  return {
    street: orNull(ib.street),
    street_number: orNull(ib.street_number),
    floor: orNull(ib.addr_floor),
    door: orNull(ib.door),
    neighborhood: orNull(ib.neighborhood),
    city: orNull(ib.city),
    province: orNull(ib.province),
    postal_code: orNull(ib.postal_code),
    country: orNull(ib.country),
    latitude: ib.latitude ?? null,
    longitude: ib.longitude ?? null,
    zone_id: ib.zone_id ?? null,
    // Sólo si la dirección vino fresca del buscador. Si no, las claves NO van: el
    // completado las toma de la fila guardada (o las recalcula si cambió la ubicación).
    ...(ib.google_components ?? {}),
  }
}

// Regla de negocio compartida entre el wizard completo (buildPropertyPayload) y
// el dialog de conciliación de Idealista (buildIdealistaGapPayload): a partir de
// for_sale/for_rent/sale_price/rent_price deriva operation_type y price. Antes
// estaba duplicada a mano en IdealistaGapDialog.tsx.
export function buildOperationFields(
  ib: Pick<InfoBasicaState, 'for_sale' | 'for_rent' | 'sale_price' | 'rent_price'>,
): Pick<PropertyInsert, 'for_sale' | 'for_rent' | 'sale_price' | 'rent_price' | 'operation_type' | 'price'> {
  const salePrice = ib.for_sale ? toNum(ib.sale_price) : null
  const rentPrice = ib.for_rent ? toNum(ib.rent_price) : null
  return {
    for_sale: ib.for_sale,
    for_rent: ib.for_rent,
    sale_price: salePrice,
    rent_price: rentPrice,
    operation_type: ib.for_sale ? 'sale' : ib.for_rent ? 'rent' : null,
    // Los filtros del listado consultan la columna `price`
    price: salePrice ?? rentPrice,
  }
}

export function buildPropertyPayload(form: FormState): PropertyInsert {
  const { infoBasica: ib, material: m, detalle: d, notasValoracion: nv, descripcion: ds, documentacion: doc, publicacion: pb } = form

  // El certificado se limpia ACÁ, al construir el payload, y no con un useEffect (spec §4): sin
  // `disponible` no viajan letra ni valores, y una letra que no es A–G no llega al CHECK.
  const energy = normalizeEnergyForSave(d)

  return {
    // Info básica
    property_type: (ib.property_type || null) as PropertyInsert['property_type'],
    address_visibility: ib.address_visibility,
    sale_situation: ib.for_sale ? ib.sale_situation : null,
    rental_type: ib.for_rent ? ib.rental_type : null,
    ...buildOperationFields(ib),

    // Detalle
    is_penthouse: d.is_penthouse,
    is_studio: d.is_studio,
    is_duplex: d.is_duplex,
    is_bank_owned: d.is_bank_owned,
    sqm_built: toNum(d.sqm_built),
    sqm_usable: toNum(d.sqm_usable),
    sqm_plot: toNum(d.sqm_plot),
    bedrooms: toNum(d.bedrooms),
    bathrooms: toNum(d.bathrooms),
    floor: toNum(d.property_floor),
    total_floors: toNum(d.total_floors),
    year_built: toNum(d.year_built),
    energy_certificate_status: (energy.energy_certificate_status || null) as PropertyInsert['energy_certificate_status'],
    energy_class: (energy.energy_class || null) as PropertyInsert['energy_class'],
    energy_consumption: toNum(energy.energy_consumption),
    emissions_class: (energy.emissions_class || null) as PropertyInsert['emissions_class'],
    emissions_value: toNum(energy.emissions_value),
    conservation_status: (d.conservation_status || null) as PropertyInsert['conservation_status'],
    is_interior: d.is_interior,
    has_elevator: d.has_elevator,
    orientation_north: d.orientation_north,
    orientation_south: d.orientation_south,
    orientation_east: d.orientation_east,
    orientation_west: d.orientation_west,
    ibi: toNum(d.ibi),
    community_fees: toNum(d.community_fees),
    has_active_derrama: d.has_active_derrama,
    ite_status: (d.ite_status || null) as PropertyInsert['ite_status'],
    ite_year: toNum(d.ite_year),
    has_terrace: d.has_terrace,
    has_pool: d.has_pool,
    has_parking: d.has_parking,
    has_storage_room: d.has_storage_room,
    has_air_conditioning: d.has_air_conditioning,
    has_doorman: d.has_doorman,
    has_furnished: d.has_furnished,
    has_equipped_kitchen: d.has_equipped_kitchen,
    has_built_in_wardrobes: d.has_built_in_wardrobes,
    has_balcony: d.has_balcony,
    has_garden: d.has_garden,
    has_adapted_exterior_access: d.has_adapted_exterior_access,
    has_wheelchair_adapted_interior: d.has_wheelchair_adapted_interior,
    heating_type: d.heating_type || null,
    has_heating: d.heating_type === 'individual' || d.heating_type === 'centralized',
    heating_fuel: (d.heating_fuel || null) as PropertyInsert['heating_fuel'],

    // Campos de tipologia (migracion 20260904140000). Los enums vacios van como null
    // -- NUNCA como cadena vacia, que el enum de Postgres rechaza --, los numeros por
    // toNum, y los tribool CRUDOS: null tiene que sobrevivir como "sin responder",
    // porque false es un dato concreto que se publicaria en un anuncio real.
    //
    // Los casts son por los enums de Postgres: orNull devuelve `string | null` y el
    // tipo generado es la union del enum.
    house_subtype: orNull(d.house_subtype) as PropertyInsert['house_subtype'],
    rustic_house_subtype: orNull(d.rustic_house_subtype) as PropertyInsert['rustic_house_subtype'],
    garage_capacity: orNull(d.garage_capacity) as PropertyInsert['garage_capacity'],
    commercial_subtype: orNull(d.commercial_subtype) as PropertyInsert['commercial_subtype'],
    commercial_location: orNull(d.commercial_location) as PropertyInsert['commercial_location'],
    commercial_is_transfer: d.commercial_is_transfer,
    commercial_main_activity: orNull(d.commercial_main_activity),
    office_subtype: orNull(d.office_subtype) as PropertyInsert['office_subtype'],
    office_rooms_splitted: orNull(d.office_rooms_splitted) as PropertyInsert['office_rooms_splitted'],
    office_lift_number: toNum(d.office_lift_number),
    office_is_office_building: d.office_is_office_building,
    conditioned_air_type: orNull(d.conditioned_air_type) as PropertyInsert['conditioned_air_type'],
    parking_spaces_number: toNum(d.parking_spaces_number),
    land_subtype: orNull(d.land_subtype) as PropertyInsert['land_subtype'],
    land_road_access: d.land_road_access,
    land_access_type: orNull(d.land_access_type) as PropertyInsert['land_access_type'],
    land_classification: orNull(d.land_classification) as PropertyInsert['land_classification'],
    building_has_tenants: d.building_has_tenants,
    room_subtype: orNull(d.room_subtype) as PropertyInsert['room_subtype'],
    room_bed_type: orNull(d.room_bed_type) as PropertyInsert['room_bed_type'],
    room_available_from: orNull(d.room_available_from),
    room_minimal_stay: toNum(d.room_minimal_stay),
    room_window_view: orNull(d.room_window_view) as PropertyInsert['room_window_view'],
    room_occupied_now: d.room_occupied_now,
    room_smoking_allowed: d.room_smoking_allowed,
    room_couples_allowed: d.room_couples_allowed,
    tenant_number: toNum(d.tenant_number),

    // Notas de valoración
    valuation_factors: nv.factores,

    // Descripción
    description: orNull(ds.descripcion_es),
    cedula_habitabilidad: orNull(ds.cedula_habitabilidad),
    listing_website: orNull(ds.website),

    // Material
    virtual_tour_url: orNull(m.tour_url),

    // Documentación
    drive_folder_url: orNull(doc.drive_folder_url),

    // Datos internos y publicación
    captured_by: pb.captured_by,
    commercialized_by: pb.commercialized_by,
    reference: orNull(pb.reference),
    internal_notes: orNull(pb.internal_notes),
    notes_visibility: pb.notes_visibility,
  }
}

const toStr = (n: number | null | undefined): string => (n == null ? '' : String(n))
const strOr = (s: string | null | undefined): string => s ?? ''

// Fila de properties con las relaciones que necesita el modo edición
export type PropertyEditData = Property & {
  addresses: Pick<
    Tables<'addresses'>,
    'street' | 'street_number' | 'floor' | 'door' | 'neighborhood' | 'city' | 'province' | 'postal_code' | 'country' | 'latitude' | 'longitude' | 'zone_id'
  > | null
  property_portals: {
    portal_name: string
    external_property_id?: string | null
    deleted_at?: string | null
  }[]
}

// Espejo de buildPropertyPayload/buildAddressPayload: hidrata el form desde la DB.
// Los boxes de IA arrancan ocultos — en edición la data ya está cargada.
export function propertyToFormState(p: PropertyEditData): FormState {
  const a = p.addresses
  // No confiar en que el caller ya filtró deleted_at: el mapper es puro y testeable,
  // no puede depender de la forma de la query que lo alimenta.
  const portals = new Set(
    p.property_portals.filter(x => !x.deleted_at).map(x => x.portal_name),
  )

  return {
    infoBasica: {
      title: strOr(p.title),
      property_type: p.property_type ?? '',
      street: strOr(a?.street),
      street_number: strOr(a?.street_number),
      addr_floor: strOr(a?.floor),
      door: strOr(a?.door),
      neighborhood: strOr(a?.neighborhood),
      city: strOr(a?.city),
      province: strOr(a?.province),
      postal_code: strOr(a?.postal_code),
      country: strOr(a?.country),
      latitude: a?.latitude ?? undefined,
      longitude: a?.longitude ?? undefined,
      zone_id: a?.zone_id ?? null,
      google_components: null,
      address_visibility: (p.address_visibility ?? INFO_BASICA_EMPTY.address_visibility) as InfoBasicaState['address_visibility'],
      for_sale: p.for_sale ?? false,
      sale_situation: (p.sale_situation ?? INFO_BASICA_EMPTY.sale_situation) as InfoBasicaState['sale_situation'],
      sale_price: toStr(p.sale_price),
      for_rent: p.for_rent ?? false,
      rental_type: (p.rental_type ?? INFO_BASICA_EMPTY.rental_type) as InfoBasicaState['rental_type'],
      rent_price: toStr(p.rent_price),
    },
    material: {
      // Solo archivos NUEVOS: la media ya subida a Storage no se lista ni se edita acá
      photos: [], planos: [], videos: [],
      tour_url: strOr(p.virtual_tour_url),
      iaFotosVisible: false,
    },
    detalle: {
      is_penthouse: p.is_penthouse ?? false,
      is_studio: p.is_studio ?? false,
      is_duplex: p.is_duplex ?? false,
      is_bank_owned: p.is_bank_owned ?? false,
      sqm_built: toStr(p.sqm_built),
      sqm_usable: toStr(p.sqm_usable),
      // Hay que hidratarlo: el payload lo escribe siempre, y sin esto editar un terreno
      // importado de Idealista le borraría la parcela.
      sqm_plot: toStr(p.sqm_plot),
      bedrooms: toStr(p.bedrooms),
      bathrooms: toStr(p.bathrooms),
      property_floor: toStr(p.floor),
      total_floors: toStr(p.total_floors),
      year_built: toStr(p.year_built),
      energy_certificate_status: p.energy_certificate_status ?? '',
      energy_class: p.energy_class ?? '',
      energy_consumption: toStr(p.energy_consumption),
      emissions_class: p.emissions_class ?? '',
      emissions_value: toStr(p.emissions_value),
      conservation_status: p.conservation_status ?? '',
      // Tri-estado en la UI: null significa "sin responder", no false
      is_interior: p.is_interior,
      has_elevator: p.has_elevator,
      orientation_north: p.orientation_north ?? false,
      orientation_south: p.orientation_south ?? false,
      orientation_east: p.orientation_east ?? false,
      orientation_west: p.orientation_west ?? false,
      ibi: toStr(p.ibi),
      community_fees: toStr(p.community_fees),
      has_active_derrama: p.has_active_derrama ?? false,
      ite_status: p.ite_status ?? '',
      ite_year: toStr(p.ite_year),
      has_terrace: p.has_terrace ?? false,
      has_pool: p.has_pool ?? false,
      // Tri-estado en la UI: null significa "sin responder", no false
      has_parking: p.has_parking,
      has_storage_room: p.has_storage_room ?? false,
      has_air_conditioning: p.has_air_conditioning ?? false,
      has_doorman: p.has_doorman ?? false,
      has_furnished: p.has_furnished ?? false,
      has_equipped_kitchen: p.has_equipped_kitchen ?? false,
      has_built_in_wardrobes: p.has_built_in_wardrobes ?? false,
      has_balcony: p.has_balcony,
      has_garden: p.has_garden ?? false,
      has_adapted_exterior_access: p.has_adapted_exterior_access ?? false,
      has_wheelchair_adapted_interior: p.has_wheelchair_adapted_interior ?? false,
      heating_type: p.heating_type ?? '',
      heating_fuel: p.heating_fuel ?? '',
      // Campos de tipologia. Sin esto, editar una propiedad y guardarla BORRA los 26:
      // el form arrancaria con TIPOLOGIA_FIELDS_EMPTY y buildPropertyPayload escribiria
      // null encima. Los tribool van CRUDOS (?? null), nunca `?? false`.
      house_subtype: p.house_subtype ?? '',
      rustic_house_subtype: p.rustic_house_subtype ?? '',
      garage_capacity: p.garage_capacity ?? '',
      commercial_subtype: p.commercial_subtype ?? '',
      commercial_location: p.commercial_location ?? '',
      commercial_is_transfer: p.commercial_is_transfer ?? null,
      commercial_main_activity: strOr(p.commercial_main_activity),
      office_subtype: p.office_subtype ?? '',
      office_rooms_splitted: p.office_rooms_splitted ?? '',
      office_lift_number: toStr(p.office_lift_number),
      office_is_office_building: p.office_is_office_building ?? null,
      conditioned_air_type: p.conditioned_air_type ?? '',
      parking_spaces_number: toStr(p.parking_spaces_number),
      land_subtype: p.land_subtype ?? '',
      land_road_access: p.land_road_access ?? null,
      land_access_type: p.land_access_type ?? '',
      land_classification: p.land_classification ?? '',
      building_has_tenants: p.building_has_tenants ?? null,
      room_subtype: p.room_subtype ?? '',
      room_bed_type: p.room_bed_type ?? '',
      room_available_from: strOr(p.room_available_from),
      room_minimal_stay: toStr(p.room_minimal_stay),
      room_window_view: p.room_window_view ?? '',
      room_occupied_now: p.room_occupied_now ?? null,
      room_smoking_allowed: p.room_smoking_allowed ?? null,
      room_couples_allowed: p.room_couples_allowed ?? null,
      tenant_number: toStr(p.tenant_number),
    },
    notasValoracion: {
      factores: p.valuation_factors ?? [],
      comentarios: '',
      iaValVisible: false,
    },
    descripcion: {
      cedula_habitabilidad: strOr(p.cedula_habitabilidad),
      descripcion_es: strOr(p.description),
      website: strOr(p.listing_website),
      iaDescVisible: false,
      iaDescGenerated: '',
    },
    documentacion: {
      groups: [],
      iaDocsVisible: false,
      drive_folder_url: strOr(p.drive_folder_url),
    },
    publicacion: {
      destination: portals.size > 0 ? 'portals' : 'crm',
      captured_by: p.captured_by,
      commercialized_by: p.commercialized_by,
      reference: strOr(p.reference),
      // El vínculo activo es la verdad; la columna legacy solo cubre las properties que
      // todavía no reconcilió portal-refresh.
      idealista_property_id:
        p.property_portals.find(
          pp => pp.portal_name === 'idealista' && pp.external_property_id && !pp.deleted_at,
        )?.external_property_id ?? strOr(p.idealista_property_id),
      internal_notes: strOr(p.internal_notes),
      notes_visibility: (p.notes_visibility ?? PUBLICACION_EMPTY.notes_visibility) as PublicacionState['notes_visibility'],
      portal_idealista: portals.has('idealista'),
      portal_fotocasa: portals.has('fotocasa'),
      portal_web_propia: portals.has('web_propia'),
    },
  }
}

export function buildPortalNames(pb: PublicacionState): string[] {
  const names: string[] = []
  if (pb.portal_idealista) names.push('idealista')
  if (pb.portal_fotocasa) names.push('fotocasa')
  if (pb.portal_web_propia) names.push('web_propia')
  return names
}

// Mapea missingKeys (perfil "idealista" de propertyFieldRequirements) al PropertyUpdate
// acotado que arma IdealistaGapDialog — solo escribe lo que el usuario completó,
// nunca pisa un campo que no formaba parte del gap. Lógica pura, sin React, porque
// un bug acá pisa datos reales de la propiedad.
export function buildIdealistaGapPayload(
  missingKeys: Set<string>,
  ib: Pick<InfoBasicaState, 'property_type' | 'for_sale' | 'for_rent' | 'sale_price' | 'rent_price' | 'address_visibility'>,
  sqmBuilt: string,
): PropertyUpdate {
  const payload: PropertyUpdate = {}
  if (missingKeys.has('property_type')) {
    payload.property_type = (ib.property_type || null) as PropertyUpdate['property_type']
  }
  if (missingKeys.has('area_constructed')) {
    payload.sqm_built = toNum(sqmBuilt)
  }
  if (missingKeys.has('operation_price')) {
    Object.assign(payload, buildOperationFields(ib))
  }
  // Requisito NUEVO del perfil idealista: `address.visibility` es obligatorio en
  // runtime -- sin el, el create tira 400 en las dos ramas del oneOf a la vez -- y
  // hasta ahora no se validaba ni se podia llenar desde este dialogo.
  if (missingKeys.has('address_visibility')) {
    payload.address_visibility = ib.address_visibility
  }
  return payload
}

// Payload de QuickEditPropertyDialog: siempre escribe exactamente los campos
// que ese dialog muestra (tipo, dirección vía buildAddressPayload aparte,
// operación/precio, habitaciones, baños, ascensor, m² construidos, balcón)
// — nunca los campos de las demás secciones (material, resto de detalle,
// notas, descripción, documentación, publicación), para no pisarlos con los
// defaults de FORM_STATE_EMPTY como haría buildPropertyPayload. El vínculo con
// el anuncio del portal NO viaja acá: lo escribe linkPropertyToPortalAd /
// unlinkPropertyFromPortalAd, el único escritor de idealista_property_id.
export function buildQuickEditPayload(
  ib: Pick<InfoBasicaState, 'property_type' | 'for_sale' | 'for_rent' | 'sale_price' | 'rent_price'>,
  detalle: { bedrooms: string; bathrooms: string; has_elevator: boolean | null; sqm_built: string; has_balcony: boolean | null },
): PropertyUpdate {
  return {
    property_type: (ib.property_type || null) as PropertyUpdate['property_type'],
    ...buildOperationFields(ib),
    bedrooms: toNum(detalle.bedrooms),
    bathrooms: toNum(detalle.bathrooms),
    has_elevator: detalle.has_elevator,
    sqm_built: toNum(detalle.sqm_built),
    has_balcony: detalle.has_balcony,
  }
}

/**
 * Convierte el payload de la carga rápida en el de un inmueble de CAPTACIÓN: entra al
 * funnel central en UNIVERSAL, a la estrategia MARKETING, sin captar todavía y sin
 * activarse como stock. `state: 'inactive'` es el mismo valor fijo que usa
 * `create_valuation_seller_property` en submit-valuation-v2 (ver
 * `supabase/migrations/20260927154942_valuation_seller_property.sql`): un piso que el
 * vendedor sólo cargó no está captado y no se le puede ofrecer a nadie todavía, así que
 * no entra al matching de compradores ni a las vistas de stock.
 *
 * La llama `QuickPropertyDialog` cuando se abre desde la ficha del vendedor
 * (`LeadTabsBar` / `SellerPropertyTab` en `LeadAccordion.tsx`), nunca desde /propiedades.
 */
export function buildSellerPropertyPayload(
  payload: PropertyInsert,
  sellerLeadId: string,
  universalStageId: string,
): PropertyInsert {
  return {
    ...payload,
    seller_lead_id: sellerLeadId,
    acquisition_strategy: 'MARKETING',
    acquisition_stage_id: universalStageId,
    is_captured: false,
    state: 'inactive',
  }
}

// Fuente mínima de propertyToQuickEditState: los campos que el dialog rápido
// muestra, más la fila de dirección. PropertyWithRelations la satisface.
export type QuickEditSource = Pick<
  Property,
  'property_type' | 'for_sale' | 'for_rent' | 'sale_price' | 'rent_price'
> & { addresses: PropertyEditData['addresses'] }

// Espejo de propertyToFormState para QuickEditPropertyDialog. Existe como
// función PURA por una razón concreta: cuando este mapeo vivía inline en el
// useState del dialog, se olvidó `street_number` — el form arrancaba con el
// número vacío, el input (que es UNO solo y pinta addressStreetLine) mostraba
// la calle pelada, y al guardar buildAddressPayload escribía null: la edición
// rápida BORRABA el número de la dirección en la DB. Un Partial/spread no
// hace ruido de tipos al omitir un campo, así que el compilador no avisa.
// Acá sí: el retorno es InfoBasicaState completo y está cubierto por tests.
export function propertyToQuickEditState(p: QuickEditSource): InfoBasicaState {
  const a = p.addresses
  return {
    ...INFO_BASICA_EMPTY,
    property_type: p.property_type ?? '',
    street: strOr(a?.street),
    street_number: strOr(a?.street_number),
    addr_floor: strOr(a?.floor),
    door: strOr(a?.door),
    neighborhood: strOr(a?.neighborhood),
    city: strOr(a?.city),
    province: strOr(a?.province),
    postal_code: strOr(a?.postal_code),
    country: strOr(a?.country),
    latitude: a?.latitude ?? undefined,
    longitude: a?.longitude ?? undefined,
    zone_id: a?.zone_id ?? null,
    for_sale: p.for_sale ?? false,
    for_rent: p.for_rent ?? false,
    sale_price: p.sale_price != null ? String(p.sale_price) : '',
    rent_price: p.rent_price != null ? String(p.rent_price) : '',
  }
}
