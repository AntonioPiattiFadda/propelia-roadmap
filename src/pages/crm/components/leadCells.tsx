/**
 * Celdas del renglón de lead. Copiado de propelia-frontend (src/pages/leads/components/leadCells.tsx)
 * sin lo inmobiliario (BriefingCell). Viven aparte de la lista porque el dialog del lead usa las
 * mismas (la etapa se lee igual en los dos lados). La celda de gestión, su badge y el «Posponer»
 * se sacaron el 10/10/2026, junto con el color de prioridad de la etapa: se van a rediseñar.
 */
import { Calendar } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fmtDueDate } from '../lib/leadCellFormat'
import type { CrmStage, CrmTask } from '../types'

export type OverdueTask = Pick<CrmTask, 'id' | 'title' | 'due_date'>

export function StageBadge({ etapa, className }: { etapa: CrmStage | null; className?: string }) {
  if (!etapa) return <span className="text-xs text-(--fg-faint)">Sin estado</span>
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 text-[11px] font-semibold py-[3px] px-[9px] bg-(--surface-3) text-foreground [border:0.5px_solid_var(--line)]', className)}
    >
      {etapa.label}
    </Badge>
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
