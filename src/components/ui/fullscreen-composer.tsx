import { useEffect, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Escribir en el móvil, a pantalla completa y con el texto arriba.
 *
 * El problema: un campo que vive al pie de una ficha —el composer de actividad, la nota
 * del cliente— queda justo donde aparece el teclado. Aunque la ventana descuente
 * `--kb-inset` y no lo tape, al agente le queda un renglón de dos líneas para escribir,
 * con el hilo entero comprimido arriba. Y en iOS, si el tipo se renderiza por debajo de
 * 16px, encima entra el auto-zoom y la pantalla queda corrida.
 *
 * La solución es la que usan las apps de mensajería cuando el texto es largo: al tocar el
 * campo, la escritura se lleva TODA la pantalla. El texto arranca pegado al borde de
 * arriba y crece hacia abajo, así lo escrito queda lo más lejos posible de las teclas.
 *
 * Por qué un diálogo de Radix y no un `div` con `position: fixed` puesto donde estaba el
 * campo: esto se abre DENTRO de la ventana del lead, que ya es un diálogo con trampa de
 * foco. Un nodo suelto fuera de ese árbol pierde el foco apenas lo recibe. Anidando
 * diálogos, Radix pasa la trampa al de adentro y además lo saca por un portal a `body`:
 * afuera de `.ui-scale`, así que acá los píxeles son píxeles —los 16px son 16px de
 * verdad, no 14,4— y `position: fixed` se mide contra la pantalla y no contra la ventana
 * del lead, que ya viene achicada por el teclado.
 *
 * `bottom` sale de `--kb-inset` (ver useKeyboardInset): es lo único que hace falta para
 * apoyar la caja sobre el teclado en vez de dejarla debajo.
 */
export function FullscreenComposer({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  onSubmit,
  submitLabel = 'Guardar',
  placeholder,
  pending = false,
  /** Con `true`, el botón de guardar se apaga mientras no haya texto. */
  requireText = true,
  /** Tope de caracteres del campo; pasado el tope el botón de guardar se apaga. */
  maxLength,
  /**
   * Controles extra —fecha, repetición, grupo— anclados arriba, justo debajo de la
   * cabecera. Van ahí y no contra el teclado porque abajo compiten con el predictivo y
   * con la barra de gestos: al abrirse un desplegable, el panel salía por encima de lo
   * escrito. Arriba quedan siempre a la vista, en el mismo bloque que el título.
   */
  toolbar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  submitLabel?: string
  placeholder?: string
  pending?: boolean
  requireText?: boolean
  maxLength?: number
  toolbar?: React.ReactNode
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /* Red de seguridad para iOS: aun con el campo a la vista, al subir el teclado Safari
     puede correr la página unos píxeles. Esta pantalla ocupa todo lo visible, así que
     cualquier scroll mientras está abierta sobra: se devuelve a donde estaba al abrir,
     sin mover la página de atrás. */
  useEffect(() => {
    if (!open) return
    const y = window.scrollY
    const undoScroll = () => {
      if (window.scrollY !== y) window.scrollTo(0, y)
    }
    const viewport = window.visualViewport
    window.addEventListener('scroll', undoScroll)
    viewport?.addEventListener('scroll', undoScroll)
    viewport?.addEventListener('resize', undoScroll)
    return () => {
      window.removeEventListener('scroll', undoScroll)
      viewport?.removeEventListener('scroll', undoScroll)
      viewport?.removeEventListener('resize', undoScroll)
    }
  }, [open])

  // Con `maxLength`, pasado del tope tampoco se guarda: el tope ya lo pone el textarea,
  // esto cubre un `value` que llegue largo desde afuera.
  const withinLimit = maxLength === undefined || value.length <= maxLength
  const canSubmit = !pending && withinLimit && (!requireText || value.trim().length > 0)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          /* `top: --vv-top` + `bottom: --kb-inset`: la caja va del borde de arriba de lo
             visible al filo del teclado. `top` no puede ser 0: iOS corre la pantalla al
             enfocar el textarea y la cabecera (Cancelar / Enviar) quedaba fuera de vista.
             Sin alto fijo, así sigue al teclado cuando cambia de tamaño —el predictivo,
             un emoji picker— sin que haya que recalcular nada. */
          style={{ top: 'var(--vv-top, 0px)', bottom: 'var(--kb-inset, 0px)' }}
          /* Fundido y no deslizamiento desde abajo: el foco entra en el mismo instante en
             que se monta, y con `slide-in-from-bottom` el textarea está todavía corrido
             fuera de la pantalla. iOS scrollea la página para mostrarlo y, cuando la
             animación termina, la cabecera queda por encima de lo visible. */
          className={cn(
            'fixed inset-x-0 z-60 flex flex-col bg-card',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 duration-150',
          )}
          /* El foco va al textarea y no al primer botón: el teclado tiene que abrirse solo,
             si no el agente toca el campo, se le abre una pantalla y tiene que volver a
             tocar para escribir. El cursor al final para poder seguir un borrador.
             `preventScroll`: el campo ya está a la vista, no hay nada que scrollear. */
          onOpenAutoFocus={e => {
            e.preventDefault()
            const el = textareaRef.current
            if (!el) return
            el.focus({ preventScroll: true })
            el.setSelectionRange(el.value.length, el.value.length)
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

          {/* Cabecera fija arriba: cancelar a la izquierda y la acción a la derecha, que es
              donde el pulgar las busca. El título en el medio dice qué se está escribiendo,
              porque la pantalla tapó el contexto que lo decía. */}
          <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 [border-bottom:1px_solid_var(--line)]">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                Cancelar
              </Button>
            </DialogPrimitive.Close>
            <span className="truncate text-[13px] font-semibold text-foreground">{title}</span>
            <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
              {submitLabel}
            </Button>
          </div>

          {/* Los controles van pegados a la cabecera: lo elegido (fecha, grupo,
              repetición) se lee de un vistazo junto al título, y los desplegables se
              abren hacia abajo sobre espacio vacío en vez de taparle el texto al que
              está escribiendo. */}
          {toolbar && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 py-2 [border-bottom:1px_solid_var(--line)]">
              {toolbar}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={pending}
            /* `flex-1` y no un alto calculado: el textarea se queda con todo lo que sobra
               abajo de la cabecera. El texto de un textarea arranca arriba, así que lo
               escrito aparece pegado al borde superior, que es de lo que se trata.

               El tipo no se declara acá: la regla global de index.css le pone el piso de
               16px que evita el auto-zoom de iOS. */
            className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 leading-relaxed text-foreground outline-none placeholder:text-(--fg-faint) disabled:opacity-60"
            /* Con teclado abierto el área segura de abajo no existe —el gesto del iPhone
               queda tapado por las teclas—, pero cuando se cierra sí: por eso el colchón
               es un `max` y no un número fijo. */
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
