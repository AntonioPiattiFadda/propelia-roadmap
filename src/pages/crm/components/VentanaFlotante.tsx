import { useCallback, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { GripHorizontal, XIcon } from 'lucide-react'
import { Icon } from '@/components/ui/icon'

const MARGEN = 16
/** Ancho del panel que cuelga a la derecha (`derecha`) y su separación de la ventana. */
export const ANCHO_DEL_COSTADO = 340
const SEPARACION = 8

/** Si una ventana de `ancho` más el panel de la derecha entran en la pantalla. Si no (el teléfono,
 *  una ventana angosta), lo de la derecha va adentro de la ventana. */
export function useEntraAlCostado(ancho: number): boolean {
  const consulta = `(min-width: ${ancho + ANCHO_DEL_COSTADO + SEPARACION + MARGEN * 2}px)`
  const suscribir = useCallback((avisar: () => void) => {
    const mql = window.matchMedia(consulta)
    mql.addEventListener('change', avisar)
    return () => mql.removeEventListener('change', avisar)
  }, [consulta])
  return useSyncExternalStore(suscribir, () => window.matchMedia(consulta).matches)
}

/* Nace centrada en la pantalla (19/11/2026, por pedido): arriba a la derecha y a 96px del borde, en
   una pantalla baja se iba por abajo y no se veía entera. `null` es «centrada»: la centra el CSS, así
   que sigue centrada aunque crezca (registrar actividad se ensancha con «Agendar demo»). Al
   arrastrarla pasa a tener posición propia. */
type Posicion = { x: number; y: number } | null

/** Que la ventana no se pueda arrastrar fuera de la pantalla: siempre queda el encabezado a mano. */
function dentroDePantalla(p: { x: number; y: number }, el: HTMLElement | null, ancho: number, extra: number) {
  const w = (el?.offsetWidth ?? ancho) + extra
  const h = el?.offsetHeight ?? 200
  return {
    x: Math.min(Math.max(p.x, 0), window.innerWidth - w),
    y: Math.min(Math.max(p.y, 0), window.innerHeight - h),
  }
}

/**
 * Una ventana flotante, sin velo y NO modal: mientras se escribe hay que poder leer el perfil y
 * la actividad, copiar un teléfono, scrollear. Nace centrada y se arrastra del
 * encabezado. Clickear afuera NO la cierra, justamente para poder usar el resto; se cierra con
 * Escape o la ✕. La usan «Nueva tarea» y «Registrar actividad»: las dos se escriben mirando el lead.
 *
 * Va con Radix directo y no con `DialogContent`, que dibuja siempre el velo y es copia del producto.
 * La posición vuelve a la de fábrica cada vez que se abre.
 */
export function VentanaFlotante({ open, onOpenChange, titulo, descripcion, ancho = 400, lateral, derecha, corrida = 0, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: ReactNode
  descripcion: string
  ancho?: number
  /** Lo que cuelga por fuera del borde izquierdo (la guía de la llamada). Va afuera de la caja
   *  recortada (`overflow-hidden`) para poder salirse de ella; se posiciona solo con `absolute`. */
  lateral?: ReactNode
  /** Un panel pegado al borde derecho, de `ANCHO_DEL_COSTADO` (19/11/2026, por pedido: «Avances para
   *  contactar al decisor», para que la ventana no crezca hasta scrollear). Quien lo pasa mira antes
   *  con `useEntraAlCostado` que entre en la pantalla. */
  derecha?: ReactNode
  /** Cuántos px a la izquierda del centro nace (19/11/2026, por pedido: el registro, para dejarle
   *  lugar a `derecha`). Solo la posición de fábrica: arrastrada, manda la del usuario. */
  corrida?: number
  children: ReactNode
}) {
  const extra = derecha ? ANCHO_DEL_COSTADO + SEPARACION : 0
  const [pos, setPos] = useState<Posicion>(null)
  /* Si cambia el ancho con la ventana ya movida (registrar actividad se ensancha con «Agendar demo»),
     se corre a la izquierda lo justo para que el borde derecho no se salga de la pantalla. Se
     ajusta en el render y no en un efecto: es estado que se deriva de una prop. Centrada, el CSS ya
     la acomoda. */
  const [anchoPrevio, setAnchoPrevio] = useState(ancho)
  if (anchoPrevio !== ancho) {
    setAnchoPrevio(ancho)
    const w = Math.min(ancho, window.innerWidth - MARGEN * 2)
    setPos(p => p && ({ ...p, x: Math.max(MARGEN, Math.min(p.x, window.innerWidth - w - MARGEN)) }))
  }
  const ventana = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ dx: number; dy: number } | null>(null)

  // La posición vuelve a «centrada» cada vez que se abre.
  const cambiar = (next: boolean) => {
    if (next) setPos(null)
    onOpenChange(next)
  }

  const empezarArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Centrada no tiene x/y propios: se toman de donde está dibujada.
    const rect = ventana.current?.getBoundingClientRect()
    const actual = pos ?? { x: rect?.left ?? 0, y: rect?.top ?? 0 }
    if (!pos) setPos(actual)
    arrastre.current = { dx: e.clientX - actual.x, dy: e.clientY - actual.y }
  }
  const moverArrastre = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!arrastre.current) return
    setPos(dentroDePantalla({ x: e.clientX - arrastre.current.dx, y: e.clientY - arrastre.current.dy }, ventana.current, ancho, extra))
  }
  const soltarArrastre = () => { arrastre.current = null }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={cambiar} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={ventana}
          onInteractOutside={e => e.preventDefault()}
          style={{
            ...(pos ? { left: pos.x, top: pos.y } : { left: `calc(50% - ${corrida}px)`, top: '50%', translate: '-50% -50%' }),
            width: `min(${ancho}px, calc(100vw - ${MARGEN * 2}px))`,
          }}
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
          {derecha && (
            <div style={{ width: ANCHO_DEL_COSTADO, left: `calc(100% + ${SEPARACION}px)` }}
              className="absolute top-0 max-h-[calc(100dvh-32px)] overflow-y-auto rounded-xl bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.18)] [border:1px_solid_var(--line-strong)]">
              {derecha}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
