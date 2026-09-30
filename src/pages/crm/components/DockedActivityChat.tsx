import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
/* Dependencia transitiva de @radix-ui/react-dialog y react-popover (misma versión, 1.1.9,
   una sola copia en node_modules). Hace falta ESA copia: la pila de scopes que pausa la
   trampa de foco del diálogo es estado de módulo. */
import { FocusScope } from '@radix-ui/react-focus-scope'
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/**
 * Dónde estaba el chat de la columna en el instante en que se dejó la pestaña «Cliente».
 * La ventana acoplada sale de ahí («se traslada»). Lleva la hora para no animar desde un
 * rectángulo viejo: si pasó más que un instante, ya no hay traslado que mostrar.
 */
export type ChatOrigin = { rect: DOMRect; at: number }

const ORIGIN_MAX_AGE_MS = 600
const FLIP_MS = 420

/**
 * Envuelve el chat de la columna y, al desmontarse (se dejó «Cliente»), avisa dónde
 * estaba. El cleanup de un layout effect corre con el DOM todavía en su lugar, así que
 * el rectángulo es el real.
 */
export function ColumnChatSlot({ onLeave, className, children }: {
  /* Debe ser estable (useCallback): si cambia, el cleanup corre y registra un origen de más. */
  onLeave: (origin: ChatOrigin) => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => () => {
    const el = ref.current
    if (!el || !el.isConnected) return
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) onLeave({ rect, at: performance.now() })
  }, [onLeave])

  return <div ref={ref} className={className}>{children}</div>
}

/**
 * El chat de actividad acoplado abajo a la derecha de la PANTALLA, al estilo de los chats
 * de LinkedIn: ocupa el hueco libre fuera de la ventana del lead. Aparece en las pestañas
 * que no muestran la columna de actividad.
 *
 * Por qué va porteado al `body` y no adentro del `DialogContent`: ése lleva `translate`
 * (centrado), así que es el bloque contenedor de cualquier hijo `fixed`, y además recorta
 * con `overflow` (LeadList y compañía le ponen `overflow-hidden`/`auto`). Adentro no hay
 * forma de llegar al borde de la pantalla.
 *
 * Porteado, el diálogo modal de Radix se defiende de tres maneras, y cada una tiene su
 * respuesta acá:
 *  - `body { pointer-events: none }` (DismissableLayer): el contenedor declara `auto`.
 *    Los clicks NO cuentan como «afuera» porque DismissableLayer lo decide por el árbol
 *    de React (onPointerDownCapture), y el portal sigue siendo hijo de la ficha.
 *  - La trampa de foco (FocusScope, trapped) mira el DOM, no el árbol de React: al
 *    enfocar el textarea lo devolvería a la ficha. Al primer toque en la ventanita se monta
 *    un FocusScope propio y vacío, que al entrar en la pila de scopes PAUSA el del diálogo
 *    (lo mismo que hace un Popover al abrirse). Se desmonta con la ventanita y el diálogo
 *    se reanuda.
 *  - RemoveScroll cancela la rueda en `document` para todo lo que no sea el contenido del
 *    diálogo: el contenedor frena la propagación del `wheel` antes de que llegue ahí, sin
 *    `preventDefault`, así que la lista de mensajes scrollea normal.
 *
 * z-[55]: por encima del diálogo y su velo (z-50), por debajo de los popovers (9999, ver
 * popover.tsx) —el de Posponer se abre encima de la ventanita— y del SuggestionTray (60).
 */
