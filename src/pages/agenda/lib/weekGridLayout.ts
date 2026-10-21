// Posicionamiento del grid semanal (0-24hs) y layout side-by-side de eventos superpuestos,
// estilo Google Calendar simplificado. Puro: sin fetch, sin DOM.

export const HOUR_HEIGHT_PX = 60

export const minutesToPx = (minutes: number): number => (minutes / 60) * HOUR_HEIGHT_PX

const pad2 = (n: number): string => String(n).padStart(2, '0')

export const minutesToHHMM = (minutes: number): string => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`

// Un click justo sobre una línea de hora tiene que caer en la banda de abajo, no en la de
// arriba. El zoom se mide en runtime (ver `gridPointer.ts`), así que puede llegar 0.8999999
// en vez de 0.9 y dejar el borde un pelo corto: sin este margen, `Math.floor` lo mandaría
// media banda atrás. Es error de representación binaria, muy por debajo de un píxel.
const SNAP_EPSILON_MINUTES = 1e-6

// Click-to-create: convierte el offset en px (dentro de la columna del día) al slot de horario
// snapeado a `snapMinutes`. Usado por el click en una celda vacía del grid.
//
// Trunca (`floor`) en vez de redondear al más cercano: la banda visual donde soltás el click es
// la que se crea, como en Google Calendar. Con `Math.round` la banda que producía las 07:00 iba
// de 06:45 a 07:15 — corrida media banda hacia arriba respecto a la grilla dibujada, y se sentía
// como si el grid entero estuviera desplazado.
export const pxToSnappedTime = (
  offsetPx: number,
  snapMinutes = 30,
  durationMinutes = 60,
): { startMinutes: number; endMinutes: number } => {
  const rawMinutes = (offsetPx / HOUR_HEIGHT_PX) * 60
  const snapped = Math.floor((rawMinutes + SNAP_EPSILON_MINUTES) / snapMinutes) * snapMinutes
  const maxStart = 24 * 60 - snapMinutes
  const startMinutes = Math.max(0, Math.min(maxStart, snapped))
  const endMinutes = Math.min(startMinutes + durationMinutes, 24 * 60)
  return { startMinutes, endMinutes }
}

// El grid vive adentro de `.ui-scale` (`zoom: 0.9`, src/index.css:360). Según MDN,
// `getBoundingClientRect()` y `MouseEvent.clientY` reportan px de *viewport*, o sea ya
// multiplicados por el zoom; `HOUR_HEIGHT_PX`, en cambio, es px de *layout*. Mezclar los dos
// hacía que el click cayera ~10% más arriba, con el error creciendo a lo largo del día:
// a las 09:00 fallaba una hora, a las 20:00 fallaba dos.
//
// El zoom se recibe *medido* (rect.height / offsetHeight — `offsetHeight` no incluye el zoom)
// en vez de leer `--ui-scale`: así sigue andando si mañana cambia el valor, si aparecen zooms
// anidados, o si no hay zoom en absoluto (zoom = 1 es la identidad).
export const viewportPxToLayoutPx = (viewportPx: number, zoom: number): number =>
  Number.isFinite(zoom) && zoom > 0 ? viewportPx / zoom : viewportPx

export interface TimedEvent {
  id: string
  startMinutes: number
  endMinutes: number
}

export interface PositionedEvent extends TimedEvent {
  column: number
  columns: number
}

// Algoritmo greedy de packing por columnas: agrupa eventos en clusters por solapamiento
// encadenado, y dentro de cada cluster asigna cada evento a la primera columna libre
// (cuyo último evento ya terminó). No maximiza el ancho como Google real — side-by-side simple.
export const layoutOverlappingEvents = (events: TimedEvent[]): PositionedEvent[] => {
  const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes)

  const clusters: TimedEvent[][] = []
  let clusterEnd = -Infinity
  for (const event of sorted) {
    if (event.startMinutes >= clusterEnd) {
      clusters.push([event])
      clusterEnd = event.endMinutes
    } else {
      clusters[clusters.length - 1].push(event)
      clusterEnd = Math.max(clusterEnd, event.endMinutes)
    }
  }

  const result: PositionedEvent[] = []
  for (const cluster of clusters) {
    const columnEnds: number[] = []
    const assigned: { event: TimedEvent; column: number }[] = []
    for (const event of cluster) {
      let column = columnEnds.findIndex(end => end <= event.startMinutes)
      if (column === -1) {
        column = columnEnds.length
        columnEnds.push(event.endMinutes)
      } else {
        columnEnds[column] = event.endMinutes
      }
      assigned.push({ event, column })
    }
    const columns = columnEnds.length
    for (const { event, column } of assigned) {
      result.push({ ...event, column, columns })
    }
  }

  return result
}
