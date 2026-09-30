import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  onConfirm: () => void
  elementName?: string
  isPending?: boolean
  /** Para agrandar el objetivo de clic donde la fila lo permite (ver el funnel). */
  className?: string
}

/**
 * Tacho con confirmación inline anti-misclick: el primer click arma el botón
 * (fondo rojo pleno, ícono blanco), el segundo ejecuta. Sacar el hover, blur
 * o Escape lo desarman y vuelve al color original. Mismo patrón que
 * MarkManagedButton y CommentItem — ver docs/generalUiUx/confirmationInlinePattern.md.
 */
export function InlineDeleteButton({ onConfirm, elementName, isPending, className }: Props) {
  const [arming, setArming] = useState(false)

  return (
    <button
      type="button"
      onClick={() => {
        if (arming) {
          onConfirm()
          setArming(false)
        } else {
          setArming(true)
        }
      }}
      onMouseLeave={() => setArming(false)}
      onBlur={() => setArming(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setArming(false) }}
      disabled={isPending}
      aria-label={arming ? `Confirmar eliminación${elementName ? ` de "${elementName}"` : ''}` : `Eliminar${elementName ? ` "${elementName}"` : ''}`}
      className={cn(
        'size-5 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0',
        arming
          ? 'text-white [background:var(--danger)]'
          : 'bg-transparent text-[--danger] opacity-60 hover:opacity-100',
        className,
      )}
    >
      <Trash2 size={13} />
    </button>
  )
}
