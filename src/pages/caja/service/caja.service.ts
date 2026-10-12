import { supabase } from '@/lib/supabase'
import type { CalendarDay } from '@/lib/dates'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import { aEtiqueta, aGasto } from '../lib/mapeo'
import { periodOf } from '../lib/periodos'
import type { Etiqueta, Gasto, Pagador, Rango } from '../types'

/* Todas las queries y mutaciones de la Caja contra `expenses` / `expense_presets`. Errores con
   `throw`, sin try/catch: los traduce `mensajeDeError()` en los hooks. */

/* Un update que la RLS frena NO falla: devuelve cero filas. `caja_sin_fila` lo traduce
   `mensajeDeError()` a «No tenés permiso». */
function unaFila<T>(data: T[] | null): T {
  const fila = data?.[0]
  if (!fila) throw new Error('caja_sin_fila')
  return fila
}

// ---------- Lectura ----------

const mesDe = (period: string, delta: number): string => {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Los gastos vivos con `period` entre el mes ANTERIOR al `from` y el POSTERIOR al `to`, o con `date`
 * dentro del rango: un fijo puede pagarse en otro mes que su período, y `filasDelRango` decide
 * después cuáles caen adentro.
 * 'YYYY-MM' ordena igual como texto que como fecha.
 */
export async function getGastos(rango: Rango): Promise<Gasto[]> {
  const { data, error } = await supabase
    .from('expenses').select('*')
    .is('deleted_at', null)
    // Ventana por período, MÁS lo que se pagó dentro del rango aunque su período quede lejos
    // (un fijo pagado meses después). `.or` con `and(...)` anidados es sintaxis de PostgREST.
    .or(
      `and(period.gte.${mesDe(periodOf(rango.from), -1)},period.lte.${mesDe(periodOf(rango.to), 1)}),` +
      `and(date.gte.${rango.from},date.lte.${rango.to})`,
    )
  if (error) throw error
  return data.map(aGasto)
}

/** TODAS, también las borradas: un gasto viejo lee de su etiqueta el vencimiento (`lib/` filtra las vivas). */
export async function getEtiquetas(): Promise<Etiqueta[]> {
  const { data, error } = await supabase.from('expense_presets').select('*').order('name')
  if (error) throw error
  return data.map(aEtiqueta)
}

/** Cuántos gastos vivos tiene cada etiqueta. Son decenas: se cuenta acá y no con un group by. */
export async function getUsoDeEtiquetas(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('expenses').select('preset_id').is('deleted_at', null).not('preset_id', 'is', null)
  if (error) throw error
  const uso: Record<string, number> = {}
  for (const { preset_id } of data) if (preset_id) uso[preset_id] = (uso[preset_id] ?? 0) + 1
  return uso
}

/** Quién puede haber pagado: la gente de `users`, también los inactivos (un gasto viejo dice quién lo pagó). */
export async function getPagadores(): Promise<Pagador[]> {
  const { data, error } = await supabase.from('users').select('id, nombre, iniciales, color, activo').order('nombre')
  if (error) throw error
  return data
}

// ---------- Gastos ----------

export async function crearGasto(insert: TablesInsert<'expenses'>): Promise<Gasto> {
  const { data, error } = await supabase.from('expenses').insert(insert).select()
  if (error) throw error
  return aGasto(unaFila(data))
}

/** Pagar un variable pendiente: queda PAID, con el monto real, el día de pago y quién lo pagó. */
export async function confirmarPago(
  id: string,
  { amount, date, paid_by }: { amount: number; date: CalendarDay; paid_by: string },
): Promise<Gasto> {
  const { data, error } = await supabase
    .from('expenses').update({ status: 'PAID', amount, date, period: periodOf(date), paid_by }).eq('id', id).is('deleted_at', null).select()
  if (error) throw error
  return aGasto(unaFila(data))
}

/** «Pagó» desde la fila: solo un gasto pagado (un pendiente lo elige al confirmar el pago). */
export async function cambiarPagador(id: string, paid_by: string): Promise<Gasto> {
  const { data, error } = await supabase
    .from('expenses').update({ paid_by }).eq('id', id).eq('status', 'PAID').is('deleted_at', null).select()
  if (error) throw error
  return aGasto(unaFila(data))
}

export async function borrarGasto(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('id')
  if (error) throw error
  unaFila(data)
}

// ---------- Etiquetas ----------

export async function crearEtiqueta(insert: TablesInsert<'expense_presets'>): Promise<Etiqueta> {
  const { data, error } = await supabase.from('expense_presets').insert(insert).select()
  if (error) throw error
  return aEtiqueta(unaFila(data))
}

export async function editarEtiqueta(id: string, patch: TablesUpdate<'expense_presets'>): Promise<Etiqueta> {
  const { data, error } = await supabase.from('expense_presets').update(patch).eq('id', id).is('deleted_at', null).select()
  if (error) throw error
  return aEtiqueta(unaFila(data))
}

export async function borrarEtiqueta(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('expense_presets').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('id')
  if (error) throw error
  unaFila(data)
}

export type CambiosPropagables = Pick<TablesUpdate<'expenses'>, 'expense_name'>
export type AlcancePropagacion = 'forward' | 'all' | 'none'

/**
 * Regla 8: solo el nombre de la etiqueta se copia a sus gastos vivos (el tipo no: ver `cambiosDeEtiqueta`).
 * `forward` = solo `period >= mesActual`. Un solo UPDATE; si no hay gastos que tocar no pasa nada
 * (la pregunta ni se hace), así que acá cero filas NO es error.
 */
export async function propagarCambio(
  etiquetaId: string,
  cambios: CambiosPropagables,
  scope: AlcancePropagacion,
  mesActual: string,
): Promise<void> {
  if (scope === 'none' || Object.keys(cambios).length === 0) return
  let q = supabase.from('expenses').update(cambios).eq('preset_id', etiquetaId).is('deleted_at', null)
  if (scope === 'forward') q = q.gte('period', mesActual)
  const { error } = await q
  if (error) throw error
}