export function DockedActivityChat({ title, getOrigin, children }: {
  title: string
  /* Se lee en el layout effect de montaje: el cleanup de `ColumnChatSlot` corre en el
     mismo commit, DESPUÉS del render, así que una prop con el valor ya llegaría tarde. */
  getOrigin: () => ChatOrigin | null
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const getOriginRef = useRef(getOrigin)
  /* Plegada o abierta vive acá: la ventanita sigue montada al saltar de un piso a otro, así
     que se recuerda, y se vuelve a montar —abierta— cada vez que se llega desde una
     pestaña sin ella. */
  const [collapsed, setCollapsed] = useState(false)
  const [focusEngaged, setFocusEngaged] = useState(false)
  const [container] = useState(() => {
    const el = document.createElement('div')
    el.dataset.dockedActivityChat = ''
    el.style.pointerEvents = 'auto'
    return el
  })

  // Tiene que ir ANTES del efecto del traslado: ése mide la ventanita, y con el contenedor
  // todavía fuera del documento mediría cero.
  useLayoutEffect(() => {
    document.body.appendChild(container)
    const stopWheel = (e: Event) => e.stopPropagation()
    container.addEventListener('wheel', stopWheel)
    return () => {
      container.removeEventListener('wheel', stopWheel)
      container.remove()
    }
  }, [container])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // El origen se consume una sola vez, al montar: volver a animar al plegar o al saltar
    // de un piso a otro sería repetir un traslado que ya pasó.
    const from = getOriginRef.current()
    const fresh = from && performance.now() - from.at < ORIGIN_MAX_AGE_MS

    if (reduceMotion) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
      return
    }

    if (!fresh) {
      el.animate(
        [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'ease-out' },
      )
      return
    }

    const to = el.getBoundingClientRect()
    if (to.width === 0 || to.height === 0) return
    /* `.ui-scale` aplica `zoom`: el rectángulo viene en píxeles de pantalla, pero el
       `transform` se aplica en píxeles CSS del elemento. El ancho computado está en CSS,
       así que el cociente es el zoom efectivo. */
    const cssWidth = parseFloat(getComputedStyle(el).width) || to.width
    const zoom = to.width / cssWidth || 1
    const dx = (from.rect.left - to.left) / zoom
    const dy = (from.rect.top - to.top) / zoom
    const sx = from.rect.width / to.width
    const sy = from.rect.height / to.height

    el.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.55, borderRadius: '0px' },
        { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      ],
      { duration: FLIP_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [])

  /* `flushSync`: el scope tiene que estar en la pila ANTES de que el mousedown mueva el
     foco; si no, la trampa del diálogo ya lo devolvió a la ficha. */
  const engageFocus = () => {
    if (!focusEngaged) flushSync(() => setFocusEngaged(true))
  }

  const toggle = () => setCollapsed(c => !c)

  return createPortal(
    <>
      {focusEngaged && (
        <FocusScope
          hidden
          onMountAutoFocus={e => e.preventDefault()}
          onUnmountAutoFocus={e => e.preventDefault()}
        />
      )}
      <div
        ref={ref}
        role="region"
        aria-label={title}
        onPointerDownCapture={engageFocus}
        onFocusCapture={engageFocus}
        className="ui-scale fixed bottom-0 right-4 z-[55] flex w-[340px] flex-col overflow-hidden rounded-t-xl bg-card shadow-lg [border:1px_solid_var(--line-strong)] [border-bottom:none] max-md:hidden"
      >
        {/* La cabecera entera pliega y despliega, como en LinkedIn; el chevron es el mismo
            gesto con un blanco explícito. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          onClick={toggle}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
          className="flex h-11 shrink-0 cursor-pointer select-none items-center gap-2 px-3 transition-colors hover:bg-(--surface-2) focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--brand-soft)] [border-bottom:1px_solid_var(--line-soft)]"
        >
          <Icon icon={MessageSquare} size="sm" className="shrink-0 text-(--fg-muted)" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-none text-foreground">
            {title}
          </span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); toggle() }}
            aria-label={collapsed ? 'Abrir chat' : 'Plegar chat'}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-(--surface-2) hover:text-foreground"
          >
            <Icon icon={collapsed ? ChevronUp : ChevronDown} size="xs" />
          </button>
        </div>

        {/* Plegar anima el alto con el truco de `grid-template-rows` 0fr ↔ 1fr: el cuerpo
            tiene un alto fijo adentro y la fila lo recorta. */}
        <div className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}>
          <div className="min-h-0 overflow-hidden" inert={collapsed}>
            <div className="flex h-[420px] flex-col">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>,
    container,
  )
}
