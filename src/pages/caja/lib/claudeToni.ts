/* «Claude Toni · extra empresa» (25/10/2026): lo que Toni le transfiere a Lorenzo todos los meses
   por Claude. Es plata entre ellos y no de la empresa: no toca `expenses`, ni los totales, ni el
   resumen por persona. Lo único que se guarda es qué meses se pagaron (y una nota de cuándo o cómo),
   como JSON en el `texto` de una fila de `roadmap_notas` (ver `useClaudeToni`): sin migración. */

/** Siempre lo mismo: no se carga monto por mes. */
export const MONTO_CLAUDE_TONI = 55

/** El primer mes que se le debe. Cambiarlo acá alcanza: los meses pagados de antes se siguen viendo. */
export const DESDE_CLAUDE_TONI = '2026-10'

/** Cuántos meses después de este se muestran: los que vienen se tildan cuando llega la transferencia. */
export const MESES_POR_DELANTE = 12

/** Los meses pagados: clave presente es mes pagado; `nota` es cuándo o cómo («transferencia 3/10»). */
export type PagadosClaudeToni = Record<string, { nota: string }>

export interface MesClaudeToni {
  period: string
  pagado: boolean
  nota: string
}

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/

/** Mismo contenido con las claves ordenadas: el JSON guardado sale siempre igual. 'YYYY-MM' ordena como texto. */
const ordenado = (pagados: PagadosClaudeToni): PagadosClaudeToni =>
  Object.fromEntries(Object.keys(pagados).sort().map(p => [p, pagados[p]]))

const notaDe = (valor: unknown): string => {
  const nota = (valor as { nota?: unknown } | null)?.nota
  return typeof nota === 'string' ? nota : ''
}

/**
 * Los meses pagados guardados en `texto`, leídos a la defensiva: vacío o JSON roto es «ninguno
 * pagado», y solo cuentan las claves 'YYYY-MM' bien escritas. Acepta también la forma vieja, una
 * lista de meses (`["2026-09"]`): cada uno pagado, sin nota. Una nota rara se lee vacía.
 */
export function leerPagados(texto: string): PagadosClaudeToni {
  let valor: unknown
  try { valor = JSON.parse(texto) } catch { return {} }
  const pagados: PagadosClaudeToni = {}
  if (Array.isArray(valor)) {
    for (const p of valor) if (typeof p === 'string' && PERIODO.test(p)) pagados[p] = { nota: '' }
  } else if (valor && typeof valor === 'object') {
    for (const [p, v] of Object.entries(valor)) if (PERIODO.test(p)) pagados[p] = { nota: notaDe(v) }
  }
  return ordenado(pagados)
}

export const escribirPagados = (pagados: PagadosClaudeToni): string => JSON.stringify(ordenado(pagados))

/** Marcar o desmarcar. Desmarcar se lleva la nota: es de un pago que ya no está. */
export function alternarPagado(pagados: PagadosClaudeToni, period: string): PagadosClaudeToni {
  if (!(period in pagados)) return ordenado({ ...pagados, [period]: { nota: '' } })
  const { [period]: _quitado, ...resto } = pagados
  return resto
}

/** La nota de un mes pagado. A uno sin pagar no le hace nada: la nota es solo de los pagados. */
export function conNota(pagados: PagadosClaudeToni, period: string, nota: string): PagadosClaudeToni {
  if (!(period in pagados)) return pagados
  return { ...pagados, [period]: { nota: nota.trim() } }
}

const mesSiguiente = (period: string): string => {
  const [y, m] = period.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Un renglón por mes, el más viejo arriba (por pedido): de `desde` hasta `adelante` meses después
 * de este. Un pagado de antes del arranque o más adelante estira la lista hasta él: si no, quedaría
 * guardado sin renglón donde desmarcarlo.
 */
export function mesesClaudeToni(
  pagados: PagadosClaudeToni, mesActual: string, desde = DESDE_CLAUDE_TONI, adelante = MESES_POR_DELANTE,
): MesClaudeToni[] {
  let tope = mesActual
  for (let i = 0; i < adelante; i++) tope = mesSiguiente(tope)
  const extremos = [desde, tope, ...Object.keys(pagados)].sort()
  const hasta = extremos[extremos.length - 1]
  const meses: MesClaudeToni[] = []
  for (let p = extremos[0]; p <= hasta; p = mesSiguiente(p)) {
    meses.push({ period: p, pagado: p in pagados, nota: pagados[p]?.nota ?? '' })
  }
  return meses
}

/* Escritas a mano y no con Intl: `toLocaleDateString('es-ES', { month: 'short' })` da «sept» y la
   puntuación cambia según el navegador. Acá van siempre tres letras. */
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** «Oct 26»: el mes de un renglón del panel, corto porque la caja es angosta. */
export function mesCorto(period: string): string {
  const [y, m] = period.split('-')
  return `${MESES_CORTOS[Number(m) - 1]} ${y.slice(2)}`
}
