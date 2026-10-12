import type { Etiqueta, FilaCaja, Gasto, Rango } from '../types'
import { dueDate, mesesDelRango, periodoDeInstante } from './periodos'

// Con `due_day` la fila dice cuándo vence; sin él, solo que es mensual.
const subDeFijo = (e: Etiqueta | null) => (e?.due_day ? `Mensual · vence el ${e.due_day}` : 'Mensual')

/**
 * Las filas de la lista de la Caja para un rango (reglas 2, 3 y 4 del plan).
 *
 * - Variable: cae en su `date`; sin fecha no se sabe dónde y no sale.
 * - Fijo cargado: sale del GASTO, no de la etiqueta (sobrevive a que la borren o le cambien el
 *   tipo) y muestra su `expense_name`. Cae en `date`, o en el vencimiento si no la tiene.
 * - Fijo pendiente = mes sin fila: por cada etiqueta FIXED viva y cada mes del rango sin gasto vivo
 *   `(preset_id, period)`, una fila virtual (`status: 'NONE'`) con el monto habitual. La etiqueta
 *   cuenta desde el mes de su creación (en hora local).
 *
 * `etiquetas` trae también las borradas: un gasto viejo lee de ahí su vencimiento.
 * Orden: fecha descendente, nombre ascendente.
 */
export function filasDelRango(gastos: Gasto[], etiquetas: Etiqueta[], rango: Rango, conPendientes: boolean): FilaCaja[] {
  const vivos = gastos.filter(g => !g.deleted_at)
  const etiquetaDe = (id: string | null) => (id ? etiquetas.find(e => e.id === id) ?? null : null)
  const filas: FilaCaja[] = []

  for (const g of vivos) {
    if (g.expense_type === 'VARIABLE') {
      if (!g.date || g.date < rango.from || g.date > rango.to) continue
      filas.push({
        kind: 'VARIABLE', fecha: g.date, nombre: g.expense_name, sub: g.notes ?? '', status: g.status,
        amount: g.amount, gasto: g, etiqueta: etiquetaDe(g.preset_id), period: g.period,
      })
    } else {
      const etiqueta = etiquetaDe(g.preset_id)
      const fecha = g.date ?? dueDate(g.period, etiqueta?.due_day ?? null)
      if (fecha < rango.from || fecha > rango.to) continue
      filas.push({
        kind: 'FIXED', fecha, nombre: g.expense_name, sub: subDeFijo(etiqueta), status: g.status,
        amount: g.amount, gasto: g, etiqueta, period: g.period,
      })
    }
  }

  for (const period of mesesDelRango(rango)) {
    for (const e of etiquetas) {
      if (e.expense_type !== 'FIXED' || e.deleted_at || periodoDeInstante(e.created_at) > period) continue
      if (vivos.some(g => g.preset_id === e.id && g.period === period)) continue
      const fecha = dueDate(period, e.due_day)
      if (fecha < rango.from || fecha > rango.to) continue
      filas.push({
        kind: 'FIXED', fecha, nombre: e.name, sub: subDeFijo(e), status: 'NONE',
        amount: e.default_amount ?? 0, gasto: null, etiqueta: e, period,
      })
    }
  }

  const visibles = conPendientes ? filas : filas.filter(f => f.status === 'PAID')
  return visibles.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre))
}
