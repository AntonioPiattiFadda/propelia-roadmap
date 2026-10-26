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
  & Partial<Pick<CrmClient, 'google_maps_phone'>>

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
  // El de la oficina sin nombre escrito es un teléfono, no alguien con quien se habla (16/10/2026).
  const oficina = (tel: string | null) => esTelefonoDeOficina(tel, client)
  const casilleros = [
    { nombre: persona || (client.phone?.trim() && !oficina(client.phone) ? 'Contacto principal' : ''), campoDecisor: 'contact_is_decision_maker' as const },
    ...([['alternative_phone_1', 'alternative_phone_1_note'], ['alternative_phone_2', 'alternative_phone_2_note']] as const)
      .map(([tel, nota]) => ({
        nombre: client[nota]?.trim() || (oficina(client[tel]) ? '' : client[tel]?.trim()) || '',
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

/**
 * Los contactos que quedan como decisores después de una llamada con el decisor, para fijarlos en
 * el perfil (17/10/2026, por pedido: reemplazó al cartel «Decisor contactado»). Con un solo elegido
 * es ese; con varios, los que el perfil ya da por decisores; y los escritos a mano que `patchNuevos`
 * cargó como decisor.
 */
export function decisoresDeLaLlamada(
  contactos: ContactoConDecisor[], elegidos: string[], esDecisor: boolean,
  patchNuevos: ReturnType<typeof patchDeContactosNuevos>['patch'],
): CampoDecisor[] {
  if (!esDecisor) return []
  const de = contactos.filter(c => elegidos.includes(c.nombre))
  const existentes = elegidos.length === 1 ? de : de.filter(c => c.decisor === true)
  const nuevos = (Object.keys(DECISOR_DEL_CASILLERO) as CasilleroDeNombre[])
    .map(k => DECISOR_DEL_CASILLERO[k]).filter(campo => patchNuevos[campo] === true)
  return [...new Set([...existentes.map(c => c.campoDecisor), ...nuevos])]
}

const CAMPOS_DECISOR: CampoDecisor[] = [
  'contact_is_decision_maker', 'alternative_phone_1_is_decision_maker', 'alternative_phone_2_is_decision_maker',
]

/**
 * Los contactos que pasaron a decisores entre dos fotos del cliente, para fijarlos en el perfil
 * (20/10/2026, por pedido): se marquen a mano, desde una actividad o al cargar un contacto nuevo.
 * Solo el paso a «sí»: el que ya era decisor no se vuelve a fijar, así desfijarlo a mano dura.
 */
export function decisoresQueSeMarcaron(
  antes: Partial<Record<CampoDecisor, boolean | null>> | null | undefined,
  despues: Partial<Record<CampoDecisor, boolean | null>> | null | undefined,
): CampoDecisor[] {
  if (!antes || !despues) return []
  return CAMPOS_DECISOR.filter(campo => despues[campo] === true && antes[campo] !== true)
}

type CasilleroDeNombre ='first_name' | 'alternative_phone_1_note' | 'alternative_phone_2_note'
const DECISOR_DEL_CASILLERO: Record<CasilleroDeNombre, CampoDecisor> = {
  first_name: 'contact_is_decision_maker',
  alternative_phone_1_note: 'alternative_phone_1_is_decision_maker',
  alternative_phone_2_note: 'alternative_phone_2_is_decision_maker',
}

/**
 * Las personas escritas a mano al registrar una actividad («Hablaste con») que todavía no son
 * contactos se cargan solas en el perfil (16/10/2026, por pedido): el principal si está vacío del
 * todo (sin nombre ni teléfono), si no el primer alternativo libre. Sin teléfono: el número al que
 * se llamó puede ser de otro. Lo que no entra en los tres casilleros queda en `sinLugar` (la
 * actividad lo guarda igual). `decisor` es el nuevo que quedó como decisor, si lo hay.
 */
export function patchDeContactosNuevos(
  client: ClienteConAlternativos & Pick<CrmClient, 'first_name' | 'last_name'>,
  nombres: string[], decisor: string | null,
): { patch: Partial<Record<CasilleroDeNombre, string> & Record<CampoDecisor, boolean>>; sinLugar: string[] } {
  const libres: CasilleroDeNombre[] = []
  if (!client.first_name?.trim() && !client.last_name?.trim() && !client.phone?.trim()) libres.push('first_name')
  if (!client.alternative_phone_1?.trim() && !client.alternative_phone_1_note?.trim()) libres.push('alternative_phone_1_note')
  if (!client.alternative_phone_2?.trim() && !client.alternative_phone_2_note?.trim()) libres.push('alternative_phone_2_note')
  const patch: ReturnType<typeof patchDeContactosNuevos>['patch'] = {}
  const sinLugar: string[] = []
  for (const nombre of nombres) {
    const casillero = libres.shift()
    if (!casillero) { sinLugar.push(nombre); continue }
    patch[casillero] = nombre
    if (nombre === decisor) patch[DECISOR_DEL_CASILLERO[casillero]] = true
  }
  return { patch, sinLugar }
}

/** Si el perfil ya tiene a alguien marcado como decisor. Una marca en un casillero sin nadie no cuenta. */
export function tieneDecisor(client: ClienteConDecisor | null | undefined): boolean {
  return contactosConDecisor(client).some(c => c.decisor === true)
}

/** Los nombres de los contactos marcados como decisores (la columna «Decisor» del Dashboard). */
export function nombresDeDecisores(client: ClienteConDecisor | null | undefined): string[] {
  return contactosConDecisor(client).filter(c => c.decisor === true).map(c => c.nombre)
}

/**
 * El decisor apuntado al registrar una actividad (17/10/2026, por pedido): el doorkeeper dio su
 * nombre y queda en el perfil aunque no se haya hablado con él. Se suma al `patch` de los nuevos de
 * esa misma actividad: si ya es un contacto se marca ese, si es uno de los nuevos se marca su
 * casillero, y si no se carga en el primer casillero libre que queda. Sin lugar, `sinLugar`.
 */
export function conDecisorApuntado(
  client: ClienteConDecisor, patch: ReturnType<typeof patchDeContactosNuevos>['patch'], nombre: string,
): { patch: ReturnType<typeof patchDeContactosNuevos>['patch']; sinLugar: boolean } {
  const igual = (a: string) => a.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es')
  const existente = contactosConDecisor(client).find(c => igual(c.nombre))
  if (existente) return { patch: { ...patch, [existente.campoDecisor]: true }, sinLugar: false }
  const casillero = (Object.keys(DECISOR_DEL_CASILLERO) as CasilleroDeNombre[]).find(k => patch[k] && igual(patch[k]))
  if (casillero) return { patch: { ...patch, [DECISOR_DEL_CASILLERO[casillero]]: true }, sinLugar: false }
  const nuevo = patchDeContactosNuevos({ ...client, ...patch }, [nombre], nombre)
  return { patch: { ...patch, ...nuevo.patch }, sinLugar: nuevo.sinLugar.length > 0 }
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

const TELEFONO_DEL_DECISOR: Record<CampoDecisor, CasilleroDeTelefono> = {
  contact_is_decision_maker: 'phone',
  alternative_phone_1_is_decision_maker: 'alternative_phone_1',
  alternative_phone_2_is_decision_maker: 'alternative_phone_2',
}

/**
 * Dónde se carga el número escrito a mano en «Teléfono contacto» (17/10/2026, por pedido): en el contacto
 * con quien se habló (`persona`, por su columna de decisor) si todavía no tiene número; si no, el
 * principal vacío del todo o el primer alternativo libre. `null` si no queda lugar: nunca se pisa.
 */
export function casilleroDelTelefonoNuevo(
  client: ClienteConAlternativos & Pick<CrmClient, 'first_name' | 'last_name'>, persona: CampoDecisor | null,
): CasilleroDeTelefono | null {
  const suyo = persona && TELEFONO_DEL_DECISOR[persona]
  if (suyo && !client[suyo]?.trim()) return suyo
  if (!client.first_name?.trim() && !client.last_name?.trim() && !client.phone?.trim()) return 'phone'
  return alternativoLibre(client)
}

/** La columna de decisor del casillero donde `patchDeContactosNuevos` cargó a `nombre`, si lo cargó. */
export function decisorDelContactoNuevo(patch: ReturnType<typeof patchDeContactosNuevos>['patch'], nombre: string): CampoDecisor | null {
  const casillero = (Object.keys(DECISOR_DEL_CASILLERO) as CasilleroDeNombre[]).find(k => patch[k] === nombre)
  return casillero ? DECISOR_DEL_CASILLERO[casillero] : null
}

/** Si el número es el de Google Maps del cliente (por dígitos): es el teléfono de la oficina, que
 *  se muestra así y no como una persona con rol (16/10/2026, por pedido). */
export function esTelefonoDeOficina(telefono: string | null | undefined, client: Partial<Pick<CrmClient, 'google_maps_phone'>> | null | undefined): boolean {
  const google = soloDigitos(client?.google_maps_phone)
  return !!google && soloDigitos(telefono) === google
}

export const ETIQUETA_OFICINA = 'Oficina'
export type TelefonoDelCliente = { numero: string; etiqueta: string }

/**
 * A qué teléfonos se puede llamar, para preguntar en la llamada a cuál se llamó: el número que se
 * marca y la persona que atiende no siempre coinciden (16/10/2026, por pedido). Cada contacto con
 * su número, la oficina como «Oficina» y el de Google Maps al final si no está en ningún contacto.
 * Sin repetir por dígitos.
 */
export function telefonosDelCliente(client: ClienteConContactos | null | undefined): TelefonoDelCliente[] {
  if (!client) return []
  const persona = [client.first_name, client.last_name].filter(Boolean).join(' ').trim()
  const casilleros = [
    { numero: client.phone, nombre: persona || 'Contacto principal' },
    { numero: client.alternative_phone_1, nombre: client.alternative_phone_1_note?.trim() },
    { numero: client.alternative_phone_2, nombre: client.alternative_phone_2_note?.trim() },
    { numero: client.google_maps_phone, nombre: ETIQUETA_OFICINA },
  ]
  const vistos = new Set<string>()
  return casilleros.flatMap(({ numero, nombre }) => {
    const n = numero?.trim()
    if (!n || vistos.has(soloDigitos(n))) return []
    vistos.add(soloDigitos(n))
    return [{ numero: n, etiqueta: esTelefonoDeOficina(n, client) ? ETIQUETA_OFICINA : nombre || n }]
  })
}

/** Si el número es el de Idealista del cliente (por dígitos): el contacto lleva el aviso escrito. */
export function esTelefonoDeIdealista(telefono: string | null | undefined, client: Pick<CrmClient, 'idealista_phone'> | null | undefined): boolean {
  const idealista = soloDigitos(client?.idealista_phone)
  return !!idealista && soloDigitos(telefono) === idealista
}

type ClienteConCopias = Pick<CrmClient, 'idealista_phone' | 'alternative_phone_1' | 'alternative_phone_2'>
  & Partial<Pick<CrmClient, `alternative_phone_${1 | 2}_${'role' | 'notes' | 'is_decision_maker'}`>>

/**
 * Los alternativos (0 o 1) que son una copia del teléfono de Idealista, de cuando el perfil lo
 * cargaba como contacto: se quitan, que ese número vive en «Datos de la inmobiliaria». Uno con
 * rol, notas o decisor ya lo trabajó alguien y se deja (lleva el aviso escrito).
 */
export function copiasDelTelefonoDeIdealista(client: ClienteConCopias | null | undefined): (0 | 1)[] {
  if (!client) return []
  return ([1, 2] as const).flatMap(n => {
    const trabajado = client[`alternative_phone_${n}_role`]?.trim() || client[`alternative_phone_${n}_notes`]?.trim()
      || client[`alternative_phone_${n}_is_decision_maker`] != null
    return esTelefonoDeIdealista(client[`alternative_phone_${n}`], client) && !trabajado ? [(n - 1) as 0 | 1] : []
  })
}

/**
 * Cómo se llama un lead en la lista, el dialog y los carteles. La empresa manda; después la
 * persona; después cualquier dato que lo identifique. Un cliente puede no tener teléfono ni
 * email (lo cargó alguien a mano, o se borraron) y el renglón igual tiene que decir algo.
 */
export function nombreDelLead(client: ClienteNombrable | null | undefined): string {
  return client?.company_name?.trim() || contactoDelCliente(client) || client?.email || client?.phone || 'Sin nombre'
}
