/** «Minutos sin llamar» como horas y minutos, «1:05» (19/11/2026, por pedido: como la vista de
 *  llamadas de Lusmary y Adriana). Null es que el cron de Aircall todavía no lo guardó: «–». */
export function horasYMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min) || min < 0) return '–'
  const m = Math.round(min)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export type TonoSinLlamar = 'bien' | 'atento' | 'mal'

/** El semáforo de los minutos sin llamar del día (19/11/2026, por pedido): menos de 30 verde,
 *  hasta una hora amarillo y más de una hora rojo. Sin dato no hay tono. */
export function tonoSinLlamar(min: number | null | undefined): TonoSinLlamar | null {
  if (min === null || min === undefined || !Number.isFinite(min) || min < 0) return null
  if (min < 30) return 'bien'
  if (min <= 60) return 'atento'
  return 'mal'
}
