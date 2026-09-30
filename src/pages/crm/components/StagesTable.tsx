import { useRef, useState } from 'react'
import type { CrmPriority, EtapaConPrioridad } from '../types'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineDeleteButton } from '@/components/ui/inline-delete-button'
import { GripVertical, LockIcon, PlusIcon } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { LockedLabel } from '@/components/ui/locked-label'
import { ManagementToleranceSelect } from './ManagementToleranceSelect'
import { PriorityPicker } from './PriorityPicker'

type DropTarget = { id: string; position: 'before' | 'after' } | null

type Props = {
  stages: EtapaConPrioridad[]
  priorities: CrmPriority[]
  onUpdate: (id: string, payload: { label?: string; priority_id?: string | null; management_tolerance_hours?: number | null }) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onReorder: (items: { id: string; position: number }[]) => void
  isDeletePending?: boolean
  onRenamePriority: (id: string, name: string) => void
  onDeletePriority: (id: string) => void
  onCreatePriority: () => Promise<string | null>
  onReorderPriorities: (items: { id: string; position: number }[]) => void
  isPriorityDeletePending?: boolean
}

/** Alto de fila y de los controles: la tabla entra sin scroll dentro del diálogo. */
const CONTROL_CLASS =
  'h-[26px] w-full max-w-full text-[12.5px] rounded-[7px] border-transparent bg-transparent shadow-none hover:bg-(--surface-3) hover:border-(--line) transition-colors px-[7px]'

