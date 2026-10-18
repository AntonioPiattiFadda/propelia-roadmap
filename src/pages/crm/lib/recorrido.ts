/** Dónde estaba el lead abierto la última vez que se lo vio en la lista. */
export type UltimaPosicion = { id: string; indice: number }

/**
 * A dónde llevan las flechas del lead abierto. Si el lead se fue de la lista mientras estaba
 * abierto —se descartó y los descartados no se ven—, las flechas siguen desde el lugar donde
 * estaba (17/10/2026, por pedido): abajo queda el que ahora ocupa su lugar. Antes se apagaban y
 * había que cerrar el lead para seguir recorriendo. Uno que llegó por enlace y nunca estuvo en la
 * lista no tiene desde dónde seguir.
 */
export function vecinosEnRecorrido(
  ids: readonly string[], abiertoId: string | null, ultima: UltimaPosicion | null,
): { indice: number; anterior: string | null; siguiente: string | null } {
  const indice = abiertoId ? ids.indexOf(abiertoId) : -1
  if (indice !== -1) return { indice, anterior: ids[indice - 1] ?? null, siguiente: ids[indice + 1] ?? null }
  if (abiertoId && ultima?.id === abiertoId) {
    return { indice: -1, anterior: ids[ultima.indice - 1] ?? null, siguiente: ids[ultima.indice] ?? null }
  }
  return { indice: -1, anterior: null, siguiente: null }
}
