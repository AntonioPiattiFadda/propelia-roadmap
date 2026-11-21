import type { CalendarDay } from '@/lib/dates'
import type { TablesInsert } from '@/types/database.types'
import type { Etiqueta, Gasto, TipoGasto } from '../types'
import { mismoNombre } from './etiquetas'
import { hayGastoDelMes, validarGasto, type ValoresEtiqueta } from './formularios'
import { parseMonto } from './monto'
import { periodOf } from './periodos'

/* La fila vacía al final de cada bloque de la vista por mes, para cargar como en una planilla sin
   abrir la ventana de «Nuevo gasto» (21/11/2026, por pedido). El bloque decide el tipo: en «Fijos
   mensuales» nace fijo, en «Variables» variable. Siempre sale pagado. El concepto es la etiqueta:
   si no existe, se crea del tipo del bloque. */

export interface EntradaRapida {
  tipo: TipoGasto
  /** El mes del bloque: el período de un fijo. Un variable lo saca de la fecha. */
  period: string
  texto: string
  monto: string
  fecha: string
  notas: string
  pagadoPor: string | null
  /** «Pagaron ambos»: `pagadoPor` igual va (la base lo exige) y el gasto se reparte entre los dos. */
  ambos: boolean
}

/** En el mes de hoy, hoy; en otro mes, el día 1 de ese mes. */
export const fechaDeFilaRapida = (period: string, hoy: CalendarDay): CalendarDay =>
  periodOf(hoy) === period ? hoy : `${period}-01`

const NOMBRE_DE_TIPO: Record<TipoGasto, { gasto: string; bloque: string }> = {
  FIXED: { gasto: 'fijo', bloque: 'Fijos mensuales' },
  VARIABLE: { gasto: 'variable', bloque: 'Variables' },
}

/** El insert con una etiqueta ya resuelta: las reglas son las del alta (`validarGasto`). */
export function insertDeFilaRapida(
  etiqueta: Etiqueta,
  e: EntradaRapida,
  gastos: Gasto[],
): { error: string } | { insert: TablesInsert<'expenses'> } {
  const period = e.tipo === 'FIXED' ? e.period : e.fecha ? periodOf(e.fecha) : e.period
  const r = validarGasto({
    etiqueta, monto: e.monto, fecha: e.fecha, period, estado: 'PAID', notas: e.notas, pagadoPor: e.pagadoPor,
    yaPagado: hayGastoDelMes(gastos, etiqueta.id, period),
  })
  // La marca va solo si es «Ambos»: así lo de una persona se sigue cargando sin la migración corrida.
  return 'insert' in r && e.ambos ? { insert: { ...r.insert, paid_by_both: true } } : r
}

/**
 * Lo que hay que hacer con la fila: un error, crear primero la etiqueta (`crear`) o el insert.
 * Todo lo que se puede revisar antes de crear la etiqueta se revisa acá, así un monto mal
 * escrito no deja una etiqueta nueva colgada.
 */
export function prepararFilaRapida(
  e: EntradaRapida,
  etiquetas: Etiqueta[],
  gastos: Gasto[],
): { error: string } | { crear: ValoresEtiqueta } | { insert: TablesInsert<'expenses'> } {
  const nombre = e.texto.trim()
  if (!nombre) return { error: 'Escribí el concepto.' }
  const amount = parseMonto(e.monto)
  if (!(amount > 0)) return { error: 'El monto tiene que ser mayor que cero.' }
  if (!e.fecha) return { error: 'Falta la fecha.' }
  if (!e.pagadoPor) return { error: 'Elegí quién lo pagó.' }
  // La base tiene un único nombre entre las vivas de los dos tipos.
  const viva = etiquetas.find(x => !x.deleted_at && mismoNombre(x.name, nombre))
  if (viva && viva.expense_type !== e.tipo) {
    const suyo = NOMBRE_DE_TIPO[viva.expense_type]
    return { error: `«${viva.name}» es un gasto ${suyo.gasto}: cargalo en ${suyo.bloque}.` }
  }
  if (viva) return insertDeFilaRapida(viva, e, gastos)
  const fijo = e.tipo === 'FIXED'
  return { crear: { name: nombre, expense_type: e.tipo, default_amount: fijo ? amount : null, due_day: null } }
}
