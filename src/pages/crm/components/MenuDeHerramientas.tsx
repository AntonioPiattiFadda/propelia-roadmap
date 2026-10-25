import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon, WrenchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/* El desplegable de la cabecera del CRM (23/10/2026, por pedido): Planning, Playbook, Ver como y lo
   de SUPERADMIN. No es un `DropdownMenu` a propósito: cada botón de adentro es el disparador de su
   propio dialog, y un menú de Radix desmonta su contenido al cerrarse, que se llevaría el dialog
   recién abierto. Acá el panel se esconde (`hidden`) pero sigue montado. */
export function MenuDeHerramientas({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const alTocar = (e: PointerEvent) => {
      const el = e.target as Element | null
      if (!el || raiz.current?.contains(el)) return
      // Lo que se abre desde adentro (el menú de «Ver como», un dialog) vive en un portal: tocarlo
      // no es tocar afuera, y esconder el panel dejaría al menú sin su ancla.
      if (el.closest('[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"]')) return
      setAbierto(false)
    }
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', alTocar)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('pointerdown', alTocar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  // Abrir un dialog cierra el panel: el dialog queda montado porque el panel solo se esconde.
  const alClic = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[aria-haspopup="dialog"]')) setAbierto(false)
  }

  return (
    <div ref={raiz} className="relative">
      <Button variant="outline" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
        <Icon icon={WrenchIcon} size="xs" />
        <span className="hidden md:inline">Herramientas</span>
        <Icon icon={ChevronDownIcon} size="xs" className={cn('transition-transform', abierto && 'rotate-180')} />
      </Button>
      <div
        onClick={alClic}
        className={cn(
          'absolute right-0 top-full z-50 mt-1 flex min-w-48 flex-col gap-0.5 rounded-md border bg-popover p-1 shadow-md',
          // Los botones de adentro son los de la cabecera: a lo ancho, alineados y con su rótulo
          // también en el teléfono (afuera lo escondían para ahorrar lugar).
          '[&_button]:w-full [&_button]:justify-start [&_span.hidden]:inline',
          !abierto && 'hidden',
        )}
      >
        {children}
      </div>
    </div>
  )
}
