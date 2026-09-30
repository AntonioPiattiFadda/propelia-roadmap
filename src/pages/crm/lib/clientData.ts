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

/**
 * Cómo se llama un lead en la lista, el dialog y los carteles. La empresa manda; después la
 * persona; después cualquier dato que lo identifique. Un cliente puede no tener teléfono ni
 * email (lo cargó alguien a mano, o se borraron) y el renglón igual tiene que decir algo.
 */
export function nombreDelLead(client: ClienteNombrable | null | undefined): string {
  return client?.company_name?.trim() || contactoDelCliente(client) || client?.email || client?.phone || 'Sin nombre'
}
