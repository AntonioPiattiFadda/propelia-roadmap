import { cn } from '@/lib/utils'

/* La banderita de «Hora de España» (26/10/2026, por pedido). En SVG y no el emoji 🇪🇸: Windows no
   dibuja banderas y muestra las letras «ES». */
export function BanderaEspana({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 8" aria-hidden className={cn('inline-block h-[0.8em] w-auto shrink-0 rounded-[1.5px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)]', className)}>
      <rect width="12" height="8" fill="#AA151B" />
      <rect y="2" width="12" height="4" fill="#F1BF00" />
    </svg>
  )
}

/** «🇪🇸 Hora de España», con lo que se quiera agregar después. */
export function HoraDeEspana({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <BanderaEspana />
      Hora de España{children}
    </span>
  )
}
