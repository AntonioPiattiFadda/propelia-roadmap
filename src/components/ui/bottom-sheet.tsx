import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

/**
 * Hoja inferior: el patrón de "elegir entre opciones" en móvil.
 *
 * Es el par de la pantalla completa con pie fijo (formularios). La diferencia no es
 * estética: un formulario necesita toda la pantalla porque el teclado se come la mitad
 * de abajo, y una lista corta de opciones no — abrirla a pantalla completa hace perder
 * de vista el contexto desde el que se la abrió, que es justo lo que hay que recordar
 * para elegir bien.
 *
 * Sobre Radix Dialog y no sobre un div propio: trae el foco atrapado, el cierre con
 * Escape y el `aria-modal` ya resueltos.
 */
function BottomSheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="bottom-sheet" {...props} />
}

function BottomSheetTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="bottom-sheet-trigger" {...props} />
}

function BottomSheetContent({
  className,
  children,
  style,
  /** El tirador de 38×4 de arriba. Se apaga sólo donde la hoja no se puede arrastrar ni cerrar. */
  showHandle = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showHandle?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-[rgba(8,13,65,.45)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogPrimitive.Content
        data-slot="bottom-sheet-content"
        /* `bottom` y `max-height` salen de `--kb-inset` (ver useKeyboardInset): con el
           teclado abierto, una hoja pegada a `bottom: 0` queda dibujada DETRÁS de las
           teclas, y en una hoja de formulario —Nueva tarea, agregar barrio— lo que
           desaparece es justo el campo que se acaba de enfocar. Restando el alto del
           teclado la hoja se apoya sobre él.

           El colchón de abajo también depende: `safe-area-inset-bottom` es el gesto de
           inicio del iPhone, que no existe mientras el teclado lo tapa. */
        style={{
          bottom: 'var(--kb-inset, 0px)',
          maxHeight: 'calc(85dvh - var(--kb-inset, 0px))',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          ...style,
        }}
        className={cn(
          // Pegada abajo y a los dos bordes: el pulgar llega sin estirarse, que es la
          // razón de que este patrón exista.
          'fixed inset-x-0 z-50 flex flex-col overflow-hidden',
          'rounded-t-[20px] bg-card pt-2',
          'shadow-[0_-8px_32px_rgba(8,13,65,.18)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-200',
          className,
        )}
        {...props}
      >
        {showHandle && (
          <span aria-hidden className="mx-auto mb-3 block h-1 w-[38px] shrink-0 rounded-full bg-(--line)" />
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function BottomSheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="bottom-sheet-title"
      className={cn('px-[18px] pb-2 text-[17px] font-semibold leading-[1.3] text-foreground', className)}
      {...props}
    />
  )
}

function BottomSheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="bottom-sheet-description"
      className={cn('px-[18px] pb-2 text-[13.5px] leading-snug text-(--fg-2)', className)}
      {...props}
    />
  )
}

/**
 * Una fila de la hoja: 52px de alto, icono y etiqueta.
 *
 * 52 y no 44: acá las filas están pegadas una a otra sin separación, y el mínimo táctil
 * de 44 deja los bordes de dos objetivos distintos a un píxel de distancia.
 */
function BottomSheetItem({ className, tone = 'default', ...props }: React.ComponentProps<'button'> & {
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      data-slot="bottom-sheet-item"
      className={cn(
        'flex h-[52px] w-full cursor-pointer items-center gap-3 px-[18px] text-left text-[15.5px] font-medium',
        'transition-colors active:bg-(--surface-2) disabled:pointer-events-none disabled:opacity-45',
        tone === 'danger' ? '[color:var(--danger-strong)]' : 'text-foreground',
        className,
      )}
      {...props}
    />
  )
}

const BottomSheetClose = DialogPrimitive.Close

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetItem,
  BottomSheetClose,
}
