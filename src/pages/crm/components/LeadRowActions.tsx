import { useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCarteras } from '../hooks/useCarteras'
import { useActualizarLead, useEliminarLead } from '../hooks/useLeadMutaciones'
import type { CrmLeadRow } from '../types'
import { DescartarLeadDialog } from './DescartarLeadDialog'

/* Copiado de propelia-frontend (src/pages/leads/components/LeadRowActions.tsx) sin el segundo
   funnel y sin la hoja inferior de móvil; sin «Posponer gestión» desde el 10/10/2026
   (la gestión se sacó del front para rediseñarla). Todo deshabilitado sin write sobre la
   cartera: la base lo rechazaría igual, pero un botón que falla al tocarlo enseña a desconfiar. */
export function LeadRowActions({ lead, puedeEscribir, onStartReassign, triggerClassName }: {
  lead: CrmLeadRow
  puedeEscribir: boolean
  /** Sin handler no se ofrece «Reasignar» (lo conecta la lista, Task 11). */
  onStartReassign?: (leadId: string) => void
  triggerClassName?: string
}) {
  const { etapasActivas, descartada } = useCrmCatalogos()
  const actualizar = useActualizarLead()
  const eliminar = useEliminarLead()
  // Eliminar es solo del SUPERADMIN (23/10/2026, por pedido): directo, sin confirmar, con «Deshacer».
  const { esSuperadmin } = useCarteras()
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const yaDescartado = !!descartada && lead.funnel_stage_id === descartada.id
  // Las del funnel para elegir; Descartado se elige desde «Descartar», que pide el motivo.
  const enFunnel = etapasActivas.filter(e => !e.is_out_of_funnel)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('size-8', triggerClassName)} aria-label="Acciones del lead">
            <Icon icon={EllipsisVertical} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!puedeEscribir}>Cambiar estado</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={lead.funnel_stage_id ?? ''}
                onValueChange={id => actualizar.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null, recontact_at: null } })}
              >
                {enFunnel.map(e => (
                  <DropdownMenuRadioItem key={e.id} value={e.id} className="text-xs">
                    {e.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {onStartReassign && (
            <DropdownMenuItem disabled={!puedeEscribir} onSelect={() => onStartReassign(lead.id)}>Reasignar</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!puedeEscribir || !descartada || yaDescartado}
            onSelect={() => setConfirmDiscard(true)}
          >
            Descartar
          </DropdownMenuItem>
          {esSuperadmin && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => eliminar.mutate(lead.id)}>
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {confirmDiscard && descartada && (
        <DescartarLeadDialog leadId={lead.id} etapa={descartada} onClose={() => setConfirmDiscard(false)} />
      )}
    </>
  )
}
