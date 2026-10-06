/**
 * Celdas del renglón de lead. Copiado de propelia-frontend (src/pages/leads/components/leadCells.tsx)
 * sin lo inmobiliario (BriefingCell). Viven aparte de la lista porque el dialog del lead usa las
 * mismas (etapa y gestión se leen igual en los dos lados).
 */
import { useState } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DatePickerCalendar } from '@/components/ui/date-picker-calendar'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { gestionDeLead, type GestionStatus } from '../lib/gestionStatus'
import { fmtDueDate } from '../lib/leadCellFormat'
import { postponeEffectiveAt } from '../lib/postponeTime'
import { useMarcarGestion } from '../hooks/useLeadMutaciones'
import type { CrmLeadRow, CrmTask, EtapaConPrioridad } from '../types'

export type OverdueTask = Pick<CrmTask, 'id' | 'title' | 'due_date'>

/** La etapa con el color de su prioridad: la prioridad cuelga de la etapa (`crm_leads` no tiene propia). */
export function StageBadge({ etapa, className }: { etapa: EtapaConPrioridad | null; className?: string }) {
  if (!etapa) return <span className="text-xs text-(--fg-faint)">Sin etapa</span>
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 text-[11px] font-semibold py-[3px] px-[9px] bg-(--surface-3) text-foreground [border:0.5px_solid_var(--line)]', className)}
      title={etapa.priority ? `Prioridad: ${etapa.priority.name}` : 'Sin prioridad'}
    >
      <span aria-hidden className="size-[7px] rounded-full" style={{ background: etapa.priority?.color ?? 'var(--line-strong)' }} />
      {etapa.label}
    </Badge>
  )
}

export function GestionBadge({ status, onConfirm, pending }: {
  status: GestionStatus
  onConfirm: () => void
  pending: boolean
}) {
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
      onKeyDown={e => { if (e.key === 'Escape') setArming(false) }}
      disabled={pending}
      aria-label={arming ? 'Confirmar gestión' : 'Marcar como gestionado'}
      className={cn(
        // Mismo pill semántico que el resto de los badges de estado de la app
        badgeVariants({ variant: status.variant === 'green' ? 'success' : 'danger' }),
        'transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
        arming && 'bg-success text-white',
      )}
    >
      {status.label}
    </button>
  )
}

export function PostponePopover({ onPostpone, pending, postponed, trigger, tooltipLabel = 'Posponer' }: {
  onPostpone: (effectiveAt: string, note?: string) => void
  pending: boolean
  postponed: boolean
  /** Disparador alternativo — el composer de Actividad usa un botón redondo propio. */
  trigger?: React.ReactElement
  tooltipLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<Date | null>(null)
  const [note, setNote] = useState('')

  const close = () => {
    setOpen(false)
    setDate(null)
    setNote('')
  }

  const confirm = () => {
    if (!date) return
    const effectiveAt = postponeEffectiveAt(date)
    onPostpone(effectiveAt, note.trim() || undefined)
    close()
  }

  // Ya pospuesto: no ofrecemos el control (el reloj ya lo refleja el badge de gestión).
  if (postponed) return null

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setOpen(true)
        else close()
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {trigger ?? (
              <button
                type="button"
                aria-label="Posponer gestión"
                className="inline-flex items-center justify-center p-1 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shrink-0"
              >
                <Icon icon={Clock} size="xs" />
              </button>
            )}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltipLabel}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-auto p-0">
        <p className="text-xs font-medium text-foreground px-3 pt-3">Marcar gestionado hasta…</p>
        <DatePickerCalendar
          selected={date ?? undefined}
          onSelect={setDate}
          disabled={{ before: new Date() }}
        />
        <div className="border-t px-3 py-2 space-y-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Nota (opcional)"
            className="w-full text-xs px-2 py-1 rounded-md [border:1px_solid_var(--line)] bg-card text-foreground font-[inherit] resize-none outline-none placeholder:text-(--fg-faint)"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="text-[11px] px-2.5 py-1 rounded-md [border:1px_solid_var(--line)] bg-secondary text-secondary-foreground cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!date || pending}
              className="text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Posponer
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Ícono de agenda del lead: rojo si hay tareas vencidas (tooltip con la lista), verde si no.
export function AgendaIcon({ overdueTasks }: { overdueTasks: OverdueTask[] }) {
  const icon = (
    <Icon
      icon={Calendar}
      size="sm"
      className={overdueTasks.length > 0 ? 'text-danger' : 'text-success'}
    />
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help shrink-0">{icon}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {overdueTasks.length === 0 ? (
          'Agenda'
        ) : (
          <div className="flex flex-col gap-px">
            {overdueTasks.map(t => (
              <span key={t.id}>{t.due_date ? `${fmtDueDate(t.due_date)} — ` : ''}{t.title}</span>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// En la lista va el badge solo: el reloj de posponer y la agenda se sacaron por pedido (6/10/2026).
// Que hay tareas vencidas lo dice el filtro «Tareas vencidas», que se pone rojo.
export function GestionCell({ lead, toleranceHours, puedeEscribir, now }: {
  lead: CrmLeadRow
  toleranceHours: number | null | undefined
  /** Sin write sobre la cartera el badge se ve pero no se toca: la base lo rechazaría igual. */
  puedeEscribir: boolean
  now: number
}) {
  const mark = useMarcarGestion(lead.id)
  const status: GestionStatus = gestionDeLead(lead, toleranceHours, now)
  return (
    <div className="flex items-center gap-1" data-row-actions>
      <GestionBadge status={status} onConfirm={() => mark.mutate({ action: 'MANUAL' })} pending={mark.isPending || !puedeEscribir} />
    </div>
  )
}