export function StagesTable({
  stages,
  priorities,
  onUpdate,
  onCreate,
  onDelete,
  onReorder,
  isDeletePending,
  onRenamePriority,
  onDeletePriority,
  onCreatePriority,
  onReorderPriorities,
  isPriorityDeletePending,
}: Props) {
  const dragId = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  // Un solo funnel: en orden por posición, y los que están fuera (Descartado) en su caja aparte.
  const vivas = stages.filter(s => s.deleted_at == null).sort((a, b) => a.position - b.position)
  const inFunnel = vivas.filter(s => !s.is_out_of_funnel)
  const outOfFunnel = vivas.filter(s => s.is_out_of_funnel)

  const getDropPosition = (e: React.DragEvent): 'before' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDropTarget(null)
    if (!dragId.current || dragId.current === targetId) return
    const sortable = inFunnel.filter((s) => s.allow_reorder)
    const fromIdx = sortable.findIndex((s) => s.id === dragId.current)
    if (fromIdx === -1) return
    const toIdx = sortable.findIndex((s) => s.id === targetId)
    if (toIdx === -1) return
    const position = getDropPosition(e)
    const [item] = sortable.splice(fromIdx, 1)
    const newToIdx = sortable.findIndex((s) => s.id === targetId)
    sortable.splice(position === 'after' ? newToIdx + 1 : newToIdx, 0, item)
    onReorder(sortable.map((s, i) => ({ id: s.id, position: i + 1 })))
    dragId.current = null
  }

  /**
   * `compact` es la variante de la columna derecha (descartados): sin el número de
   * orden ni el tacho. Un descartado no se numera —está fuera de la secuencia— y no
   * se borra, así que esas dos columnas sólo gastaban los ~90px de ancho que la
   * segunda columna necesita para existir sin apretar el rótulo del estado.
   */
  const renderRow = (stage: EtapaConPrioridad, isDraggable: boolean, num?: string, compact = false) => {
    const isBeingDragged = dragId.current === stage.id
    const isDropBefore = dropTarget?.id === stage.id && dropTarget.position === 'before'
    const isDropAfter = dropTarget?.id === stage.id && dropTarget.position === 'after'
    return (
      <tr
        key={`${stage.id}-${stage.label}`}
        draggable={isDraggable}
        onDragStart={isDraggable ? () => { dragId.current = stage.id } : undefined}
        onDragEnd={isDraggable ? () => { dragId.current = null; setDropTarget(null) } : undefined}
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragId.current || dragId.current === stage.id) return
          setDropTarget({ id: stage.id, position: getDropPosition(e) })
        }}
        onDrop={(e) => handleDrop(e, stage.id)}
        className={cn(
          // Sin `border-r` en las celdas: la cuadrícula partía cada fila en cajas y
          // el hover se leía como celdas encendidas, no como una fila. Queda sólo
          // el separador horizontal.
          // h-8 y no h-9: con ~13 filas más las dos cabeceras de grupo, los 4px por
          // fila son la diferencia entre entrar en el diálogo o scrollear.
          "h-8 border-b border-(--line-soft) last:border-b-0 hover:bg-(--surface-2) transition-colors",
          isBeingDragged && "opacity-40",
          isDropBefore && "shadow-[inset_0_2px_0_0_var(--brand)]",
          isDropAfter && "shadow-[inset_0_-2px_0_0_var(--brand)]",
        )}
      >
        {!compact && (
          <td className="px-1 select-none">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-[11.5px] tabular-nums text-(--fg-muted)">{num}</span>
              {isDraggable
                ? <span className="inline-flex text-(--fg-faint) hover:text-(--fg-2) cursor-grab transition-colors">
                    <Icon icon={GripVertical} size="xs" />
                  </span>
                : <span className="inline-flex text-(--fg-faint)" title="Estado del sistema">
                    <Icon icon={LockIcon} size="xs" />
                  </span>
              }
            </div>
          </td>
        )}
        <td className="px-2 py-1">
          {stage.allow_rename
            ? <InlineEditCell
                value={stage.label}
                onSave={(label) => onUpdate(stage.id, { label })}
                className="h-[26px] -ml-[6px] px-[6px] rounded-[7px] text-[13px] font-semibold tracking-[-0.1px] hover:bg-(--surface-3) hover:shadow-[inset_0_0_0_1px_var(--line)] transition-colors"
                style={{ color: 'var(--fg)' }}
              />
            /* El bloqueado va en --fg-2 y no en --fg: así se distingue del editable de un
               vistazo, sin tener que registrar el candado. */
            : <LockedLabel
                label={stage.label}
                className="text-[13px] font-semibold tracking-[-0.1px]"
                style={{ color: 'var(--fg-2)' }}
              />
          }
        </td>
        <td className="px-2 py-1">
          <PriorityPicker
            priorities={priorities}
            value={stage.priority_id ?? null}
            onChange={(priorityId) => onUpdate(stage.id, { priority_id: priorityId })}
            onRename={onRenamePriority}
            onDelete={onDeletePriority}
            onCreate={onCreatePriority}
            onReorder={onReorderPriorities}
            isDeletePending={isPriorityDeletePending}
          />
        </td>
        <td className="px-2 py-1">
          <ManagementToleranceSelect
            value={stage.management_tolerance_hours}
            onChange={(hours) => onUpdate(stage.id, { management_tolerance_hours: hours })}
            className={CONTROL_CLASS}
          />
        </td>
        {!compact && (
          <td className="px-2 py-1 text-right">
            {stage.allow_delete
              ? <InlineDeleteButton
                  elementName={stage.label}
                  onConfirm={() => onDelete(stage.id)}
                  isPending={isDeletePending ?? false}
                  className="size-6 rounded-[6px]"
                />
              : <span className="size-6 inline-flex items-center justify-center shrink-0 ml-auto">
                  <Icon icon={LockIcon} size="xs" className="text-(--fg-faint)" />
                </span>
            }
          </td>
        )}
      </tr>
    )
  }

  const columns = (
    <colgroup>
      <col className="w-12" />
      <col />
      <col className="w-[168px]" />
      <col className="w-[152px]" />
      <col className="w-11" />
    </colgroup>
  )

  const columnsCompact = (
    <colgroup>
      <col />
      <col className="w-[140px]" />
      <col className="w-[132px]" />
    </colgroup>
  )

  const headCell =
    'text-[10.5px] text-(--fg-2) font-bold uppercase tracking-[0.07em] whitespace-nowrap px-2 py-1 border-b border-(--line-strong) text-left'
  const cardClass = 'bg-(--surface) border border-(--line) rounded-[10px] overflow-hidden'
  // `pr-9`: sin el título del diálogo, la X de cerrar cae justo sobre la esquina
  // superior derecha de la última caja. Reservarle el hueco en las DOS cabeceras la
  // deja aterrizar en vacío tanto si hay caja de descartados como si no.
  const cardHeaderClass =
    'flex items-center justify-between gap-4 h-10 pl-3 pr-9 bg-(--surface) border-b border-(--line)'
  const cardTitleClass = 'text-[13.5px] font-semibold tracking-[-0.1px] text-(--fg)'

  return (
    /* Dos columnas y no una lista larga: los descartados son un puñado de estados que
       no se numeran ni se reordenan, así que apilarlos debajo del funnel sumaba ~100px
       de alto para mostrar dos filas. Al costado usan el ancho que ya sobraba y el
       diálogo entra sin scroll. Debajo de lg vuelven a apilarse, que es lo único que
       entra en una pantalla angosta. */
    <div className="grid gap-3 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <div className={cardClass}>
        {/* Una sola línea: el título y el botón. La bajada explicativa se sacó — lo que
            hace cada columna ya lo dice su rótulo. */}
        <div className={cardHeaderClass}>
          <span className={cardTitleClass}>Estados del funnel</span>
          {/* Secundario y no azul pleno: el sólido queda reservado para la acción primaria
              de la pantalla. */}
          <button
            onClick={onCreate}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-(--surface) border border-(--line-strong) text-[12px] font-semibold text-(--brand) whitespace-nowrap cursor-pointer hover:bg-(--surface-3) hover:border-(--brand) transition-colors"
          >
            <Icon icon={PlusIcon} size="xs" />
            Añadir estado
          </button>
        </div>
        <table className="w-full border-collapse">
          {columns}
          <thead>
            <tr className="bg-(--surface-2)">
              <th className="text-[10.5px] text-(--fg-2) font-bold uppercase tracking-[0.07em] px-1.5 py-1 border-b border-(--line-strong) text-right">#</th>
              <th className={headCell}>Estado</th>
              <th className={headCell}>Prioridad</th>
              <th className={headCell}>Tiempo de gestión</th>
              <th className="border-b border-(--line-strong)" />
            </tr>
          </thead>
          <tbody
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
            }}
          >
            {inFunnel.map((s, idx) =>
              renderRow(s, s.allow_reorder, String(idx + 1).padStart(2, '0'))
            )}
          </tbody>
        </table>
      </div>

      {outOfFunnel.length > 0 && (
        /* Mismo chrome que la caja de la izquierda —borde neutro, no --danger-soft:
           descartar es un cierre, no un error— para que se lean como dos partes de la
           misma configuración y no como una advertencia colgada al costado. */
        <div className={cardClass}>
          <div className={cardHeaderClass}>
            <span className={cardTitleClass}>Descartados</span>
          </div>
          <table className="w-full border-collapse">
            {columnsCompact}
            <thead>
              <tr className="bg-(--surface-2)">
                <th className={headCell}>Estado</th>
                <th className={headCell}>Prioridad</th>
                <th className={headCell}>Tiempo</th>
              </tr>
            </thead>
            <tbody>{outOfFunnel.map((s) => renderRow(s, false, undefined, true))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
