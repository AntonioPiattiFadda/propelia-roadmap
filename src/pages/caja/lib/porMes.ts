import type { FilaCaja, Pagador } from '../types'

/* La vista «Por mes» de la Caja: la misma lista de filas, cortada por mes y con los fijos
   mensuales arriba de los variables. */

export interface MesDeLaCaja {
  /** 'YYYY-MM': el mes al que se imputa la fila, no el de la fecha de pago. */
  period: string
  fijos: FilaCaja[]
  variables: FilaCaja[]
  total: number
  totalFijos: number
  totalVariables: number
}

export interface TotalDePagador {
  /** Nulo: pagó alguien que ya no está entre los pagadores. */
  pagador: Pagador | null
  total: number
  fijos: number
  variables: number
  n: number
}

// Sumar euros en coma flotante da 0.30000000000000004: se redondea a centavos al devolver.
const centavos = (n: number) => Math.round(n * 100) / 100
const suma = (filas: FilaCaja[]) => centavos(filas.reduce((s, f) => s + f.amount, 0))
const porFecha = (a: FilaCaja, b: FilaCaja) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre)

// Un fijo pendiente no tiene gasto: la recurrencia sale de su etiqueta.
const esFijoMensual = (f: FilaCaja) =>
  f.kind === 'FIXED' && (f.gasto?.recurrence ?? f.etiqueta?.recurrence) !== 'ONE_TIME'

const nombreDe = (id: string | null, pagadores: Pagador[]) => pagadores.find(p => p.id === id)?.nombre ?? null

// Fijos y variables dicen quién los pagó; el fijo lo lleva delante de su «Mensual · vence el N».
function conPagador(f: FilaCaja, pagadores: Pagador[]): FilaCaja {
  const quien = f.status === 'PAID' ? `Pagó ${nombreDe(f.gasto?.paid_by ?? null, pagadores) ?? '—'}` : 'Sin pagar'
  return { ...f, sub: [quien, f.sub].filter(Boolean).join(' · ') }
}

function bloque(fs: FilaCaja[], pagadores: Pagador[]): Omit<MesDeLaCaja, 'period'> {
  const fijos = fs.filter(esFijoMensual).sort(porFecha).map(f => conPagador(f, pagadores))
  const variables = fs.filter(f => !esFijoMensual(f)).sort(porFecha).map(f => conPagador(f, pagadores))
  return { fijos, variables, total: suma(fs), totalFijos: suma(fijos), totalVariables: suma(variables) }
}

/** Meses del más viejo al más nuevo; adentro, fechas de la más vieja a la más nueva. */
export function mesesDeLaCaja(filas: FilaCaja[], pagadores: Pagador[]): MesDeLaCaja[] {
  const porMes = new Map<string, FilaCaja[]>()
  for (const f of filas) porMes.set(f.period, [...(porMes.get(f.period) ?? []), f])
  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, fs]) => ({ period, ...bloque(fs, pagadores) }))
}

/**
 * Lo pagado por cada uno (solo PAID), en el orden de `pagadores`. Los activos van siempre, aunque
 * no hayan pagado nada; un inactivo, solo si pagó algo. Al final, lo de quien ya no figura.
 */
export function totalesPorPagador(filas: FilaCaja[], pagadores: Pagador[]): TotalDePagador[] {
  const porId = new Map<string, FilaCaja[]>()
  for (const f of filas) {
    if (f.status !== 'PAID' || !f.gasto?.paid_by) continue
    porId.set(f.gasto.paid_by, [...(porId.get(f.gasto.paid_by) ?? []), f])
  }
  const total = (pagador: Pagador | null, fs: FilaCaja[]): TotalDePagador => ({
    pagador, total: suma(fs), n: fs.length,
    fijos: suma(fs.filter(f => f.kind === 'FIXED')), variables: suma(fs.filter(f => f.kind !== 'FIXED')),
  })
  const conocidos = pagadores
    .filter(p => p.activo || porId.has(p.id))
    .map(p => total(p, porId.get(p.id) ?? []))
  const otros = [...porId.entries()].filter(([id]) => !pagadores.some(p => p.id === id)).flatMap(([, fs]) => fs)
  return otros.length ? [...conocidos, total(null, otros)] : conocidos
}
