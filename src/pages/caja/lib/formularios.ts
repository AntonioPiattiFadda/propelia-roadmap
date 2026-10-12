import type { CalendarDay } from '@/lib/dates'
import type { TablesInsert } from '@/types/database.types'
import type { Etiqueta, EstadoGasto, Gasto, TipoGasto } from '../types'
import { nuevoGastoFijo, nuevoGastoVariable } from './altas'
import { nombreRepetido } from './etiquetas'
import { montoAInput, parseMonto } from './monto'
import { tituloDePeriodo } from './periodos'

/* La lógica de los formularios de la Caja, sin React: los dialogs solo muestran el `error` y,
   si no hay, mandan el insert. Los mensajes son los del mock aprobado. */

const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Flechas del combobox: da la vuelta. Sin opciones se queda en 0. */
export function moverIndice(actual: number, total: number, tecla: 'ArrowDown' | 'ArrowUp'): number {
  if (total <= 0) return 0
  return (actual + (tecla === 'ArrowDown' ? 1 : -1) + total) % total
}

export interface EntradaGasto {
  etiqueta: Etiqueta | null
  monto: string
  fecha: string
  period: string
  estado: EstadoGasto
  notas: string
  /** Quién lo pagó (id de `users`). Un variable pendiente no lo necesita. */
  pagadoPor: string | null
  /** Ya hay un gasto vivo de ESTA etiqueta en ESTE período (solo importa en los fijos). */
  yaPagado: boolean
}

/** El alta entera: un error en castellano o el insert, armado SOLO con los builders de `altas.ts`. */
export function validarGasto(e: EntradaGasto): { error: string } | { insert: TablesInsert<'expenses'> } {
  if (!e.etiqueta) return { error: 'Elegí una etiqueta o creala.' }
  const amount = parseMonto(e.monto)
  if (!(amount > 0)) return { error: 'El monto tiene que ser mayor que cero.' }
  const fijo = e.etiqueta.expense_type === 'FIXED'
  if (fijo && !e.period) return { error: 'Falta el período que cubre.' }
  // `type="month"` cae a texto libre en algunos navegadores: no confiar en lo que llegue.
  if (fijo && !PERIODO_VALIDO.test(e.period)) return { error: 'El período tiene que ser un mes válido (AAAA-MM).' }
  if (!e.fecha) return { error: 'Falta la fecha.' }
  const pagado = fijo || e.estado === 'PAID'
  if (pagado && !e.pagadoPor) return { error: 'Elegí quién lo pagó.' }
  // Una etiqueta fija tiene a lo sumo un gasto vivo por mes (índice único en la base).
  if (fijo && e.yaPagado) return { error: `${capitalizar(tituloDePeriodo(e.period))} ya está pagado para ${e.etiqueta.name}.` }
  const date: CalendarDay = e.fecha
  return {
    insert: fijo
      ? nuevoGastoFijo(e.etiqueta, { amount, date, period: e.period, paid_by: e.pagadoPor })
      : nuevoGastoVariable(e.etiqueta, { amount, date, status: e.estado, notes: e.notas, paid_by: e.pagadoPor }),
  }
}

/** «Confirmar pago» de un variable pendiente. */
export function validarPago(
  monto: string,
  fecha: string,
  pagadoPor: string | null,
): { error: string } | { amount: number; date: CalendarDay; paid_by: string } {
  const amount = parseMonto(monto)
  if (!(amount > 0)) return { error: 'El monto tiene que ser mayor que cero.' }
  if (!fecha) return { error: 'Falta la fecha de pago.' }
  if (!pagadoPor) return { error: 'Elegí quién lo pagó.' }
  return { amount, date: fecha, paid_by: pagadoPor }
}

export interface EntradaEtiqueta { name: string; tipo: TipoGasto; monto: string; dia: string }

/**
 * Alta y edición de etiqueta. El nombre se compara contra TODAS las vivas, de los dos tipos
 * (la base tiene un único por `lower(name)`). Monto y día solo existen en un fijo y son
 * opcionales: lo ilegible o fuera de rango queda en null en vez de bloquear el guardado.
 */
export interface ValoresEtiqueta { name: string; expense_type: TipoGasto; default_amount: number | null; due_day: number | null }

export function validarEtiquetaForm(
  e: EntradaEtiqueta,
  etiquetas: Etiqueta[],
  exceptoId?: string,
): { error: string } | { valores: ValoresEtiqueta } {
  const name = e.name.trim()
  if (!name) return { error: 'Poné un nombre.' }
  if (nombreRepetido(etiquetas, name, exceptoId)) return { error: 'Ya existe una etiqueta con ese nombre.' }
  const fijo = e.tipo === 'FIXED'
  const monto = parseMonto(e.monto)
  const dia = Number(e.dia)
  return {
    valores: {
      name,
      expense_type: e.tipo,
      default_amount: fijo && monto > 0 ? monto : null,
      due_day: fijo && Number.isInteger(dia) && dia >= 1 && dia <= 31 ? dia : null,
    },
  }
}

/** «Pagar» en un fijo pendiente: el alta ya viene con etiqueta, monto habitual y período. */
export function prefillDePagarFijo(etiqueta: Etiqueta, period: string) {
  return { tipo: 'FIXED' as const, etiqueta, monto: montoAInput(etiqueta.default_amount), period }
}


/** El aviso «ya está pagado» del alta: la base lo frena igual (índice único), esto lo dice antes. */
export const hayGastoDelMes = (gastos: Gasto[], etiquetaId: string, period: string): boolean =>
  gastos.some(g => !g.deleted_at && g.preset_id === etiquetaId && g.period === period)
