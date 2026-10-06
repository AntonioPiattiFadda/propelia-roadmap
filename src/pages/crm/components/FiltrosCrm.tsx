import { ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { LeadListCounters } from '../lib/computeLeadListCounters'
import { PRIORITY_NONE, type LeadFilterState } from '../lib/leadFilters'
import type { CrmPriority, EtapaConPrioridad } from '../types'

const chip = (activo: boolean) => cn(
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
  activo
    ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)

/**
 * Buscador y chips. Todo vive en la URL (lo escribe `escribirFiltros`): la
 * lista, un enlace de Equipo y el botón «atrás» dicen lo mismo. Cada número es «cuántos quedarían
 * si prendo esto», de `computeLeadListCounters`.
 */
export function FiltrosCrm({ filtros, contadores, etapas, prioridades, onCambiar, onLimpiar }: {
  filtros: LeadFilterState
  contadores: LeadListCounters
  etapas: EtapaConPrioridad[]
  prioridades: CrmPriority[]
  onCambiar: (patch: Partial<LeadFilterState>) => void
  onLimpiar: () => void
}) {
  /* El filtro de gestión no tiene más control acá (las pestañas Todos / Pendientes / Al día /
     Pospuestos se sacaron por pedido), pero sigue viviendo en la URL: un enlace de Equipo lo trae
     puesto. Por eso cuenta para «Limpiar filtros», que es la única forma de sacarlo. */
  const hayFiltros = filtros.q.trim() !== '' || filtros.stageFilter.size > 0 || filtros.gestionExcluded.size > 0
    || filtros.overdueOnly || filtros.includeDiscarded || filtros.excludedPriorities.size > 0

  const alternar = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  return (
    // Un solo renglón: el buscador y a su derecha los filtros. Si no entran, bajan solos.
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 max-md:px-2">
        <span className="relative mr-0.5 block w-72 max-md:w-full">
          <Icon icon={Search} size="sm" className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-(--fg-muted)" />
          <input
            type="text"
            value={filtros.q}
            onChange={e => onCambiar({ q: e.target.value })}
            placeholder="Buscar por empresa, contacto, teléfono o email…"
            aria-label="Buscar por empresa, contacto, teléfono o email"
            // 16px en el teléfono: abajo de eso el navegador hace zoom al tocar el campo.
            className="h-9 w-full rounded-lg bg-(--surface) pl-[32px] pr-3 text-[13px] text-foreground outline-none transition-colors [border:1px_solid_var(--line-strong)] placeholder:text-(--fg-muted) focus:[border-color:var(--brand)] max-md:text-[16px]"
          />
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chip(filtros.stageFilter.size > 0)}>
              Etapa{filtros.stageFilter.size > 0 && ` (${filtros.stageFilter.size})`}
              <Icon icon={ChevronDown} size="xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {etapas.map(e => (
              <DropdownMenuCheckboxItem
                key={e.id}
                className="text-xs"
                checked={filtros.stageFilter.has(e.id)}
                onSelect={ev => ev.preventDefault()}
                onCheckedChange={() => onCambiar({ stageFilter: alternar(filtros.stageFilter, e.id) })}
              >
                <span className="size-[7px] rounded-full" style={{ background: e.priority?.color ?? 'var(--line-strong)' }} />
                <span className="flex-1">{e.label}</span>
                <span className="tabular-nums text-(--fg-muted)">{contadores.stageCount(e.id)}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chip(filtros.excludedPriorities.size > 0)}>
              Prioridad{filtros.excludedPriorities.size > 0 && ' (filtrada)'}
              <Icon icon={ChevronDown} size="xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {[...prioridades.map(p => ({ id: p.id, name: p.name, color: p.color })),
              { id: PRIORITY_NONE, name: 'Sin prioridad', color: 'var(--line-strong)' }].map(p => (
              <DropdownMenuCheckboxItem
                key={p.id}
                className="text-xs"
                // Marcada = se ve. En la URL viaja la lista de EXCLUIDAS, como en el producto.
                checked={!filtros.excludedPriorities.has(p.id)}
                onSelect={ev => ev.preventDefault()}
                onCheckedChange={() => onCambiar({ excludedPriorities: alternar(filtros.excludedPriorities, p.id) })}
              >
                <span className="size-[7px] rounded-full" style={{ background: p.color }} />
                <span className="flex-1">{p.name}</span>
                <span className="tabular-nums text-(--fg-muted)">{contadores.priorityCount(p.id)}</span>
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              className="text-xs"
              checked={filtros.excludedPriorities.size === 0}
              onCheckedChange={() => onCambiar({ excludedPriorities: new Set() })}
            >
              Todas
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Con alguna tarea vencida el chip se pone rojo: es el aviso que antes daba la agenda roja de
            cada renglón, que se sacó de la lista. */}
        <button type="button" aria-pressed={filtros.overdueOnly}
          className={contadores.overdueLeadCount > 0
            ? cn(chip(false), 'text-(--danger-fg) bg-(--danger-soft) [border:1px_solid_var(--danger)] hover:bg-(--danger-soft)',
              filtros.overdueOnly && 'font-semibold [border-width:1.5px]')
            : chip(filtros.overdueOnly)}
          onClick={() => onCambiar({ overdueOnly: !filtros.overdueOnly })}>
          Tareas vencidas <span className="tabular-nums">{contadores.overdueLeadCount}</span>
        </button>

        <button type="button" aria-pressed={filtros.includeDiscarded} className={chip(filtros.includeDiscarded)}
          onClick={() => onCambiar({ includeDiscarded: !filtros.includeDiscarded })}>
          Incluir descartados <span className="tabular-nums">{contadores.discardedCount}</span>
        </button>

        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            <Icon icon={X} size="xs" />
            Limpiar filtros
          </Button>
        )}
    </div>
  )
}
