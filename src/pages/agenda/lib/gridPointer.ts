// Lectura del puntero sobre el grid semanal. A diferencia de `weekGridLayout.ts` —que es puro—
// esto mide el DOM, así que vive aparte.

import { pxToSnappedTime, viewportPxToLayoutPx } from './weekGridLayout'

// Marca las columnas de día del grid y los bloques de evento, para poder resolver qué hay
// debajo del cursor desde un único listener en el contenedor (ver `GridSlotTooltip`).
export const DAY_COLUMN_ATTR = 'data-day-column'
export const EVENT_BLOCK_ATTR = 'data-agenda-event'

// Zoom de CSS efectivo sobre un elemento. `offsetHeight` NO incluye el zoom y
// `getBoundingClientRect().height` SÍ, así que su cociente es el factor real —sin leer
// `--ui-scale` ni asumir un valor—. Devuelve 1 si el elemento no está medible.
const effectiveZoom = (el: HTMLElement, rect: DOMRect): number =>
  el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1

// Slot de horario que corresponde a una posición del cursor dentro de una columna de día.
// Es la única fuente de verdad: la usan tanto el click-to-create como el tooltip de hover,
// para que lo que el tooltip anuncia sea exactamente lo que el click termina creando.
export const slotAtPointer = (
  column: HTMLElement,
  clientY: number,
): { startMinutes: number; endMinutes: number } => {
  const rect = column.getBoundingClientRect()
  const offsetPx = viewportPxToLayoutPx(clientY - rect.top, effectiveZoom(column, rect))
  return pxToSnappedTime(offsetPx)
}
