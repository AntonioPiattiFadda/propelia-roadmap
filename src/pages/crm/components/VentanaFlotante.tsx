import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { GripHorizontal, XIcon } from 'lucide-react'
import { Icon } from '@/components/ui/icon'

const MARGEN = 16

/** Dónde nace la ventana: arriba a la derecha, debajo del encabezado del lead. El perfil vive a
 *  la izquierda, así que ahí no tapa nada de lo que se está mirando para escribir. */
function posicionInicial(ancho: number) {
  const w = Math.min(ancho, window.innerWidth - MARGEN * 2)
  return { x: window.innerWidth - w - Math.max(MARGEN, window.innerWidth * 0.03 + MARGEN), y: Math.min(96, window.innerHeight * 0.1) }
}

/** Que la ventana no se pueda arrastrar fuera de la pantalla: siempre queda el encabezado a mano. */
function dentroDePantalla(p: { x: number; y: number }, el: HTMLElement | null, ancho: number) {
  const w = el?.offsetWidth ?? ancho
  const h = el?.offsetHeight ?? 200
  return {
    x: Math.min(Math.max(p.x, 0), window.innerWidth - w),
    y: Math.min(Math.max(p.y, 0), window.innerHeight - h),
  }
}

/**
 * Una ventana flotante, sin velo y NO modal: mientras se escribe hay que poder leer el perfil y
 * la actividad, copiar un teléfono, scrollear. Nace arriba a la derecha y se arrastra del
 * encabezado. Clickear afuera NO la cierra, justamente para poder usar el resto; se cierra con
 * Escape o la ✕. La usan «Nueva tarea» y «Registrar actividad»: las dos se escriben mirando el lead.
 *
 * Va con Radix directo y no con `DialogContent`, que dibuja siempre el velo y es copia del producto.
 * La posición vuelve a la de fábrica cada vez que se abre.
 */
export function VentanaFlotante({ open, onOpenChange, titulo, descripcion, ancho = 400, lateral, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: ReactNode
  descripcion: string
  ancho?: number
  /** Lo que cuelga por fuera del borde izquierdo (la guía de la llamada). Va afuera de la caja
   *  recortada (`overflow-hidden`) para poder salirse de ella; se posiciona solo con `absolute`. */
  lateral?: ReactNode
  children: ReactNode
}) {
  const [pos, setPos] = useState(() => posicionInicial(ancho))
  /* Si cambia el ancho con la ventana abierta (registrar actividad se ensancha con «Agendar demo»),
     se corre a la izquierda lo justo para que el borde derecho no se salga de la pantalla. Se
     ajusta en el render y no en un efecto: es estado que se deriva de una prop. */
  const [anchoPrevio, setAnchoPrevio] = useState(ancho)
  if (anchoPrevio !== ancho) {
    setAnchoPrevio(ancho)
    const w = Math.min(ancho, window.innerWidth - MARGEN * 2)
    setPos(p => ({ ...p, x: Math.max(MARGEN, Math.min(p.x, window.innerWidth - w - MARGEN)) }))
  }
  const ventana = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ dx: number; dy: number } | null>(null)

  const cambiar = (next: boolean) => {
    if (next) setPos(posicionInicial(ancho))
    onOpenChange(next)
  }

  const empezarArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    arrastre.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
  }
  const moverArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!arrastre.current) return
    setPos(dentroDePantalla({ x: e.clientX - arrastre.current.dx, y: e.clientY - arrastre.current.dy }, ventana.current, ancho))
  }
  const soltarArrastre = () => { arrastre.current = null }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={cambiar} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={ventana}
          onInteractOutside={e => e.preventDefault()}
          style={{ left: pos.x, top: pos.y, width: `min(${ancho}px, calc(100vw - ${MARGEN * 2}px))` }}
          className="fixed z-50 flex max-h-[calc(100dvh-32px)] flex-col data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] [border:1px_solid_var(--line-strong)]">
          <div
            onPointerDown={empezarArrastre}
            onPointerMove={moverArrastre}
            onPointerUp={soltarArrastre}
            onPointerCancel={soltarArrastre}
            title="Arrastrá para moverla"
            className="flex shrink-0 cursor-grab touch-none items-center gap-2 bg-(--surface-2) px-3 py-2 select-none active:cursor-grabbing [border-bottom:1px_solid_var(--line)]"
          >
            <Icon icon={GripHorizontal} size="sm" className="text-(--fg-muted)" />
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[14px] font-semibold">{titulo}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{descripcion}</DialogPrimitive.Description>
            <DialogPrimitive.Close aria-label="Cerrar"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-card">
              <XIcon size={15} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto">{children}</div>
          </div>
          {lateral}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
