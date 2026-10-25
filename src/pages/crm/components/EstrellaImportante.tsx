import { Star } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useActualizarLead } from '../hooks/useLeadMutaciones'
import type { CrmLeadRow } from '../types'

/* La estrella de «importante» (23/10/2026, por pedido): marca los leads que van al resumen de /crm.
   Solo la dibuja quien puede marcar (`puedeMarcarImportante`, SUPERADMIN): un SDR no ve ni la
   columna. Es del equipo: lo que marca uno lo ven todos los SUPERADMIN. Optimista con vuelta atrás
   y aviso (`useActualizarLead`); sin la migración corrida, el aviso es FALTA_MIGRACION. */
export function EstrellaImportante({ lead, className }: { lead: Pick<CrmLeadRow, 'id' | 'importante'>; className?: string }) {
  const actualizar = useActualizarLead()
  const marcado = lead.importante === true
  return (
    <button
      type="button"
      aria-pressed={marcado}
      title={marcado ? 'Importante: está en el resumen. Tocá para sacarlo.' : 'Marcar como importante (va al resumen)'}
      aria-label={marcado ? 'Quitar de importantes' : 'Marcar como importante'}
      onClick={e => {
        e.stopPropagation()
        actualizar.mutate({ id: lead.id, patch: { importante: !marcado } })
      }}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary',
        'outline-none focus-visible:ring-2 focus-visible:ring-(--brand-200)',
        marcado ? 'text-(--warning-fg)' : 'text-(--fg-faint) hover:text-(--fg-2)',
        className,
      )}
    >
      <Icon icon={Star} size="sm" className={cn(marcado && 'fill-current')} />
    </button>
  )
}
