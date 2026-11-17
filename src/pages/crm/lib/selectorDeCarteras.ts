/* Reglas del selector de carteras de los filtros del CRM (`AgentFilterButton`). Las opciones son las
   carteras que se ofrecen (activas, más las inactivas ya marcadas): «todos» es todas esas. */

type Opcion = { id: string; nombre: string }

/** Todas las carteras ofrecidas están marcadas. Un marcado que ya no se ofrece no cuenta. */
export function sonTodas(seleccion: string[], opciones: Opcion[]): boolean {
  return opciones.length > 0 && opciones.every(o => seleccion.includes(o.id))
}

/** El renglón «Todos»: marca todas o, si ya estaban, vuelve a la propia (nunca cero carteras). */
export function alternarTodas(seleccion: string[], opciones: Opcion[], propia: string): string[] {
  return sonTodas(seleccion, opciones) ? [propia] : opciones.map(o => o.id)
}

/** El rótulo del chip. */
export function rotuloDeCarteras(seleccion: string[], opciones: Opcion[]): string {
  if (seleccion.length === 1) return `Leads de ${opciones.find(o => o.id === seleccion[0])?.nombre ?? 'vos'}`
  if (sonTodas(seleccion, opciones)) return 'Leads de todos'
  return `Leads de ${seleccion.length} personas`
}
