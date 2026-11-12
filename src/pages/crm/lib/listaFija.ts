import { LEAD_PARAM } from './leadFilterParams'

/* La lista no se mueve debajo de quien la está trabajando (23/10/2026, por pedido): un lead que
   deja de coincidir con los filtros porque se lo tocó (se descartó, cambió de etapa o de
   responsable, se le agendó una tarea) se queda en la lista hasta que se cambian los filtros o se
   recarga. Antes se iba en el acto y el renglón de abajo ocupaba su lugar sin aviso.
   Desde el 12/11/2026 (por pedido) tampoco cambia de lugar: registrar una actividad lo subía
   arriba de todo (el orden por última actividad, o el de la base) y las flechas del dialog
   saltaban al principio en vez de seguir con el de abajo. */

/** Los ids que se vieron con estos filtros, en el orden en que se vieron. */
export type FotoDeLista = { clave: string; ids: readonly string[] }

/** Qué filtros hay puestos: toda la URL menos `?lead=`, que solo abre el dialog. */
export function claveDeFiltros(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([k]) => k !== LEAD_PARAM)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&')
}

/** Un `ordenar` para `fijarLista` cuando el orden ya viene calculado: el de `referencia`, y lo que
 *  no está en ella al final, en el orden en que llegó. */
export function ordenarComo<T extends { id: string }>(referencia: readonly { id: string }[]): (leads: T[]) => T[] {
  const lugar = new Map(referencia.map((l, i) => [l.id, i]))
  const de = (l: T) => lugar.get(l.id) ?? referencia.length
  return leads => leads.map((l, i) => ({ l, i })).sort((a, b) => de(a.l) - de(b.l) || a.i - b.i).map(x => x.l)
}

/**
 * Lo que se ve: lo que coincide ahora más lo que ya se veía con la misma clave, con los datos de
 * ahora. Lo que ya se veía queda en el lugar en que se veía; lo nuevo entra donde lo pone `ordenar`,
 * debajo de su vecino de arriba. Lo que ya no está en `todos` —borrado, o la RLS dejó de
 * devolverlo— se va. Con otra clave la foto vuelve a empezar y manda `ordenar`.
 */
export function fijarLista<T extends { id: string }>(
  foto: FotoDeLista | null, clave: string, todos: readonly T[], coinciden: readonly T[],
  ordenar: (leads: T[]) => T[] = leads => leads,
): { leads: T[]; foto: FotoDeLista } {
  const seVeian = foto?.clave === clave ? foto.ids : []
  const yaVistos = new Set(seVeian)
  const ahora = new Set(coinciden.map(l => l.id))
  const ordenados = ordenar(todos.filter(l => ahora.has(l.id) || yaVistos.has(l.id)))
  const porId = new Map(ordenados.map(l => [l.id, l]))

  const ids = seVeian.filter(id => porId.has(id))
  let anterior: string | null = null
  for (const l of ordenados) {
    if (!yaVistos.has(l.id)) ids.splice(anterior === null ? 0 : ids.indexOf(anterior) + 1, 0, l.id)
    anterior = l.id
  }
  return { leads: ids.map(id => porId.get(id)!), foto: { clave, ids } }
}
