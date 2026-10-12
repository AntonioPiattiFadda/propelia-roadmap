import { parsePhone } from '@/lib/phone'
import type { CrmClient } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/lib/clientData.ts) + `company_name`: acá los
   clientes son inmobiliarias, y la persona sin su empresa no dice nada. */
export interface ClientData {
  company_name: string
  first_name: string
  last_name: string
  phone: string
  email: string
}

export type ClientDataErrors = Partial<Record<keyof ClientData, string>>

export const EMPTY_CLIENT: ClientData = { company_name: '', first_name: '', last_name: '', phone: '', email: '' }
export const MISSING_CONTACT_ERROR = 'Completá teléfono o email'

// Sin teléfono ni email la base no tiene con qué deduplicar (crm_create_lead_with_client lo rechaza).
export function validateClientData(data: ClientData): ClientDataErrors {
  const errors: ClientDataErrors = {}
  if (!data.phone.trim() && !data.email.trim()) {
    errors.phone = MISSING_CONTACT_ERROR
    errors.email = MISSING_CONTACT_ERROR
  } else if (data.phone.trim() && !parsePhone(data.phone).isValid) {
    errors.phone = 'Teléfono inválido'
  }
  return errors
}

type ClienteNombrable = Pick<CrmClient, 'company_name' | 'first_name' | 'last_name' | 'email' | 'phone'>

export function contactoDelCliente(client: ClienteNombrable | null | undefined): string {
  return [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim()
}

/** Las iniciales del círculo del perfil: una por cada una de las dos primeras palabras, o las dos
 *  primeras letras si es una sola («Remax» → «RE»: una letra sola en un círculo dice poco). */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ''
  const letras = palabras.length === 1 ? [...palabras[0]].slice(0, 2) : palabras.slice(0, 2).map(p => [...p][0])
  return letras.join('').toLocaleUpperCase('es')
}

type ClienteConContactos = Pick<CrmClient, 'first_name' | 'last_name' | 'phone'
  | 'alternative_phone_1' | 'alternative_phone_1_note' | 'alternative_phone_2' | 'alternative_phone_2_note'>

/**
 * Con quién se puede hablar en la inmobiliaria: la persona principal y las de los dos teléfonos
 * alternativos, cuya nota dice quién es. No hay tabla de contactos; son esos tres casilleros, y
 * uno vacío no es nadie. Sin nombre, el principal con teléfono se llama «Contacto principal» y el
 * alternativo por su número: es lo único que lo distingue.
 */
export function contactosDelCliente(client: ClienteConContactos | null | undefined): string[] {
  return contactosConDecisor(client).map(c => c.nombre)
}

/** La columna de cada contacto que dice si decide en la inmobiliaria. */
export type CampoDecisor = 'contact_is_decision_maker' | 'alternative_phone_1_is_decision_maker' | 'alternative_phone_2_is_decision_maker'

/** Un contacto con lo que se sabe de él: `decisor` null es «no se sabe» (se pregunta en la llamada). */
export type ContactoConDecisor = { nombre: string; campoDecisor: CampoDecisor; decisor: boolean | null }

/* Las columnas del decisor pueden no estar todavía en la base (migración pendiente): opcionales,
   y su falta es «no se sabe». */
type ClienteConDecisor = ClienteConContactos & Partial<Pick<CrmClient, CampoDecisor>>

/** `contactosDelCliente` con la columna de decisor de cada uno. Un nombre repetido es el primero. */
export function contactosConDecisor(client: ClienteConDecisor | null | undefined): ContactoConDecisor[] {
  if (!client) return []
  const persona = [client.first_name, client.last_name].filter(Boolean).join(' ').trim()
  const casilleros = [
    { nombre: persona || (client.phone?.trim() ? 'Contacto principal' : ''), campoDecisor: 'contact_is_decision_maker' as const },
    ...([['alternative_phone_1', 'alternative_phone_1_note'], ['alternative_phone_2', 'alternative_phone_2_note']] as const)
      .map(([tel, nota]) => ({
        nombre: client[nota]?.trim() || client[tel]?.trim() || '',
        campoDecisor: `${tel}_is_decision_maker` as const,
      })),
  ]
  const vistos = new Set<string>()
  return casilleros.filter(c => c.nombre && !vistos.has(c.nombre) && vistos.add(c.nombre))
    .map(c => ({ ...c, decisor: client[c.campoDecisor] ?? null }))
}

