import { LEAD_PARAM } from './leadFilterParams'

/* La lista no se mueve debajo de quien la está trabajando (23/10/2026, por pedido): un lead que
   deja de coincidir con los filtros porque se lo tocó (se descartó, cambió de etapa o de
   responsable, se le agendó una tarea) se queda en la lista hasta que se cambian los filtros o se
   recarga. Antes se iba en el acto y el renglón de abajo ocupaba su lugar sin aviso. */

/** Los ids que se vieron con estos filtros. */
export type FotoDeLista = { clave: string; ids: ReadonlySet<string> }

/** Qué filtros hay puestos: toda la URL menos `?lead=`, que solo abre el dialog. */
export function claveDeFiltros(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== LEAD_PARAM)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&')
}

/**
 * Lo que se ve: lo que coincide ahora más lo que ya se veía con la misma clave, con los datos de
 * ahora y en el orden de `todos` (el orden de la lista se aplica después). Lo que ya no está en
 * `todos` —borrado, o la RLS dejó de devolverlo— se va. Con otra clave la foto vuelve a empezar.
 */
export function fijarLista<T extends { id: string }>(
  foto: FotoDeLista | null, clave: string, todos: readonly T[], coinciden: readonly T[],
): { leads: T[]; foto: FotoDeLista } {
  const seVeian = foto?.clave === clave ? foto.ids : new Set<string>()
  const ahora = new Set(coinciden.map(l => l.id))
  const leads = todos.filter(l => ahora.has(l.id) || seVeian.has(l.id))
  return { leads, foto: { clave, ids: new Set(leads.map(l => l.id)) } }
}
