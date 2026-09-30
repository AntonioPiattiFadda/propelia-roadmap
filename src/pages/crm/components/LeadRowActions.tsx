import { useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DatePickerCalendar } from '@/components/ui/date-picker-calendar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useActualizarLead, useDescartar, useMarcarGestion } from '../hooks/useLeadMutaciones'
import { etapaDelLead } from '../lib/effectiveStage'
import { gestionDeLead } from '../lib/gestionStatus'
import { postponeEffectiveAt } from '../lib/postponeTime'
import type { CrmLeadRow } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/components/LeadRowActions.tsx) sin el segundo
   funnel, sin eliminar y sin la hoja inferior de móvil. Todo deshabilitado sin write sobre la
   cartera: la base lo rechazaría igual, pero un botón que falla al tocarlo enseña a desconfiar. */
export function LeadRowActions({ lead, puedeEscribir, onStartReassign, triggerClassName }: {
  lead: CrmLeadRow
  puedeEscribir: boolean
  /** Sin handler no se ofrece «Reasignar» (lo conecta la lista, Task 11). */
  onStartReassign?: (leadId: string) => void
  triggerClassName?: string
}) {
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const actualizar = useActualizarLead()
  const descartar = useDescartar()
  const marcar = useMarcarGestion(lead.id)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discardReason, setDiscardReason] = useState('')
  const [postponeOpen, setPostponeOpen] = useState(false)
  const [postponeDate, setPostponeDate] = useState<Date | null>(null)
  const [postponeNote, setPostponeNote] = useState('')

  const etapa = etapaDelLead(lead, etapasPorId)
  const yaDescartado = !!descartada && lead.funnel_stage_id === descartada.id
  const postponed = gestionDeLead(lead, etapa?.management_tolerance_hours).postponed
  // Las del funnel para elegir; Descartado se elige desde «Descartar», que pide el motivo.
  const enFunnel = etapasActivas.filter(e => !e.is_out_of_funnel)

  const closePostpone = () => { setPostponeOpen(false); setPostponeDate(null); setPostponeNote('') }
  const confirmPostpone = () => {
    if (!postponeDate) return
    marcar.mutate({ action: 'POSTPONED', effective_at: postponeEffectiveAt(postponeDate), note: postponeNote.trim() || null })
    closePostpone()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('size-8', triggerClassName)} aria-label="Acciones del lead">
            <Icon icon={EllipsisVertical} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!puedeEscribir || postponed || marcar.isPending} onSelect={() => setPostponeOpen(true)}>
            Posponer gestión
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!puedeEscribir}>Cambiar etapa</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={lead.funnel_stage_id ?? ''}
                onValueChange={id => actualizar.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null } })}
              >
                {enFunnel.map(e => (
                  <DropdownMenuRadioItem key={e.id} value={e.id} className="text-xs">
                    <span className="mr-1.5 size-[7px] rounded-full" style={{ background: e.priority?.color ?? 'var(--line-strong)' }} />
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
            disabled={!puedeEscribir || !descartada || yaDescartado || descartar.isPending}
            onSelect={() => { setDiscardReason(''); setConfirmDiscard(true) }}
          >
            Descartar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {postponeOpen && (
        <AlertDialog open onOpenChange={next => next ? setPostponeOpen(true) : closePostpone()}>
          <AlertDialogContent className="w-auto max-w-fit">
            <AlertDialogHeader>
              <AlertDialogTitle>Posponer gestión</AlertDialogTitle>
              <AlertDialogDescription>
                El lead queda como gestionado hasta la fecha elegida; ahí arranca de nuevo el contador.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <DatePickerCalendar selected={postponeDate ?? undefined} onSelect={setPostponeDate} disabled={{ before: new Date() }} />
            <Textarea value={postponeNote} onChange={e => setPostponeNote(e.target.value)} placeholder="Nota (opcional)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPostpone} disabled={!postponeDate || marcar.isPending}>Posponer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {confirmDiscard && descartada && (
        <AlertDialog open onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Descartar este lead?</AlertDialogTitle>
              <AlertDialogDescription>
                Pasa a «{descartada.label}». El motivo queda en el lead y en su actividad.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea value={discardReason} onChange={e => setDiscardReason(e.target.value)} placeholder="Motivo (opcional)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => descartar.mutate({ leadId: lead.id, etapaId: descartada.id, motivo: discardReason.trim() || null })}
              >
                Descartar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
