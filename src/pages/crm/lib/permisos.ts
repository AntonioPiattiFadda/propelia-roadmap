import type { CrmDataAccess, Usuario } from '../types'

/* El espejo en pantalla de `crm_puede()` (supabase/schema.sql). NO es la seguridad —esa vive en
   la RLS—: sirve para no mostrarle a un SDR un botón que la base le va a rechazar. Misma
   relación que `accesoDe()` con `es_usuario()`. Si cambia la regla de allá, cambia acá. */

export type NivelAcceso = 'read' | 'write'
export type Acceso = Pick<CrmDataAccess, 'viewer_id' | 'subject_id' | 'access'>
export type YoPermisos = Pick<Usuario, 'id' | 'rol' | 'activo'> | null | undefined

export function esSuperadmin(yo: YoPermisos): boolean {
  return !!yo && yo.activo && yo.rol === 'SUPERADMIN'
}

/** El «importante» de un lead (23/10/2026): solo un SUPERADMIN lo ve y lo cambia, en cualquier
 *  cartera. Espejo del trigger `crm_leads_importante_solo_superadmin` (supabase/schema.sql). */
export const puedeMarcarImportante = (yo: YoPermisos): boolean => esSuperadmin(yo)

export function nivelSobre(yo: YoPermisos, owner: string, accesos: readonly Acceso[]): NivelAcceso | null {
  if (!yo || !yo.activo) return null
  if (owner === yo.id || esSuperadmin(yo)) return 'write'
  const fila = accesos.find(a => a.viewer_id === yo.id && a.subject_id === owner)
  if (fila?.access === 'write') return 'write'
  if (fila?.access === 'read') return 'read'
  return null
}

export const puedeLeer = (yo: YoPermisos, owner: string, accesos: readonly Acceso[]) =>
  nivelSobre(yo, owner, accesos) !== null

export const puedeEscribir = (yo: YoPermisos, owner: string, accesos: readonly Acceso[]) =>
  nivelSobre(yo, owner, accesos) === 'write'

const porNombre = (a: Usuario, b: Usuario) => a.nombre.localeCompare(b.nombre, 'es')

/**
 * Las carteras que puedo mirar: la propia primero y el resto por nombre. El orden es estable
 * porque estos ids terminan en la URL y en el selector. Incluye inactivos: sus leads siguen en
 * la base y alguien los tiene que poder ver para repartirlos.
 */
export function carterasVisibles(yo: YoPermisos, usuarios: Usuario[], accesos: readonly Acceso[]): Usuario[] {
  if (!yo || !yo.activo) return []
  const propia = usuarios.find(x => x.id === yo.id)
  const otras = usuarios.filter(x => x.id !== yo.id && puedeLeer(yo, x.id, accesos)).sort(porNombre)
  return propia ? [propia, ...otras] : otras
}

/** Donde puedo cargar o reasignar: con write y activas (la RPC rechaza un responsable inactivo). */
export function carterasConEscritura(yo: YoPermisos, usuarios: Usuario[], accesos: readonly Acceso[]): Usuario[] {
  return carterasVisibles(yo, usuarios, accesos).filter(x => x.activo && puedeEscribir(yo, x.id, accesos))
}

/* «Ver como» (23/10/2026): mirar el CRM desde la perspectiva de otro, sin ser otro. Solo cambia
   qué es «lo mío» en pantalla; los permisos siguen siendo los de quien mira (son los que aplica la
   RLS). Por eso pide poder leer su cartera: mirar como alguien a quien no ves sería una lista vacía. */

/** A quién puedo mirar como: activos cuya cartera veo, sin mí, por nombre. Es la lista del selector. */
export function puedeVerComo(yo: YoPermisos, usuarios: Usuario[], accesos: readonly Acceso[]): Usuario[] {
  if (!yo) return []
  return carterasVisibles(yo, usuarios, accesos).filter(x => x.id !== yo.id && x.activo).sort(porNombre)
}

/** El `?como=` de la URL, si vale. Uno mismo, un desconocido, un inactivo o alguien que no veo = null:
 *  el CRM se comporta como siempre, sin cartel ni error. */
export function comoValido(yo: YoPermisos, comoId: string | null, usuarios: Usuario[], accesos: readonly Acceso[]): Usuario | null {
  if (!yo || !comoId || comoId === yo.id) return null
  return puedeVerComo(yo, usuarios, accesos).find(x => x.id === comoId) ?? null
}

/** Quiénes ven la cartera de `owner` (el otro lado de `crm_puede`): el dueño, los SUPERADMIN y
 *  quien tiene una fila en `crm_data_access` sobre ella. Solo activos, por nombre. Es a quién se
 *  le puede pasar una tarea de un lead de esa cartera (4/11/2026). Ojo: un SDR solo lee sus propias
 *  filas de `crm_data_access`, así que a él le salen el dueño, los SUPERADMIN y él mismo. `actual`
 *  (el dueño de hoy) se queda aunque no califique, como `elegibles()`: si no, no se vería elegido. */
export function quienesVenLaCartera(owner: string, usuarios: Usuario[], accesos: readonly Acceso[], actual?: string): Usuario[] {
  const ven = (x: Usuario) => x.activo && (x.id === owner || x.rol === 'SUPERADMIN'
    || accesos.some(a => a.viewer_id === x.id && a.subject_id === owner))
  return usuarios.filter(x => ven(x) || x.id === actual).sort(porNombre)
}

export function nombreDe(usuarios: Usuario[], id: string | null): string {
  return (id && usuarios.find(x => x.id === id)?.nombre) || 'Sin responsable'
}
