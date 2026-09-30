import { cn } from '@/lib/utils'

/**
 * Placeholder para un valor que todavía está cargando. Ocupa exactamente el alto
 * de una línea de texto para que rellenarlo no mueva el layout: sin esto la ficha
 * salta cuando llega el detalle.
 */
export function TextShimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-[1em] w-full max-w-[8rem] align-middle rounded animate-pulse bg-(--surface-2)',
        className,
      )}
    />
  )
}
