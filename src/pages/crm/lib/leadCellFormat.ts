// Copiado tal cual de propelia-frontend (src/pages/leads/lib/leadCellFormat.ts).
/**
 * Formato y paleta compartidos por las celdas de la fila de lead.
 *
 * Viven fuera de `leadCells.tsx` porque ese archivo sólo puede exportar
 * componentes: mezclar constantes ahí rompe el fast refresh de Vite.
 */

// es-ES abrevia el día como "lun." (minúscula y con punto según la versión de ICU), así
// que el día se normaliza a mano más abajo.
const INGRESO_WEEKDAY = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })

/**
 * "Lun 24/08": la columna Fecha de los paneles de leads (venta, alquiler y captación).
 *
 * Día y mes a mano y no con Intl: con sólo { day, month } ignora el "2-digit" y devuelve
 * "10/8", y el ancho variable rompe la alineación de la columna.
 */
export function fmtIngresoDate(iso: string) {
  const d = new Date(iso)
  const raw = INGRESO_WEEKDAY.format(d).replace(/\./g, '')
  const weekday = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${weekday} ${day}/${month}`
}

export function fmtShortDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// due_date es una fecha de calendario ('YYYY-MM-DD', columna date en DB): nunca
// pasar por Date() para mostrarla, o el timezone local puede correrla un día.
export function fmtDueDate(dateStr: string): string {
  const [, month, day] = dateStr.slice(0, 10).split('-')
  return `${day}/${month}`
}
