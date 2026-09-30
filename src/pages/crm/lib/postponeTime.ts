/* La regla de «posponer hasta…» en UN solo lugar: la usan el popover de la celda de gestión y el
   menú del renglón. Con dos copias, el arreglo de una no llegaba a la otra. */

/** 9am local del día elegido; si es hoy y ya pasaron las 9, ahora mismo (como el producto). */
export function postponeEffectiveAt(dia: Date, now: number = Date.now()): string {
  const elegido = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 9).getTime()
  return new Date(Math.max(elegido, now)).toISOString()
}
