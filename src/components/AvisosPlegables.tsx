import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useSonner } from 'sonner'
import { Bell, ChevronDown } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

/* Los avisos van abajo a la derecha y se pliegan (12/11/2026, por pedido). Del 4/11 estuvieron
   arriba a la derecha porque las alarmas de tareas no se van solas y abajo tapaban botones como
   «Enviar email» de Mensajes; arriba tapaban la cabecera del CRM. Plegados resuelven las dos cosas:
   quedan en una pastilla con el número, que se arrastra a donde no moleste y que al tocarla los
   vuelve a mostrar. Plegar no los cierra: cada uno se sigue cerrando con su cruz.
   El plegado es de la sesión; dónde quedó la pastilla, del navegador. */

const CLAVE_POSICION = 'avisos-pastilla-posicion'
const ANCHO_PASTILLA = 130
const ALTO_PASTILLA = 36
type Posicion = { x: number; y: number }

function leerPosicion(): Posicion | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_POSICION) ?? 'null') as unknown
    if (p && typeof p === 'object' && typeof (p as Posicion).x === 'number' && typeof (p as Posicion).y === 'number') return p as Posicion
  } catch { /* sin storage: va en su lugar de fábrica */ }
  return null
}
function guardarPosicion(p: Posicion) {
  try { localStorage.setItem(CLAVE_POSICION, JSON.stringify(p)) } catch { /* idem */ }
}
/** Que la pastilla no quede afuera de la pantalla (otra ventana más chica, otro monitor). */
function dentro(p: Posicion, ancho: number, alto: number): Posicion {
  return {
    x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - ancho - 8)),
    y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - alto - 8)),
  }
}

const BOTON = 'pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-card px-3 text-[12px] font-semibold text-foreground shadow-md [border:1px_solid_var(--line)] hover:bg-(--surface-2)'

export function AvisosPlegables() {
  const { toasts } = useSonner()
  const cuantos = toasts.length
  const [plegado, setPlegado] = useState(false)
  const [posicion, setPosicion] = useState<Posicion | null>(leerPosicion)
  const arrastre = useRef<{ dx: number; dy: number; x0: number; y0: number; movio: boolean } | null>(null)

  useEffect(() => {
    document.documentElement.toggleAttribute('data-avisos-plegados', plegado)
    return () => document.documentElement.removeAttribute('data-avisos-plegados')
  }, [plegado])

  const alApretar = (e: PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    arrastre.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, movio: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const alMover = (e: PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current
    if (!a) return
    if (!a.movio && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 4) return
    a.movio = true
    const r = e.currentTarget.getBoundingClientRect()
    setPosicion(dentro({ x: e.clientX - a.dx, y: e.clientY - a.dy }, r.width, r.height))
  }
  const alSoltar = () => {
    const a = arrastre.current
    arrastre.current = null
    if (!a) return
    // Un toque sin arrastrar despliega; un arrastre deja la pastilla donde quedó.
    if (!a.movio) setPlegado(false)
    else if (posicion) guardarPosicion(posicion)
  }

  // Si la ventana se achicó, la pastilla guardada vuelve adentro (con su tamaño aproximado).
  const visible = posicion && dentro(posicion, ANCHO_PASTILLA, ALTO_PASTILLA)

  return (
    <>
      <style>{'html[data-avisos-plegados] [data-sonner-toaster]{display:none!important}'}</style>
      <Toaster position="bottom-right" offset={{ bottom: 60, right: 24 }} mobileOffset={{ bottom: 60, right: 16 }} />
      {cuantos > 0 && !plegado && (
        <div className="no-print fixed bottom-4 right-6 z-[1000000] max-md:right-4">
          <button type="button" onClick={() => setPlegado(true)} className={`${BOTON} h-8`}
            title="Plegar los avisos: quedan en una pastilla que se puede arrastrar">
            <ChevronDown size={14} />Plegar avisos
          </button>
        </div>
      )}
      {cuantos > 0 && plegado && (
        <button type="button"
          onPointerDown={alApretar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={() => { arrastre.current = null }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlegado(false) } }}
          aria-label={`${cuantos} ${cuantos === 1 ? 'aviso plegado' : 'avisos plegados'}: tocá para verlos`}
          title="Tocá para ver los avisos · arrastrá para moverla"
          style={visible ? { left: visible.x, top: visible.y } : undefined}
          className={`${BOTON} no-print fixed z-[1000000] h-9 touch-none select-none active:cursor-grabbing ${visible ? '' : 'bottom-4 right-6 max-md:right-4'}`}>
          <Bell size={14} />
          {cuantos === 1 ? '1 aviso' : `${cuantos} avisos`}
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">{cuantos}</span>
        </button>
      )}
    </>
  )
}