/**
 * Si la llamada con `elegidos` fue con un decisor, por lo guardado en cada contacto: sí si alguno
 * figura como decisor, no si todos figuran como no decisores. `null` es que falta saber: se pregunta.
 */
export function decisorSabido(contactos: ContactoConDecisor[], elegidos: string[]): boolean | null {
  const de = contactos.filter(c => elegidos.includes(c.nombre))
  if (de.length === 0) return null
  if (de.some(c => c.decisor === true)) return true
  return de.every(c => c.decisor === false) ? false : null
}

/**
 * La columna a marcar como decisor después de contestar «sí» en una llamada, para no volver a
 * preguntarlo. Solo con un contacto elegido: con varios no se sabe cuál de ellos decide.
 */
export function campoDelNuevoDecisor(contactos: ContactoConDecisor[], elegidos: string[], esDecisor: boolean): CampoDecisor | null {
  if (!esDecisor || elegidos.length !== 1) return null
  return contactos.find(c => c.nombre === elegidos[0])?.campoDecisor ?? null
}

type ClienteConGoogle = Pick<CrmClient, 'phone' | 'google_maps_phone'
  | 'alternative_phone_1' | 'alternative_phone_1_note' | 'alternative_phone_2' | 'alternative_phone_2_note'>
export type CasilleroDeTelefono = 'phone' | 'alternative_phone_1' | 'alternative_phone_2'

const soloDigitos = (tel: string | null | undefined) => (tel ?? '').replace(/\D/g, '')

/**
 * Dónde se carga el teléfono de Google Maps como contacto: el principal si no tiene número, si no
 * el primer alternativo libre (sin número ni nombre: uno con nombre ya es alguien). `null` si no
 * hay teléfono de Google, si ya es el de un contacto (se comparan los dígitos, que el formato
 * cambia según quién lo cargó) o si no queda casillero: nunca se pisa a nadie.
 */
export function casilleroParaTelefonoDeGoogle(client: ClienteConGoogle | null | undefined): CasilleroDeTelefono | null {
  const google = soloDigitos(client?.google_maps_phone)
  if (!client || !google) return null
  if ([client.phone, client.alternative_phone_1, client.alternative_phone_2].some(t => soloDigitos(t) === google)) return null
  if (!client.phone?.trim()) return 'phone'
  return alternativoLibre(client)
}

type ClienteConAlternativos = Pick<CrmClient, 'phone'
  | 'alternative_phone_1' | 'alternative_phone_1_note' | 'alternative_phone_2' | 'alternative_phone_2_note'>

// El primer alternativo sin número ni nombre: uno con nombre ya es alguien.
function alternativoLibre(client: ClienteConAlternativos): CasilleroDeTelefono | null {
  if (!client.alternative_phone_1?.trim() && !client.alternative_phone_1_note?.trim()) return 'alternative_phone_1'
  if (!client.alternative_phone_2?.trim() && !client.alternative_phone_2_note?.trim()) return 'alternative_phone_2'
  return null
}

/** Si el número es el de Idealista del cliente (por dígitos): el contacto lleva el aviso escrito. */
export function esTelefonoDeIdealista(telefono: string | null | undefined, client: Pick<CrmClient, 'idealista_phone'> | null | undefined): boolean {
  const idealista = soloDigitos(client?.idealista_phone)
  return !!idealista && soloDigitos(telefono) === idealista
}

/**
 * Cómo se llama un lead en la lista, el dialog y los carteles. La empresa manda; después la
 * persona; después cualquier dato que lo identifique. Un cliente puede no tener teléfono ni
 * email (lo cargó alguien a mano, o se borraron) y el renglón igual tiene que decir algo.
 */
export function nombreDelLead(client: ClienteNombrable | null | undefined): string {
  return client?.company_name?.trim() || contactoDelCliente(client) || client?.email || client?.phone || 'Sin nombre'
}
