/** «Minutos sin llamar» como horas y minutos, «1:05» (19/11/2026, por pedido: como la vista de
 *  llamadas de Lusmary y Adriana). Null es que el cron de Aircall todavía no lo guardó: «–». */
export function horasYMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min) || min < 0) return '–'
  const m = Math.round(min)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export type TonoSinLlamar = 'verde' | 'amarillo' | 'rojo'

/** El semáforo de los minutos sin llamar del día (19/11/2026, por pedido): menos de 30 verde,
 *  hasta una hora amarillo y más de una hora rojo. Sin dato no hay tono. */
export function tonoSinLlamar(min: number | null | undefined): TonoSinLlamar | null {
  if (min === null || min === undefined || !Number.isFinite(min) || min < 0) return null
  if (min < 30) return 'verde'
  if (min <= 60) return 'amarillo'
  return 'rojo'
}

/** El aviso al SDR cuando el contador pasa la hora y queda en rojo (21/11/2026, por pedido): que
 *  contacte a Lorenzo Piatti para ver si fue un problema técnico o qué se puede mejorar. */
export function avisoSinLlamar(min: number | null | undefined): { titulo: string; texto: string } | null {
  if (tonoSinLlamar(min) !== 'rojo') return null
  return {
    titulo: `Pasaste la hora sin llamar (${horasYMinutos(min)})`,
    texto: 'Para ver si es por problemas técnicos o qué se puede mejorar, ponete en contacto urgente con Lorenzo Piatti y reportale esto para buscar soluciones.',
  }
}

/** Hace cuánto se calculó (19/11/2026, por pedido): «hace 5 min», «hace 3 h», «hace 2 d». Un
 *  instante roto o del futuro (reloj corrido) no dice nada: null. */
export function haceCuanto(iso: string | null | undefined, ahora: Date = new Date()): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const min = Math.floor((ahora.getTime() - t) / 60_000)
  if (min < 0) return null
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}
