// «Minutos sin llamar» en los Objetivos del conector (19/11/2026, por pedido). El dato lo calcula
// un cron desde Aircall y lo guarda por día con save_call_gaps (tabla crm_call_gaps, migración
// 20261119181855_crm_call_gaps); acá sólo se suma por persona y período. Sin espejo en el front:
// no hay pantalla que lo muestre.

import type { Periodo } from './crmReglas.ts'

export interface FilaDeBaches {
  fecha: string
  persona_id: string
  min_sin_llamar: number
  baches: number
}

export interface MinutosSinLlamar {
  /** Suma de los días con dato. Null si el período no tiene ninguno (ej. hoy antes de las 19:05). */
  min_sin_llamar: number | null
  baches: number | null
  /** Cuántos días del período tienen fila: si falta alguno, la suma se queda corta. */
  dias_con_dato: number
}

/**
 * La suma de una o varias personas en un período (`hasta` exclusivo, como `Periodo`). Un día sin
 * fila no suma nada: no es cero, es que no hay dato.
 */
export function minutosSinLlamar(filas: readonly FilaDeBaches[], personas: readonly string[], periodo: Periodo): MinutosSinLlamar {
  const del = filas.filter((f) => personas.includes(f.persona_id) && f.fecha >= periodo.desde && f.fecha < periodo.hasta)
  if (del.length === 0) return { min_sin_llamar: null, baches: null, dias_con_dato: 0 }
  return {
    min_sin_llamar: del.reduce((s, f) => s + f.min_sin_llamar, 0),
    baches: del.reduce((s, f) => s + f.baches, 0),
    dias_con_dato: new Set(del.map((f) => f.fecha)).size,
  }
}

/** Una fecha `YYYY-MM-DD` de la base, sin hora (PostgREST manda `date` así, pero por las dudas). */
export const diaDe = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '')
