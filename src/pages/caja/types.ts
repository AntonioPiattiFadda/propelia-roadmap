import type { CalendarDay } from '@/lib/dates'

/* Tipos de dominio de la Caja. Los de `database.types.ts` tienen `string` en las columnas con
   CHECK (expense_type, status, recurrence), así que acá se angostan a uniones literales.
   Solo `import type`: lib/ y sus tests nunca tienen que cargar @/lib/supabase. */

export type TipoGasto = 'FIXED' | 'VARIABLE'
/** PENDING es solo de los variables: un fijo cargado está PAID (`expenses_fixed_paid_check`). */
export type EstadoGasto = 'PENDING' | 'PAID'
export type Recurrencia = 'MONTHLY' | 'ONE_TIME'
/** El filtro de la barra: los dos tipos o ninguno. */
export type FiltroTipo = 'all' | TipoGasto

/** Una fila de `expenses`. */
export interface Gasto {
  id: string
  preset_id: string | null
  expense_name: string
  expense_type: TipoGasto
  amount: number
  /** Día de pago (o fecha esperada, en un variable pendiente). */
  date: CalendarDay | null
  /** 'YYYY-MM': el mes al que se imputa, que no tiene por qué ser el de `date`. */
  period: string
  recurrence: Recurrencia
  status: EstadoGasto
  notes: string | null
  created_at: string
  deleted_at: string | null
}

/** Una fila de `expense_presets`: lo que en pantalla se llama «etiqueta». */
export interface Etiqueta {
  id: string
  name: string
  expense_type: TipoGasto
  recurrence: Recurrencia
  default_amount: number | null
  due_day: number | null
  /** Instante (timestamptz): su mes local sale de `periodoDeInstante`, no de cortar el string. */
  created_at: string
  deleted_at: string | null
}

export interface Rango {
  from: CalendarDay
  to: CalendarDay
}

/** NONE = fijo pendiente virtual: el mes todavía no tiene su fila en `expenses`. */
export type EstadoFila = 'PAID' | 'PENDING' | 'NONE'

export interface FilaCaja {
  kind: TipoGasto
  fecha: CalendarDay
  nombre: string
  sub: string
  status: EstadoFila
  amount: number
  gasto: Gasto | null
  etiqueta: Etiqueta | null
  period: string
}

export interface ResumenCaja {
  total: number
  pagado: number
  porPagar: number
  nGastos: number
  nPagados: number
  nPendientes: number
  nFijosSinPagar: number
  fijos: number
  variables: number
}

export interface SubtotalMes {
  period: string
  total: number
  n: number
}
