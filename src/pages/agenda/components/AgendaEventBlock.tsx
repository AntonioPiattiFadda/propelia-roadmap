import { GOOGLE_EVENT_COLORS } from '../lib/googleEventColors'
import { EVENT_BLOCK_ATTR } from '../lib/gridPointer'
import type { AgendaEvent } from '../lib/agendaEvents'

const DEFAULT_MEETING_COLOR = '#5484ed' // azul default de Google Calendar

const colorFor = (colorId: string | null): string =>
  (colorId && GOOGLE_EVENT_COLORS[colorId]?.background) || DEFAULT_MEETING_COLOR

const TIME_LABEL = new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit' })

type Props = {
  event: AgendaEvent
  top: number
  height: number
  left: number
  width: number
  onEditClick?: (event: AgendaEvent, clientX: number, clientY: number) => void
}

// Bloque posicionado dentro de la columna del día (copiado de `propelia-frontend`). Las reuniones
// del CRM se ven "sólidas" y son editables (click abre MeetingFormPopover en modo edición); los
// eventos de Google que no son reuniones se ven con borde punteado — de solo lectura, el click no hace nada.
export function AgendaEventBlock({ event, top, height, left, width, onEditClick }: Props) {
  const background = colorFor(event.colorId)
  const isCancelled = event.status === 'cancelled'
  const isReadOnly = event.source === 'google'

  return (
    <div
      {...{ [EVENT_BLOCK_ATTR]: '' }}
      className="absolute rounded-sm px-1.5 py-0.5 overflow-hidden text-white text-[11px] leading-tight"
      style={{
        top,
        height: Math.max(height, 18),
        left: `${left}%`,
        width: `calc(${width}% - 2px)`,
        backgroundColor: background,
        border: isReadOnly ? '1px dashed rgba(255,255,255,0.8)' : undefined,
        textDecoration: isCancelled ? 'line-through' : undefined,
        cursor: isReadOnly ? 'default' : 'pointer',
      }}
      title={event.title}
      onClick={(e) => {
        e.stopPropagation()
        if (!isReadOnly) onEditClick?.(event, e.clientX, e.clientY)
      }}
    >
      <div className="font-medium truncate">{event.title}</div>
      {!event.isAllDay && <div className="truncate opacity-90">{TIME_LABEL.format(new Date(event.startIso))}</div>}
    </div>
  )
}
