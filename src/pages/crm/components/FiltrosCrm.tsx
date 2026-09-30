import { ChevronDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { LeadListCounters } from '../lib/computeLeadListCounters'
import type { GestionKey } from '../lib/gestionStatus'
import { GESTION_KEYS, soloGestion } from '../lib/leadFilterParams'
import { PRIORITY_NONE, type LeadFilterState } from '../lib/leadFilters'
import type { CrmPriority, EtapaConPrioridad } from '../types'

type Pestaña = 'todos' | GestionKey

const PESTAÑAS: { id: Pestaña; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'gestionado', label: 'Al día' },
  { id: 'pospuesto', label: 'Pospuestos' },
]

// Qué pestaña corresponde a lo excluido en la URL. Una combinación que no es ninguna (alguien
// editó la URL a mano) deja las cuatro apagadas en vez de mentir con una.
function pestañaDe(excluidos: Set<GestionKey>): Pestaña | null {
  if (excluidos.size === 0) return 'todos'
  return GESTION_KEYS.find(k => {
    const solo = soloGestion(k)
    return solo.size === excluidos.size && [...solo].every(x => excluidos.has(x))
  }) ?? null
}

const chip = (activo: boolean) => cn(
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
  activo
    ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)

/**
 * Buscador, pestañas de gestión y chips. Todo vive en la URL (lo escribe `escribirFiltros`): la
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
  const activa = pestañaDe(filtros.gestionExcluded)
  const cuenta: Record<Pestaña, number> = {
    todos: contadores.gestionTotal,
    pendiente: contadores.pendienteCount,
    gestionado: contadores.gestionadoCount,
    pospuesto: contadores.pospuestoCount,
  }
  const hayFiltros = filtros.q.trim() !== '' || filtros.stageFilter.size > 0 || filtros.gestionExcluded.size > 0
    || filtros.overdueOnly || filtros.includeDiscarded || filtros.excludedPriorities.size > 0

  const alternar = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-2 max-md:px-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative block w-72 max-md:w-full">
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

        <div role="tablist" aria-label="Estado de gestión" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          {PESTAÑAS.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa === p.id}
              onClick={() => onCambiar({ gestionExcluded: p.id === 'todos' ? new Set() : soloGestion(p.id) })}
              className={cn(
                'h-8 cursor-pointer rounded-md px-3 text-[12.5px] transition-colors',
                activa === p.id ? 'bg-card font-semibold text-foreground shadow-xs' : 'text-(--fg-2) hover:text-foreground',
              )}
            >
              {p.label} <span className="tabular-nums text-(--fg-muted)">{cuenta[p.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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

        <button type="button" aria-pressed={filtros.overdueOnly} className={chip(filtros.overdueOnly)}
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
    </div>
  )
}
