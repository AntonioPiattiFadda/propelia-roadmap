/* «Dar de alta» (24/11/2026, por pedido): el equipo lo cargamos nosotros en la ventana, sin la
   página pública. Las reglas son las de `onboarding_alta_enviar` (la base las aplicaba a lo que
   mandaba el cliente) y las de `client_onboarding_importar_equipo`: al menos una persona, emails
   válidos y sin repetir, un solo responsable y que sea Administrador. */
import { conPrefijoDePais, PREFIJOS_DE_PAIS, tienePrefijoDePais } from '@/pages/crm/lib/clientData'
import { contrasenaInicial } from './equipo'

export type Rol = 'admin' | 'agent'

/** Una fila de la tabla del equipo, como se escribe en la ventana. */
export type PersonaDelAlta = {
  /** Solo para React: no viaja a ningún lado. */
  clave: string
  nombre: string
  apellido: string
  email: string
  /** El prefijo elegido al lado del teléfono; lo escrito con «+» lo pisa. */
  prefijo: string
  telefono: string
  rol: Rol
  responsable: boolean
}

export const PREFIJO_DE_ENTRADA = PREFIJOS_DE_PAIS[0].prefijo

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

let contador = 0
const nuevaClave = () => `p${++contador}`

export const personaVacia = (p: Partial<PersonaDelAlta> = {}): PersonaDelAlta => ({
  clave: nuevaClave(), nombre: '', apellido: '', email: '', prefijo: PREFIJO_DE_ENTRADA, telefono: '', rol: 'agent', responsable: false, ...p,
})

/** Separa un «+34 637…» guardado en el prefijo conocido más largo y el resto. Sin prefijo
 *  conocido, todo queda como escrito (con su «+», que manda sobre el selector). */
export function separarTelefono(tel: string | null | undefined): { prefijo: string; telefono: string } {
  const t = (tel ?? '').trim()
  if (!t.startsWith('+')) return { prefijo: PREFIJO_DE_ENTRADA, telefono: t }
  const conocido = [...PREFIJOS_DE_PAIS].sort((a, b) => b.prefijo.length - a.prefijo.length)
    .find(p => t.replace(/\s+/g, '').startsWith(p.prefijo))
  return conocido
    ? { prefijo: conocido.prefijo, telefono: t.replace(/\s+/g, '').slice(conocido.prefijo.length) }
    : { prefijo: PREFIJO_DE_ENTRADA, telefono: t }
}

/** El teléfono en E.164 sin espacios (`+34637458114`), o '' si no se escribió. */
export function telefonoE164(p: Pick<PersonaDelAlta, 'prefijo' | 'telefono'>): string {
  return conPrefijoDePais(p.prefijo, p.telefono).replace(/[\s().-]/g, '')
}

/** Los errores de cada fila, por `clave`. Vacío = se puede dar de alta. */
export function erroresDelEquipo(equipo: readonly PersonaDelAlta[]): Map<string, string[]> {
  const errores = new Map<string, string[]>()
  const agregar = (clave: string, e: string) => errores.set(clave, [...(errores.get(clave) ?? []), e])
  const vistos = new Set<string>()
  for (const p of equipo) {
    if (!p.nombre.trim()) agregar(p.clave, 'Falta el nombre')
    if (!p.apellido.trim()) agregar(p.clave, 'Falta el apellido')
    const email = p.email.trim().toLowerCase()
    if (!EMAIL.test(email)) agregar(p.clave, 'Email mal escrito')
    else if (vistos.has(email)) agregar(p.clave, 'Email repetido')
    vistos.add(email)
    const tel = telefonoE164(p)
    if (tel && !tienePrefijoDePais(tel)) agregar(p.clave, 'Teléfono incompleto')
    if (p.responsable && p.rol !== 'admin') agregar(p.clave, 'El responsable tiene que ser Administrador')
  }
  return errores
}

/** Lo que frena el alta aunque cada fila esté bien. */
export function erroresGenerales(equipo: readonly PersonaDelAlta[]): string[] {
  if (!equipo.length) return ['Falta cargar al menos una persona']
  const responsables = equipo.filter(p => p.responsable).length
  if (responsables === 0) return ['Elegí quién es el responsable']
  if (responsables > 1) return ['Solo puede haber un responsable']
  return []
}

export const equipoValido = (equipo: readonly PersonaDelAlta[]) =>
  erroresGenerales(equipo).length === 0 && erroresDelEquipo(equipo).size === 0

type MiembroGuardado = { first_name: string; last_name: string; email: string | null; phone: string | null; role: string; is_owner: boolean; created_at: string }
type ContactoDelCrm = { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null

/** Con qué arranca la tabla: el equipo que ya estaba guardado (lo que mandó un cliente por la
 *  página de alta, antes de este botón), responsable primero; si no hay nadie, el contacto del CRM
 *  como responsable y Administrador. */
export function equipoInicial(miembros: readonly MiembroGuardado[], contacto: ContactoDelCrm): PersonaDelAlta[] {
  if (miembros.length) {
    return [...miembros]
      .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.created_at.localeCompare(b.created_at))
      .map(m => personaVacia({
        nombre: m.first_name, apellido: m.last_name, email: m.email ?? '', ...separarTelefono(m.phone),
        rol: m.role === 'admin' ? 'admin' : 'agent', responsable: m.is_owner,
      }))
  }
  return [personaVacia({
    nombre: contacto?.first_name?.trim() ?? '', apellido: contacto?.last_name?.trim() ?? '', email: contacto?.email?.trim() ?? '',
    ...separarTelefono(contacto?.phone), rol: 'admin', responsable: true,
  })]
}

/** La cuenta que crea el puente. La contraseña es la de siempre (`nombre.apellido`), con el año de
 *  hoy: es el `created_at` que va a tener el miembro, y de ahí la rearman los mails de accesos. */
export function cuentaDe(p: PersonaDelAlta, anio = new Date().getFullYear()) {
  return {
    first_name: p.nombre.trim(), last_name: p.apellido.trim(), email: p.email.trim().toLowerCase(),
    phone: telefonoE164(p), role: p.rol, is_owner: p.responsable,
    password: contrasenaInicial(p.nombre.trim(), p.apellido.trim(), anio),
  }
}
