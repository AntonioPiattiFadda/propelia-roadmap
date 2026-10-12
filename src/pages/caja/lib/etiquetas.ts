import type { Etiqueta, Gasto, TipoGasto } from '../types'
import { eur } from './monto'

export const mismoNombre = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Solo las vivas: borrar «Vercel» y crear otra «Vercel» es válido (índice único parcial en la base). */
export function nombreRepetido(etiquetas: Etiqueta[], nombre: string, exceptoId?: string): boolean {
  if (!nombre.trim()) return false
  return etiquetas.some(e => !e.deleted_at && e.id !== exceptoId && mismoNombre(e.name, nombre))
}

export const etiquetasVivas = (etiquetas: Etiqueta[], tipo: TipoGasto): Etiqueta[] =>
  etiquetas.filter(e => !e.deleted_at && e.expense_type === tipo)

/** «20,00 € · vence el 15 · 2 gastos». Los gastos se dicen siempre, también «0 gastos». */
export function metaDeEtiqueta(etiqueta: Etiqueta, nGastos: number): string {
  const meta: string[] = []
  if (etiqueta.default_amount != null) meta.push(eur(etiqueta.default_amount))
  if (etiqueta.due_day != null) meta.push(`vence el ${etiqueta.due_day}`)
  meta.push(nGastos === 1 ? '1 gasto' : `${nGastos} gastos`)
  return meta.join(' · ')
}

/**
 * Qué cambió de lo que se copia a los gastos. Solo el NOMBRE se propaga. El tipo no: un gasto ya
 * cargado como variable fue variable, y reescribirlo chocaría con `expenses_fixed_paid_check`
 * (fijos pendientes) y `expenses_preset_period_key` (varios en un mes). El monto y el vencimiento
 * tampoco. `campos` es para la frase «Cambiaste el nombre…»; vacío = no hay nada que preguntar.
 */
export function cambiosDeEtiqueta(
  antes: Etiqueta,
  despues: { name: string; expense_type: TipoGasto },
): { campos: string[]; cambios: Partial<Gasto> } {
  const nombre = despues.name.trim()
  if (nombre === antes.name) return { campos: [], cambios: {} }
  return { campos: ['el nombre'], cambios: { expense_name: nombre } }
}

/** `forward` = del mes actual en adelante (`period >= mesActual`, 'YYYY-MM'); `all`, todos los vivos. */
export function gastosAPropagar(
  gastos: Gasto[],
  etiquetaId: string,
  scope: 'forward' | 'all' | 'none',
  mesActual: string,
): Gasto[] {
  if (scope === 'none') return []
  return gastos.filter(g => !g.deleted_at && g.preset_id === etiquetaId && (scope === 'all' || g.period >= mesActual))
}

/**
 * Las opciones del combobox del alta. «Crear» aparece con texto y sin coincidencia exacta DENTRO
 * del tipo elegido (como el mock); si la repite otra de otro tipo, la base lo rechaza con 23505 y
 * `mensajeDeError` lo dice. `vacia`: el tipo todavía no tiene ninguna etiqueta.
 */
export function opcionesDeEtiqueta(etiquetas: Etiqueta[], tipo: TipoGasto, texto: string) {
  const vivas = etiquetasVivas(etiquetas, tipo)
  const t = texto.trim().toLowerCase()
  const items = t ? vivas.filter(e => e.name.toLowerCase().includes(t)) : vivas
  const hayExacta = vivas.some(e => mismoNombre(e.name, texto))
  return { items, hayExacta, mostrarCrear: !!t && !hayExacta, vacia: vivas.length === 0 }
}
