import { Lock } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/**
 * Nota al pie de un campo que está deshabilitado por regla de negocio, no por permisos.
 *
 * Un campo gris sin explicación se lee como un bug. Éste dice POR QUÉ está congelado y
 * qué hacer si el valor está mal — la salida siempre existe, aunque no sea editar.
 */
export function LockedFieldNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-[11px] text-[--fg-muted] leading-snug', className)}>
      <Icon icon={Lock} size="xs" className="mt-0.5" />
      <span>{children}</span>
    </p>
  )
}
