import { useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { Dialog, DialogDescription, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Un mail armado por su plantilla REAL: la misma función que usa el servidor al mandarlo. */
export type EmailRenderizado = { subject: string; html: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  subject: string
  from: string
  to: string
  /** El HTML del mail tal cual lo arma su plantilla real. */
  html: string
}

/* `EmailPreviewDialog` de propelia-frontend (4/11/2026, por pedido): la ventana de «así le llega el
   mail», con la cabecera de bandeja (asunto, de, para) y el HTML en un iframe sin scripts ni clics.
   Allá `DialogContent` acepta `overlayClassName`; acá `ui/dialog` es la copia sin eso, así que se arma
   con sus piezas: velo y contenido en z-[300], porque se abre encima del popover de la Agenda
   (z-index 250) y de las ventanas flotantes del CRM. */
export function EmailPreviewDialog({ open, onOpenChange, title, description, subject, from, to, html }: Props) {
  const [height, setHeight] = useState(640)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[300]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-[50%] left-[50%] z-[300] flex w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col gap-3 overflow-hidden rounded-lg border bg-white p-0 shadow-lg sm:max-w-180',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200',
          )}
        >
          <DialogHeader className="px-5 pt-5 pr-12">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="text-xs">{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-0.5 border-y border-border bg-card px-5 py-2.5 text-xs text-muted-foreground">
            <span className="truncate text-[13px] font-semibold text-foreground">{subject}</span>
            <span className="truncate">
              De: <span className="font-medium text-foreground">{from}</span>
            </span>
            <span className="truncate">Para: {to}</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {/* `allow-same-origin` deja medir el alto del contenido; sin scripts ni clics. */}
            <iframe
              title={title}
              srcDoc={html}
              sandbox="allow-same-origin"
              tabIndex={-1}
              onLoad={(e) => setHeight(e.currentTarget.contentDocument?.body.scrollHeight ?? 640)}
              className="pointer-events-none block w-full border-0"
              style={{ height }}
            />
          </div>
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <XIcon className="size-4" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

/**
 * El botón «Ver email» y su ventana, para todo flow que manda un mail con plantilla. `render` se
 * llama recién al abrir (es un string de plantilla, barato, pero no hace falta antes) y tiene que
 * ser la misma función que arma el mail en el servidor, nunca un HTML aparte.
 */
export function VerEmail({ render, title, description, from, to, label = 'Ver email', className }: {
  render: () => EmailRenderizado
  title: string
  description: ReactNode
  from: string
  to: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rendered = open ? render() : null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${title}`}
        className={cn('cursor-pointer font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none', className)}
      >
        {label}
      </button>
      {rendered && (
        <EmailPreviewDialog open={open} onOpenChange={setOpen} title={title} description={description}
          subject={rendered.subject} from={from} to={to} html={rendered.html} />
      )}
    </>
  )
}
