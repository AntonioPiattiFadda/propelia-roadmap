import { useState } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'
import { MeetingFormContent, type EditableMeeting } from './MeetingFormContent'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Coordenadas de viewport (clientX/clientY) donde se hizo click en el grid — el popover se ancla ahí. */
  anchorPoint: { x: number; y: number }
  leadId?: string
  /** De quién es la reunión que se crea (por defecto, de quien la agenda). */
  assignedTo?: string
  defaultTitle?: string
  defaultDescription?: string
  guests?: { label: string }[]
  /** Invitados por email ya cargados al crear (la demo: la inmobiliaria y Lorenzo). */
  defaultGuestEmails?: string[]
  defaultDate?: string
  defaultStartTime?: string
  defaultEndTime?: string
  onTitleChange?: (title: string) => void
  onDescriptionChange?: (description: string) => void
  onSaved?: () => void
  /** Si se pasa, el popover edita esta reunión existente en vez de crear una nueva. */
  meeting?: EditableMeeting
  /** Agendar una demo de `leadId`, con el registro de actividad al lado (ver MeetingFormContent). */
  demo?: boolean
}

// `VisitFormPopover` de `propelia-frontend` (21/10/2026), para reuniones del CRM.
// Versión "anclada a un punto" de MeetingFormContent, para el click-to-create del grid de
// /agenda (estilo Google Calendar: click en una celda vacía abre el form ahí mismo, no
// centrado en la pantalla). El ancla es un elemento invisible de 1x1px
// posicionado en las coordenadas del click — Popover no soporta anclar a un punto arbitrario
// sin un elemento real de por medio.
export function MeetingFormPopover({
  open,
  onOpenChange,
  anchorPoint,
  leadId,
  assignedTo,
  defaultTitle,
  defaultDescription,
  guests,
  defaultGuestEmails,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  onTitleChange,
  onDescriptionChange,
  onSaved,
  meeting,
  demo,
}: Props) {
  const isMobile = useIsMobile()
  const [drag, setDrag] = useState({ x: 0, y: 0 })

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX - drag.x
    const startY = e.clientY - drag.y
    const onMove = (ev: PointerEvent) => setDrag({ x: ev.clientX - startX, y: ev.clientY - startY })
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* `ui-scale-reset` porque `anchorPoint` son coordenadas de viewport (clientX/clientY) pero
          este ancla se renderiza adentro de `.ui-scale` (`zoom: 0.9`), y ahí el navegador escala
          también el `top`/`left` de un `position: fixed`: sin contra-escalar, el popover se abre
          un 10% más arriba y a la izquierda del cursor, cada vez más lejos cuanto más abajo se
          hace click. Mismo motivo que `BulkActionBar`. */}
      <PopoverAnchor asChild>
        <div
          className="ui-scale-reset"
          style={{ position: 'fixed', top: anchorPoint.y, left: anchorPoint.x, width: 1, height: 1 }}
        />
      </PopoverAnchor>
      {/* `max-w` + `collisionPadding`: en el teléfono el formulario era más ancho que la
          pantalla y, anclado al punto del toque, se salía por la derecha.
          `side="right"` + `sticky="always"` en escritorio: abierto a la derecha del click,
          Radix lo puede correr en vertical para que entre entero (abajo no puede: sólo da
          vuelta de lado, y si no entraba ni arriba ni abajo quedaba cortado). El `max-h`
          con scroll cubre el caso de una pantalla más baja que el formulario. */}
      <PopoverContent
        className="w-fit max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 pt-0"
        align="start"
        side={isMobile ? 'bottom' : 'right'}
        sticky="always"
        collisionPadding={8}
        style={{ zIndex: 250, translate: `${drag.x}px ${drag.y}px` }}
      >
        {/* Barra para arrastrar la ventana. El desplazamiento va en `translate`, aparte del
            `transform` con el que Radix la posiciona. */}
        <div
          onPointerDown={startDrag}
          aria-hidden
          className="sticky top-0 z-10 -mx-4 mb-2 flex h-5 cursor-move touch-none select-none items-center justify-center bg-(--surface)"
        >
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <MeetingFormContent
          open={open}
          onClose={() => onOpenChange(false)}
          leadId={leadId}
          assignedTo={assignedTo}
          defaultTitle={defaultTitle}
          defaultDescription={defaultDescription}
          guests={guests}
          defaultGuestEmails={defaultGuestEmails}
          defaultDate={defaultDate}
          defaultStartTime={defaultStartTime}
          defaultEndTime={defaultEndTime}
          onTitleChange={onTitleChange}
          onDescriptionChange={onDescriptionChange}
          onSaved={onSaved}
          meeting={meeting}
          demo={demo}
        />
      </PopoverContent>
    </Popover>
  )
}
