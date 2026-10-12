import { ArrowDownWideNarrow, ChevronDown, Columns3, List, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { LeadListCounters } from '../lib/computeLeadListCounters'
import type { VistaCrm } from '../lib/leadFilterParams'
import type { LeadFilterState } from '../lib/leadFilters'
import type { CrmStage } from '../types'

const chip = (activo: boolean) => cn(
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
  activo
    ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)

/** El buscador por nombre y teléfono. En el escritorio va en la cabecera de la tabla, en el
 *  lugar de «Alta» y «Lead»; en el teléfono, que no tiene cabecera, arriba con los chips. */
export function BuscadorLeads({ q, onCambiar, className }: {
  q: string
  onCambiar: (patch: Partial<LeadFilterState>) => void
  className?: string
}) {
  return (
    <span className={cn('relative block', className)}>
      <Icon icon={Search} size="sm" className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-(--fg-muted)" />
      <input
        type="text"
        value={q}
        onChange={e => onCambiar({ q: e.target.value })}
        placeholder="Buscar por empresa, contacto, teléfono o email…"
        aria-label="Buscar por empresa, contacto, teléfono o email"
        // 16px en el teléfono: abajo de eso el navegador hace zoom al tocar el campo.
        className="h-8 w-full rounded-lg bg-(--surface) pl-[32px] pr-3 text-[13px] font-normal normal-case tracking-normal text-foreground outline-none transition-colors [border:1px_solid_var(--line-strong)] placeholder:text-(--fg-muted) focus:[border-color:var(--brand)] max-md:h-9 max-md:text-[16px]"
      />
    </span>
  )
}

/**
 * Chips (y el buscador, solo en el teléfono). Todo vive en la URL (lo escribe `escribirFiltros`): la
 * lista, un enlace de Equipo y el botón «atrás» dicen lo mismo. Cada número es «cuántos quedarían
 * si prendo esto», de `computeLeadListCounters`. Sin filtro de prioridad ni de gestión desde el
 * 10/10/2026: se sacaron del front para rediseñarlos.
 */
export function FiltrosCrm({ filtros, contadores, etapas, conBuscador, vista, onVista, onCambiar, onLimpiar }: {
  filtros: LeadFilterState
  /** El buscador va acá solo cuando no hay cabecera de tabla donde ponerlo (teléfono, columnas). */
  conBuscador: boolean
  contadores: LeadListCounters
  etapas: CrmStage[]
  vista: VistaCrm
  onVista: (vista: VistaCrm) => void
  onCambiar: (patch: Partial<LeadFilterState>) => void
  onLimpiar: () => void
}) {
  const hayFiltros = filtros.q.trim() !== '' || filtros.stageFilter.size > 0 || filtros.sinTareas
    || filtros.overdueOnly || filtros.conTareas || filtros.includeDiscarded || filtros.paraRecontactar || filtros.ordenPorEstado
  const columnas = vista === 'columnas'

  const alternar = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  return (
    // Un solo renglón de filtros. Si no entran, bajan solos.
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 max-md:px-2">
        {conBuscador && <BuscadorLeads q={filtros.q} onCambiar={onCambiar} className="mr-0.5 w-full md:w-[340px]" />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chip(filtros.stageFilter.size > 0)}>
              Estado{filtros.stageFilter.size > 0 && ` (${filtros.stageFilter.size})`}
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
                <span className="flex-1">{e.label}</span>
                <span className="tabular-nums text-(--fg-muted)">{contadores.stageCount(e.id)}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* En columnas, las tareas son tres opciones: todas, con pendientes o sin ninguna. Viven en
            el mismo `?tareas=` que el chip de la lista, así que cambiar de vista no las pierde. */}
        {columnas ? (
          <div role="group" aria-label="Tareas" className="inline-flex gap-1">
            <button type="button" aria-pressed={!filtros.conTareas && !filtros.sinTareas}
              className={chip(!filtros.conTareas && !filtros.sinTareas)}
              onClick={() => onCambiar({ conTareas: false, sinTareas: false, overdueOnly: false })}>
              Todas
            </button>
            <button type="button" aria-pressed={filtros.conTareas} className={chip(filtros.conTareas)}
              onClick={() => onCambiar({ conTareas: true, sinTareas: false })}>
              Con tareas <span className="tabular-nums">{contadores.conTareasCount}</span>
            </button>
            <button type="button" aria-pressed={filtros.sinTareas} className={chip(filtros.sinTareas)}
              onClick={() => onCambiar({ sinTareas: true, conTareas: false, overdueOnly: false })}>
              Sin tareas <span className="tabular-nums">{contadores.sinTareasCount}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Además de filtrar, ordena por la próxima tarea y cambia las columnas (ver CrmLeadList).
                Apagarla apaga también su subfiltro, que si no quedaría prendido y escondido. */}
            <button type="button" aria-pressed={filtros.conTareas} className={chip(filtros.conTareas)}
              onClick={() => onCambiar(filtros.conTareas
                ? { conTareas: false, overdueOnly: false, ordenPorEstado: false }
                : { conTareas: true })}>
              Tareas <span className="tabular-nums">{contadores.conTareasCount}</span>
            </button>
            {/* «Sin tareas» se elige en columnas; en la lista aparece solo si quedó puesto, para
                que no filtre escondido y se pueda apagar. */}
            {filtros.sinTareas && (
              <button type="button" aria-pressed className={chip(true)}
                onClick={() => onCambiar({ sinTareas: false })}>
                Sin tareas <span className="tabular-nums">{contadores.sinTareasCount}</span>
              </button>
            )}
          </>
        )}

        {/* «Vencidas» es subfiltro de «Tareas» (12/10/2026): aparece cuando está prendida, o si un
            enlace viejo trae solo `overdue=1`, para que se pueda apagar. Con alguna tarea vencida el
            chip se pone rojo: es el aviso que antes daba la agenda roja de cada renglón. */}
        {(filtros.conTareas || filtros.overdueOnly) && (
          <button type="button" aria-pressed={filtros.overdueOnly}
            className={contadores.overdueLeadCount > 0
              ? cn(chip(false), 'text-(--danger-fg) bg-(--danger-soft) [border:1px_solid_var(--danger)] hover:bg-(--danger-soft)',
                filtros.overdueOnly && 'font-semibold [border-width:1.5px]')
              : chip(filtros.overdueOnly)}
            onClick={() => onCambiar({ overdueOnly: !filtros.overdueOnly })}>
            Vencidas <span className="tabular-nums">{contadores.overdueLeadCount}</span>
          </button>
        )}

        {/* Otro subchip de «Tareas»: no filtra, cambia el orden. Prendido, lo más avanzado del
            funnel va arriba (ordenarPorEstado); apagado, la próxima tarea. Va acá y no en la
            cabecera de la tabla porque el teléfono no tiene cabecera. */}
        {/* En columnas no va: ahí el estado ya es la columna. */}
        {!columnas && (filtros.conTareas || filtros.ordenPorEstado) && (
          <button type="button" aria-pressed={filtros.ordenPorEstado} className={chip(filtros.ordenPorEstado)}
            title="Lo más avanzado del funnel arriba; descartados al final"
            onClick={() => onCambiar({ ordenPorEstado: !filtros.ordenPorEstado })}>
            <Icon icon={ArrowDownWideNarrow} size="xs" />
            Ordenar por estado
          </button>
        )}

        <button type="button" aria-pressed={filtros.includeDiscarded} className={chip(filtros.includeDiscarded)}
          onClick={() => onCambiar({ includeDiscarded: !filtros.includeDiscarded })}>
          Incluir descartados <span className="tabular-nums">{contadores.discardedCount}</span>
        </button>

        {/* Los descartados que «podrían calificar» vuelven acá cuando llega su fecha (recontact_at).
            Con alguno pendiente el chip se pone ámbar: es
            trabajo que volvió, no una alarma. Sin ninguno, solo aparece si está prendido. */}
        {(contadores.recontactarCount > 0 || filtros.paraRecontactar) && (
          <button type="button" aria-pressed={filtros.paraRecontactar}
            className={contadores.recontactarCount > 0
              ? cn(chip(false), 'text-(--warning-fg) bg-(--warning-soft) [border:1px_solid_var(--warning)] hover:bg-(--warning-soft)',
                filtros.paraRecontactar && 'font-semibold [border-width:1.5px]')
              : chip(filtros.paraRecontactar)}
            onClick={() => onCambiar({ paraRecontactar: !filtros.paraRecontactar })}>
            Para recontactar <span className="tabular-nums">{contadores.recontactarCount}</span>
          </button>
        )}

        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            <Icon icon={X} size="xs" />
            Limpiar filtros
          </Button>
        )}

        {/* La vista no es un filtro: «Limpiar filtros» no la toca. */}
        <div role="group" aria-label="Vista" className="ml-auto inline-flex gap-1">
          <button type="button" aria-pressed={!columnas} className={chip(!columnas)} onClick={() => onVista('lista')}>
            <Icon icon={List} size="xs" />
            Lista
          </button>
          <button type="button" aria-pressed={columnas} className={chip(columnas)} onClick={() => onVista('columnas')}>
            <Icon icon={Columns3} size="xs" />
            Columnas
          </button>
        </div>
    </div>
  )
}
