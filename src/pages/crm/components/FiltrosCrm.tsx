import { ArrowDownWideNarrow, ChevronDown, Columns3, Layers, List, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { LeadListCounters } from '../lib/computeLeadListCounters'
import { alternarGrupo, etapasPorGestion } from '../lib/gestionDeEtapa'
import type { VistaCrm } from '../lib/leadFilterParams'
import type { LeadFilterState, OrdenLeads } from '../lib/leadFilters'
import type { CrmStage } from '../types'

/* El número adentro del chip (`.tabular-nums`) es una chapita teñida con el color del propio
   texto, así se lee bien también sobre el rojo de «Vencidas» y el ámbar de «Para recontactar». */
const chip = (activo: boolean) => cn(
  'inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium',
  'transition-[background-color,border-color,color,box-shadow] duration-150 active:scale-[.98]',
  'outline-none focus-visible:ring-2 focus-visible:ring-(--brand-200) focus-visible:ring-offset-1',
  '[&_.tabular-nums]:inline-flex [&_.tabular-nums]:h-[18px] [&_.tabular-nums]:min-w-[18px] [&_.tabular-nums]:items-center',
  '[&_.tabular-nums]:justify-center [&_.tabular-nums]:rounded-full [&_.tabular-nums]:bg-current/10 [&_.tabular-nums]:px-1.5',
  '[&_.tabular-nums]:text-[11px] [&_.tabular-nums]:font-semibold',
  activo
    ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-200)] shadow-none'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] shadow-(--shadow-sm) hover:text-foreground hover:[border-color:var(--line-strong)] hover:bg-(--surface-2)',
)

const ORDENES: { value: OrdenLeads; label: string; corto: string; ayuda: string }[] = [
  { value: 'actividad', label: 'Por última actividad', corto: 'última actividad', ayuda: 'Lo más reciente arriba; sin contactar al final' },
  { value: 'estado', label: 'Por estado', corto: 'estado', ayuda: 'Lo más avanzado del funnel arriba' },
  { value: 'tarea', label: 'Por tarea', corto: 'tarea', ayuda: 'Por vencimiento: lo vencido arriba' },
]

