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
  if (!client) return []
  const persona = [client.first_name, client.last_name].filter(Boolean).join(' ').trim()
  const principal = persona || (client.phone?.trim() ? 'Contacto principal' : '')
  const otros = ([['alternative_phone_1', 'alternative_phone_1_note'], ['alternative_phone_2', 'alternative_phone_2_note']] as const)
    .map(([tel, nota]) => client[nota]?.trim() || client[tel]?.trim() || '')
  return [...new Set([principal, ...otros].filter(Boolean))]
}

/**
 * Cómo se llama un lead en la lista, el dialog y los carteles. La empresa manda; después la
 * persona; después cualquier dato que lo identifique. Un cliente puede no tener teléfono ni
 * email (lo cargó alguien a mano, o se borraron) y el renglón igual tiene que decir algo.
 */
export function nombreDelLead(client: ClienteNombrable | null | undefined): string {
  return client?.company_name?.trim() || contactoDelCliente(client) || client?.email || client?.phone || 'Sin nombre'
}
