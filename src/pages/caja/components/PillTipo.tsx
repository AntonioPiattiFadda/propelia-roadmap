import { cn } from '@/lib/utils'
import type { TipoGasto } from '../types'

export const ETIQUETA_DE_TIPO: Record<TipoGasto, string> = { FIXED: 'Fijo', VARIABLE: 'Variable' }

export function PillTipo({ tipo, className }: { tipo: TipoGasto; className?: string }) {
  return (
    <span className={cn(
      'inline-flex justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
      tipo === 'FIXED' ? 'bg-(--brand-soft) text-(--brand-700)' : 'bg-(--surface-3) text-(--fg-2)',
      className,
    )}>
      {ETIQUETA_DE_TIPO[tipo]}
    </span>
  )
}
