export interface BusyRange {
  start: string
  end: string
}

const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })

export const formatBusyRanges = (busy: BusyRange[]): string =>
  busy.map((range) => `${hhmm(range.start)}–${hhmm(range.end)}`).join(', ')
