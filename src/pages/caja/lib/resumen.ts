import type { FilaCaja, ResumenCaja, SubtotalMes } from '../types'
import { periodOf } from './periodos'

// Sumar euros en coma flotante da 0.30000000000000004: se redondea a centavos al devolver.
const centavos = (n: number) => Math.round(n * 100) / 100
const suma = (filas: FilaCaja[]) => centavos(filas.reduce((s, f) => s + f.amount, 0))

/**
 * Totales de las filas que recibe, tal cual. Con «+ Pendientes» apagado la pantalla muestra «—»
 * en «Por pagar»: acá no se sabe, solo se calcula sobre lo que llegó.
 */
export function resumenDeFilas(filas: FilaCaja[]): ResumenCaja {
  const pagadas = filas.filter(f => f.status === 'PAID')
  const pendientes = filas.filter(f => f.status !== 'PAID')
  return {
    total: suma(filas),
    pagado: suma(pagadas),
    porPagar: suma(pendientes),
    nGastos: filas.length,
    nPagados: pagadas.length,
    nPendientes: pendientes.length,
    nFijosSinPagar: filas.filter(f => f.status === 'NONE').length,
    fijos: suma(filas.filter(f => f.kind === 'FIXED')),
    variables: suma(filas.filter(f => f.kind === 'VARIABLE')),
  }
}

/** Subtotal por mes de la FECHA de la fila (que es donde se dibuja), del más nuevo al más viejo. */
export function subtotalesPorMes(filas: FilaCaja[]): SubtotalMes[] {
  const porMes = new Map<string, FilaCaja[]>()
  for (const f of filas) {
    const p = periodOf(f.fecha)
    porMes.set(p, [...(porMes.get(p) ?? []), f])
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, fs]) => ({ period, total: suma(fs), n: fs.length }))
}
