export interface BusyRange {
  start: string
  end: string
}

const hhmm = (iso: string, timeZone?: string): string =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone })

/** `timeZone` sin pasar es la del navegador; la demo pasa la de España. */
export const formatBusyRanges = (busy: BusyRange[], timeZone?: string): string =>
  busy.map((range) => `${hhmm(range.start, timeZone)}–${hhmm(range.end, timeZone)}`).join(', ')
