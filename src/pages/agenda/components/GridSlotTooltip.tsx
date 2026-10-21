import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { minutesToHHMM } from '../lib/weekGridLayout'
import { DAY_COLUMN_ATTR, EVENT_BLOCK_ATTR, slotAtPointer } from '../lib/gridPointer'

const CURSOR_OFFSET_PX = 14
const VIEWPORT_MARGIN_PX = 8

type Props = { gridRef: RefObject<HTMLElement | null> }

/**
 * Etiqueta flotante que sigue al cursor sobre el grid y anuncia el horario que ese click
 * va a crear. Usa `slotAtPointer`, la misma función que el click-to-create: si alguna vez
 * vuelven a divergir, divergen las dos juntas y se nota.
 *
 * No tiene estado de React a propósito. La posición cambia en cada `mousemove` (~60/s) y un
 * `setState` ahí re-renderizaría las 7 columnas del grid con todos sus eventos en cada frame.
 * Escribiendo `transform` sobre el nodo, el navegador sólo recompone: el grid nunca se entera.
 *
 * Va portaleado a `document.body` porque la agenda corre adentro de `.ui-scale` (`zoom: 0.9`),
 * y ahí el zoom escala también el `top`/`left` de un `position: fixed` — el tooltip se
 * despegaría del cursor. Fuera de ese subárbol, `clientX/clientY` se usan tal cual.
 */
export function GridSlotTooltip({ gridRef }: Props) {
  const tipRef = useRef<HTMLDivElement>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    const tip = () => tipRef.current

    const hide = () => {
      const el = tip()
      if (el) el.style.opacity = '0'
    }

    const render = (clientX: number, clientY: number) => {
      const el = tip()
      if (!el) return

      // `elementFromPoint` en vez de `event.target`: al scrollear con la rueda no hay evento
      // de mouse, y el nodo bajo el cursor puede haber cambiado igual.
      const under = document.elementFromPoint(clientX, clientY)
      const column = under?.closest<HTMLElement>(`[${DAY_COLUMN_ATTR}]`)
      // Sobre un bloque de evento el click abre la edición (hace `stopPropagation`), no crea
      // nada: anunciar un horario ahí sería mentir.
      if (!column || under?.closest(`[${EVENT_BLOCK_ATTR}]`)) {
        hide()
        return
      }

      const { startMinutes, endMinutes } = slotAtPointer(column, clientY)
      el.textContent = `${minutesToHHMM(startMinutes)} – ${minutesToHHMM(endMinutes)}`
      el.style.opacity = '1'

      // Se mide después de escribir el texto: el ancho depende de lo que dice.
      const { offsetWidth: width, offsetHeight: height } = el
      const flipX = clientX + CURSOR_OFFSET_PX + width > window.innerWidth - VIEWPORT_MARGIN_PX
      const flipY = clientY + CURSOR_OFFSET_PX + height > window.innerHeight - VIEWPORT_MARGIN_PX
      const x = flipX ? clientX - CURSOR_OFFSET_PX - width : clientX + CURSOR_OFFSET_PX
      const y = flipY ? clientY - CURSOR_OFFSET_PX - height : clientY + CURSOR_OFFSET_PX
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
    }

    const handleMove = (event: MouseEvent) => {
      lastPointer.current = { x: event.clientX, y: event.clientY }
      render(event.clientX, event.clientY)
    }

    const handleLeave = () => {
      lastPointer.current = null
      hide()
    }

    // Scrolleando con el mouse quieto, el horario debajo del cursor cambia sin que llegue
    // un `mousemove`. Sin esto el tooltip se queda mostrando el slot viejo.
    const handleScroll = () => {
      const pointer = lastPointer.current
      if (pointer) render(pointer.x, pointer.y)
    }

    grid.addEventListener('mousemove', handleMove)
    grid.addEventListener('mouseleave', handleLeave)
    grid.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      grid.removeEventListener('mousemove', handleMove)
      grid.removeEventListener('mouseleave', handleLeave)
      grid.removeEventListener('scroll', handleScroll)
    }
  }, [gridRef])

  return createPortal(
    <div
      ref={tipRef}
      role="status"
      aria-live="off"
      className="fixed top-0 left-0 z-50 pointer-events-none opacity-0 rounded-md bg-foreground px-2 py-1 text-xs font-medium tabular-nums text-background shadow-md transition-opacity duration-75"
    />,
    document.body,
  )
}