/* Lista / Columnas es un segmentado y no dos chips sueltos: es una sola elección, no dos filtros. */
const segmento = (activo: boolean) => cn(
  'inline-flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium',
  'transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-(--brand-200)',
  activo
    ? 'bg-card text-foreground font-semibold shadow-(--shadow-sm)'
    : 'text-(--fg-muted) hover:text-foreground',
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
    || filtros.overdueOnly || filtros.conTareas || filtros.paraRecontactar || filtros.pendienteAgendar || filtros.orden !== null
    || filtros.objetivo !== null
  const columnas = vista === 'columnas'
  const ordenVigente = filtros.orden ?? (filtros.conTareas ? 'tarea' : null)

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

        <span className="mr-0.5 text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)">Filtros</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Más grande que el resto de los chips (20/10/2026, por pedido): es el filtro que más se usa. */}
            <button type="button"
              className={cn(chip(filtros.stageFilter.size > 0), 'h-9 gap-2 px-4 text-[13.5px] font-semibold data-[state=open]:[border-color:var(--brand-200)] data-[state=open]:shadow-(--shadow-md)')}>
              <Icon icon={Layers} size="sm" />
              Estado{filtros.stageFilter.size > 0 && <span className="tabular-nums">{filtros.stageFilter.size}</span>}
              <Icon icon={ChevronDown} size="sm" className="transition-transform duration-150 [[data-state=open]_&]:rotate-180" />
            </button>
          </DropdownMenuTrigger>
          {/* Descartado es una opción más (16/10/2026): sin elegirla, los descartados no se ven.
              Reemplazó al chip «Incluir descartados». Desde el 20/10/2026 va en subgrupos: Primer
              contacto, Seguimiento y Otros (sin clasificar y fuera del funnel), de `etapasPorGestion`. */}
          <DropdownMenuContent align="start" className="w-72 rounded-xl p-1.5 shadow-lg">
            {etapasPorGestion(etapas).map((g, i) => {
              const ids = g.etapas.map(e => e.id)
              const marcadas = ids.filter(id => filtros.stageFilter.has(id)).length
              return (
              <DropdownMenuGroup key={g.label}>
                {i > 0 && <DropdownMenuSeparator className="my-1.5" />}
                {/* El título del subgrupo es un tilde más: marca o desmarca todos sus estados de una. */}
                <DropdownMenuCheckboxItem
                  className="rounded-md pt-2 pb-1.5 text-[11.5px] font-bold uppercase tracking-[0.07em] text-(--fg-2)"
                  checked={marcadas === 0 ? false : marcadas === ids.length ? true : 'indeterminate'}
                  onSelect={ev => ev.preventDefault()}
                  onCheckedChange={() => onCambiar({ stageFilter: alternarGrupo(filtros.stageFilter, ids) })}
                >
                  <span className="flex-1">{g.label}</span>
                  <span className="text-[11px] font-semibold normal-case tracking-normal text-(--fg-muted)">
                    {marcadas === ids.length ? 'Quitar todos' : 'Elegir todos'}
                  </span>
                </DropdownMenuCheckboxItem>
                {g.etapas.map(e => (
                  <DropdownMenuCheckboxItem
                    key={e.id}
                    className="rounded-md py-2 text-[13.5px]"
                    checked={filtros.stageFilter.has(e.id)}
                    onSelect={ev => ev.preventDefault()}
                    onCheckedChange={() => onCambiar({ stageFilter: alternar(filtros.stageFilter, e.id) })}
                  >
                    <span className="flex-1">{e.label}</span>
                    <span className="rounded-full bg-(--surface-2) px-2 text-[11.5px] font-semibold tabular-nums text-(--fg-muted)">
                      {contadores.stageCount(e.id)}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              )
            })}
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
          // «Sin tareas» se elige en columnas; en la lista aparece solo si quedó puesto, para
          // que no filtre escondido y se pueda apagar.
          filtros.sinTareas && (
            <button type="button" aria-pressed className={chip(true)}
              onClick={() => onCambiar({ sinTareas: false })}>
              Sin tareas <span className="tabular-nums">{contadores.sinTareasCount}</span>
            </button>
          )
        )}

        {/* «Vencidas» es subfiltro de «Tareas» (12/10/2026): aparece cuando está prendida, o si un
            enlace viejo trae solo `overdue=1`, para que se pueda apagar. Con alguna tarea vencida el
            chip se pone rojo: es el aviso que antes daba la agenda roja de cada renglón. Apagado es
            solo el contorno rojo; el relleno es «prendido» (17/10/2026: relleno siempre, parecía
            apretado aunque no filtrara). */}
        {(filtros.conTareas || filtros.overdueOnly) && (
          <button type="button" aria-pressed={filtros.overdueOnly}
            className={contadores.overdueLeadCount > 0
              ? cn(chip(false), 'text-(--danger-fg) [border:1px_solid_var(--danger)] hover:text-(--danger-fg) hover:[border-color:var(--danger)]',
                filtros.overdueOnly && 'font-semibold bg-(--danger-soft) hover:bg-(--danger-soft) shadow-none [border-width:1.5px]')
              : chip(filtros.overdueOnly)}
            onClick={() => onCambiar({ overdueOnly: !filtros.overdueOnly })}>
            Vencidas <span className="tabular-nums">{contadores.overdueLeadCount}</span>
          </button>
        )}

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

        {/* Los de «Seguimiento» sin tarea pendiente (20/10/2026, por pedido): nadie los va a volver
            a llamar. Va siempre; con alguno, rojo sutil (contorno y fondo suave), como aviso. */}
        <button type="button" aria-pressed={filtros.pendienteAgendar}
          className={contadores.pendienteAgendarCount > 0
            ? cn(chip(false), 'text-(--danger-fg) bg-(--danger-soft) [border:1px_solid_var(--danger)] hover:text-(--danger-fg) hover:bg-(--danger-soft) hover:[border-color:var(--danger)]',
              filtros.pendienteAgendar && 'font-semibold shadow-none [border-width:1.5px]')
            : chip(filtros.pendienteAgendar)}
          onClick={() => onCambiar({ pendienteAgendar: !filtros.pendienteAgendar })}>
          Pendiente agendar tarea <span className="tabular-nums">{contadores.pendienteAgendarCount}</span>
        </button>

        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            <Icon icon={X} size="xs" />
            Limpiar filtros
          </Button>
        )}

        <div className="ml-auto inline-flex items-center gap-1.5">
        {/* El orden: no filtra. Fue un subchip de «Tareas» con vencimiento / estado (17/10/2026);
            desde el 20/10/2026 se ve siempre en la lista y tiene tres: última actividad, estado y
            tarea (por vencimiento, ordenarPorProximaTarea). Sin elegir, con «Tareas» va por tarea.
            Es el mismo `orden` que las cabeceras de la tabla; va también acá porque el teléfono no
            tiene cabecera. En columnas no va: ahí el estado ya es la columna. Desde el 20/10/2026
            va a la derecha, al lado de «Tareas» y no con los filtros (por pedido): no filtra. */}
        {!columnas && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={chip(filtros.orden !== null)}>
                <Icon icon={ArrowDownWideNarrow} size="xs" />
                {ordenVigente ? `Ordenar: ${ORDENES.find(o => o.value === ordenVigente)?.corto}` : 'Ordenar'}
                <Icon icon={ChevronDown} size="xs" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuRadioGroup
                value={ordenVigente ?? ''}
                onValueChange={v => onCambiar({ orden: v as OrdenLeads })}
              >
                {ORDENES.map(o => (
                  <DropdownMenuRadioItem key={o.value} value={o.value} className="text-xs">
                    <span className="flex flex-col">
                      {o.label}
                      <span className="text-(--fg-muted)">{o.ayuda}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* «Tareas» va al lado de la vista porque convierte la lista en la planilla de tareas.
            Además de filtrar, ordena por la próxima tarea y cambia las columnas (ver CrmLeadList).
            Apagarla apaga también sus subfiltros, que si no quedarían prendidos y escondidos.
            En columnas no va: ahí las tareas son el grupo Todas / Con / Sin. */}
        {!columnas && (
          <button type="button" aria-pressed={filtros.conTareas} className={chip(filtros.conTareas)}
            onClick={() => onCambiar(filtros.conTareas
              ? { conTareas: false, overdueOnly: false }
              : { conTareas: true })}>
            Tareas <span className="tabular-nums">{contadores.conTareasCount}</span>
          </button>
        )}

        {/* La vista no es un filtro: «Limpiar filtros» no la toca. */}
        <div role="group" aria-label="Vista"
          className="inline-flex items-center gap-0.5 rounded-full bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          <button type="button" aria-pressed={!columnas} className={segmento(!columnas)} onClick={() => onVista('lista')}>
            <Icon icon={List} size="xs" />
            Lista
          </button>
          <button type="button" aria-pressed={columnas} className={segmento(columnas)} onClick={() => onVista('columnas')}>
            <Icon icon={Columns3} size="xs" />
            Columnas
          </button>
        </div>
        </div>
    </div>
  )
}
