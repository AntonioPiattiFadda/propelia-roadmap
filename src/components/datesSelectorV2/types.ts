import type { CalendarDay } from '@/lib/dates'

/**
 * Modos del selector. `compare` está contemplado en el contrato pero todavía no
 * tiene UI: el segmented control lo muestra deshabilitado y `compare` sale null.
 */
export type DatesMode = 'single' | 'range' | 'compare'

/** Dos días calendario locales, ambos inclusive. */
export interface DayRange {
  from: CalendarDay
  to: CalendarDay
}

/**
 * Lo único que sale por `onChange`: fechas. El atajo elegido ('Este mes') es estado
 * de la UI y muere adentro del componente — nunca forma parte del valor, para que el
 * consumidor le pase `primary` a su query sin interpretar nada.
 */
export interface DatesValue {
  mode: DatesMode
  /** En modo `single`, `from === to`. */
  primary: DayRange
  /** Parkeado hasta que exista la UI de comparación: hoy siempre null. */
  compare: DayRange | null
}

export interface DatesSelectorV2Props {
  /** Modos que esta pantalla habilita. Con uno solo no se dibuja el segmented control. */
  activatedModes: DatesMode[]
  value: DatesValue
  onChange: (value: DatesValue) => void
  minDate?: CalendarDay
  maxDate?: CalendarDay
}
