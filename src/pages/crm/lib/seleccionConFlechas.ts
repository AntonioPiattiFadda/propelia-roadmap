/** El lead que marca la flecha en modo selección: el siguiente (delta 1) o el anterior (-1) a
 *  `desde` en la lista tal como se ve, salteando los que no se pueden marcar (carteras de solo
 *  lectura). `null` en el borde o si `desde` no está a la vista. */
export function vecinoMarcable(
  ids: readonly string[],
  desde: string | null,
  delta: 1 | -1,
  marcable: (id: string) => boolean,
): string | null {
  const i = desde ? ids.indexOf(desde) : -1
  if (i < 0) return null
  for (let j = i + delta; j >= 0 && j < ids.length; j += delta) {
    if (marcable(ids[j])) return ids[j]
  }
  return null
}
