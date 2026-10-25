import type { Acceso, NivelAcceso } from '@/pages/crm/lib/permisos'
import type { Usuario } from '@/pages/crm/types'

/* El armado de la matriz de visibilidad de `/equipo` (23/10/2026). Puro, para que el orden no
   dependa de cómo llegó la consulta. */

const porNombre = (a: Usuario, b: Usuario) => a.nombre.localeCompare(b.nombre, 'es')

/**
 * Filas = quién mira, columnas = de quién. Solo activos: un inactivo no puede nada (`es_usuario`).
 * Un SUPERADMIN no es fila —ve y edita todo por su rol, una fila de selects no le cambiaría nada—
 * pero sí columna: su cartera se le puede abrir a un SDR como la de cualquiera.
 */
export function matrizVisibilidad(usuarios: readonly Usuario[]): { filas: Usuario[]; columnas: Usuario[]; superadmins: Usuario[] } {
  const activos = usuarios.filter(u => u.activo).sort(porNombre)
  return {
    filas: activos.filter(u => u.rol !== 'SUPERADMIN'),
    columnas: activos,
    superadmins: activos.filter(u => u.rol === 'SUPERADMIN'),
  }
}

export const claveDeCelda = (viewerId: string, subjectId: string) => `${viewerId}→${subjectId}`

export function nivelDeCelda(accesos: readonly Acceso[], viewerId: string, subjectId: string): NivelAcceso | null {
  const a = accesos.find(x => x.viewer_id === viewerId && x.subject_id === subjectId)?.access
  return a === 'read' || a === 'write' ? a : null
}

/** La lista de accesos con esa celda cambiada (null = sin fila). Es el cambio optimista del cache:
 *  una fila nueva entra sin `id` ni fechas, que llegan con la recarga de después. */
export function conAcceso<T extends Acceso>(accesos: readonly T[], viewerId: string, subjectId: string, access: NivelAcceso | null): T[] {
  const resto = accesos.filter(x => !(x.viewer_id === viewerId && x.subject_id === subjectId))
  if (access === null) return resto
  const previa = accesos.find(x => x.viewer_id === viewerId && x.subject_id === subjectId)
  return [...resto, { ...(previa ?? {}), viewer_id: viewerId, subject_id: subjectId, access } as T]
}
