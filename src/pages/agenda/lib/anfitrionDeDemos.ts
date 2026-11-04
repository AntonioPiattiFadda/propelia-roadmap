import type { GoogleAgendaItem } from './googleAgenda'

/* Quién da las demos (4/11/2026, por pedido): el selector de día y hora de la demo pinta, además de
   tu semana, cuándo está ocupado él. Solo si quien agenda es SDR (lo corta también el servidor). Solo los bloques, sin títulos ni detalles: los lee la edge
   function `calendar-sync` (acción `anfitrion-ocupado`) con la conexión de Google del anfitrión. */

export type BloqueOcupado = { start: string; end: string }

export type OcupadosDelAnfitrion = {
  busy: BloqueOcupado[]
  nombre: string | null
  /** `es_quien_pide`: el anfitrión agenda su propia demo y ya ve su Google entero.
   *  `no_es_sdr`: solo un SDR lo ve (4/11/2026, por pedido). */
  estado: 'ok' | 'sin_conexion' | 'es_quien_pide' | 'sin_anfitrion' | 'no_es_sdr'
}

/**
 * Los bloques ocupados como eventos de Google para `buildAgendaEvents`. El que ya se ve en la
 * agenda con el mismo horario no va (una demo tuya a la que el anfitrión está invitado saldría dos
 * veces); un bloque con fechas que no se leen tampoco.
 */
export function ocupadosComoEventos(
  busy: readonly BloqueOcupado[], nombre: string, yaEnLaAgenda: readonly BloqueOcupado[],
): GoogleAgendaItem[] {
  const clave = (b: BloqueOcupado) => `${Date.parse(b.start)}-${Date.parse(b.end)}`
  const vistos = new Set(yaEnLaAgenda.map(clave))
  return busy
    .filter(b => !Number.isNaN(Date.parse(b.start)) && !Number.isNaN(Date.parse(b.end)) && !vistos.has(clave(b)))
    .map(b => ({ id: `anfitrion-${b.start}`, summary: `Ocupado · ${nombre}`, start: b.start, end: b.end, isAllDay: false }))
}
