import type { Tables } from '@/types/database.types'
import type { Etiqueta, EstadoGasto, Gasto, Recurrencia, TipoGasto } from '../types'

/* Las columnas con CHECK vienen como `string` en los tipos generados. Se angostan acá y en
   ningún otro lado: un valor que la base nunca debería devolver corta fuerte en vez de colarse
   como si fuera una unión válida y romper después, lejos de su origen. */

function uno<T extends string>(valor: string, validos: readonly T[]): T {
  if (!(validos as readonly string[]).includes(valor)) throw new Error('caja_valor_desconocido')
  return valor as T
}

const TIPOS = ['FIXED', 'VARIABLE'] as const satisfies readonly TipoGasto[]
const ESTADOS = ['PENDING', 'PAID'] as const satisfies readonly EstadoGasto[]
const RECURRENCIAS = ['MONTHLY', 'ONE_TIME'] as const satisfies readonly Recurrencia[]

export function aGasto(f: Tables<'expenses'>): Gasto {
  return {
    id: f.id, preset_id: f.preset_id, expense_name: f.expense_name,
    expense_type: uno(f.expense_type, TIPOS),
    // numeric: PostgREST lo manda como número, pero si algún día llega string no se suma como texto.
    amount: Number(f.amount),
    date: f.date, period: f.period,
    recurrence: uno(f.recurrence, RECURRENCIAS),
    status: uno(f.status, ESTADOS),
    notes: f.notes, created_at: f.created_at, deleted_at: f.deleted_at,
  }
}

export function aEtiqueta(f: Tables<'expense_presets'>): Etiqueta {
  return {
    id: f.id, name: f.name,
    expense_type: uno(f.expense_type, TIPOS),
    recurrence: uno(f.recurrence, RECURRENCIAS),
    default_amount: f.default_amount == null ? null : Number(f.default_amount),
    due_day: f.due_day, created_at: f.created_at, deleted_at: f.deleted_at,
  }
}
