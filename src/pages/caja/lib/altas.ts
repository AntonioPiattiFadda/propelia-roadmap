import type { CalendarDay } from '@/lib/dates'
import type { TablesInsert } from '@/types/database.types'
import type { Etiqueta, EstadoGasto, TipoGasto } from '../types'
import { periodOf } from './periodos'

/* Los únicos constructores de inserts de la Caja. Las reglas 1, 4 y 5 del plan viven acá y no en
   cada dialog: un fijo se carga siempre PAID/MONTHLY, un variable siempre ONE_TIME, y el nombre
   se copia de la etiqueta. Con esto la UI no tiene cómo armar un insert inválido. */

function montoValido(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('caja_monto_invalido')
}

/** Pagado ⇒ alguien lo pagó (`expenses_paid_by_check`). */
function pagadorValido(paid_by: string | null): string {
  if (!paid_by) throw new Error('caja_sin_pagador')
  return paid_by
}

export function nuevoGastoFijo(
  etiqueta: Etiqueta,
  { amount, date, period, paid_by }: { amount: number; date: CalendarDay; period: string; paid_by: string | null },
): TablesInsert<'expenses'> {
  if (etiqueta.expense_type !== 'FIXED') throw new Error('caja_etiqueta_de_otro_tipo')
  montoValido(amount)
  // `period` lo manda quien llama: un fijo puede pagarse en un mes distinto al que se imputa.
  return {
    preset_id: etiqueta.id, expense_name: etiqueta.name, expense_type: 'FIXED', amount, date, period,
    recurrence: 'MONTHLY', status: 'PAID', paid_by: pagadorValido(paid_by),
  }
}

export function nuevoGastoVariable(
  etiqueta: Etiqueta,
  { amount, date, status, notes, paid_by }:
    { amount: number; date: CalendarDay; status: EstadoGasto; notes?: string; paid_by: string | null },
): TablesInsert<'expenses'> {
  if (etiqueta.expense_type !== 'VARIABLE') throw new Error('caja_etiqueta_de_otro_tipo')
  montoValido(amount)
  return {
    preset_id: etiqueta.id, expense_name: etiqueta.name, expense_type: 'VARIABLE', amount, date,
    period: periodOf(date), recurrence: 'ONE_TIME', status, notes: notes?.trim() || null,
    // Un pendiente todavía no lo pagó nadie: se elige al confirmar el pago.
    paid_by: status === 'PAID' ? pagadorValido(paid_by) : null,
  }
}

export function nuevaEtiqueta(
  { name, expense_type, default_amount = null, due_day = null }:
    { name: string; expense_type: TipoGasto; default_amount?: number | null; due_day?: number | null },
): TablesInsert<'expense_presets'> {
  const nombre = name.trim()
  if (!nombre) throw new Error('caja_nombre_vacio')
  const fijo = expense_type === 'FIXED'
  return {
    name: nombre, expense_type, recurrence: fijo ? 'MONTHLY' : 'ONE_TIME', default_amount,
    // El vencimiento solo existe para un fijo: en un variable no hay mes que lo reclame.
    due_day: fijo ? due_day : null,
  }
}
