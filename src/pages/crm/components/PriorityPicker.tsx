import { useRef, useState } from 'react'
import { Check, ChevronDown, GripVertical, PencilIcon, PlusIcon } from 'lucide-react'
import type { CrmPriority as Priority } from '../types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InlineDeleteButton } from '@/components/ui/inline-delete-button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

type DropTarget = { id: string; position: 'before' | 'after' } | null

type Props = {
  priorities: Priority[]
  value: string | null
  onChange: (priorityId: string | null) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  /** Crea una prioridad y devuelve su id, para abrirla en edición al toque. */
  onCreate: () => Promise<string | null>
  /** Persiste el orden nuevo tras arrastrar. `position` es 1-based y correlativa. */
  onReorder: (items: { id: string; position: number }[]) => void
  isDeletePending?: boolean
}

/**
 * Selector de prioridad que además ADMINISTRA la lista: renombrar, borrar y crear
 * viven acá adentro. Antes eso era una tabla aparte arriba del funnel; se sacó
 * porque la prioridad ya es una columna de la tabla de estados y tener el catálogo
 * duplicado en dos cajas obligaba a mirar dos lugares para entender uno.
 *
 * Es un Popover y no un Select porque cada fila lleva sus propias acciones: un
 * SelectItem se traga el click entero y no deja colgarle un lápiz ni un tacho.
 */
export function PriorityPicker({
  priorities,
  value,
  onChange,
  onRename,
  onDelete,
  onCreate,
  onReorder,
  isDeletePending,
}: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  // Escape también dispara blur al soltar el foco: sin este flag, cancelar guardaría igual.
  const cancelled = useRef(false)

  const selected = priorities.find((p) => p.id === value) ?? null

  const startEditing = (p: Priority) => {
    cancelled.current = false
    setDraft(p.name)
    setEditingId(p.id)
  }

  const commitEditing = () => {
    const id = editingId
    if (!id) return
    setEditingId(null)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = draft.trim()
    const current = priorities.find((p) => p.id === id)?.name
    if (!next || next === current) return
    onRename(id, next)
  }

  const handleCreate = async () => {
    const id = await onCreate()
    if (!id) return
    cancelled.current = false
    setDraft('Nueva prioridad')
    setEditingId(id)
  }

  const getDropPosition = (e: React.DragEvent): 'before' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDropTarget(null)
    setDragId(null)
    if (!dragId || dragId === targetId) return

    // Se saca el arrastrado ANTES de buscar el índice del destino: si venía de más
    // arriba, el splice corre todo lo de abajo un lugar y el índice viejo apuntaría
    // al vecino equivocado.
    const sortable = [...priorities]
    const fromIdx = sortable.findIndex((p) => p.id === dragId)
    if (fromIdx === -1) return
    const position = getDropPosition(e)
    const [item] = sortable.splice(fromIdx, 1)
    const toIdx = sortable.findIndex((p) => p.id === targetId)
    if (toIdx === -1) return
    sortable.splice(position === 'after' ? toIdx + 1 : toIdx, 0, item)

    onReorder(sortable.map((p, i) => ({ id: p.id, position: i + 1 })))
  }

  const rowBase =
    'flex items-center gap-1 h-8 pl-2 pr-1.5 rounded-[7px] hover:bg-(--surface-3) transition-colors'
  // Las filas arrastrables ceden 16px al agarre, así que las de abajo ("Sin prioridad",
  // "Añadir prioridad") arrancan con la misma sangría y la lista queda en una columna.
  const rowIndent = 'pl-6'

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null) }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between gap-1 h-[26px] w-full text-[12.5px] rounded-[7px] border border-transparent bg-transparent px-[7px] cursor-pointer hover:bg-(--surface-3) hover:border-(--line) transition-colors"
        >
          {selected
            ? <><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: selected.color }} /><span className="truncate">{selected.name}</span></>
            : <span className="text-(--fg-muted)">Sin prioridad</span>}
          <Icon icon={ChevronDown} size="xs" className="shrink-0 text-(--fg-faint)" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-60 p-1.5">
        <div
          className="flex flex-col max-h-64 overflow-y-auto"
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
          }}
        >
          {priorities.map((p) => {
            const isEditing = editingId === p.id
            if (isEditing) {
              return (
                <div key={p.id} className={cn(rowBase, rowIndent, 'bg-(--surface-3)')}>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={commitEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        cancelled.current = true
                        e.currentTarget.blur()
                      }
                    }}
                    aria-label={`Renombrar "${p.name}"`}
                    className="flex-1 min-w-0 h-6 px-1 text-[12.5px] bg-(--surface) rounded-[5px] border border-(--brand) outline-none"
                  />
                </div>
              )
            }
            return (
              // `group` y no hover por fila: el agarre, el lápiz y el tacho aparecen
              // recién cuando el mouse está sobre la fila, así la lista se lee como una lista.
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => { setDragId(null); setDropTarget(null) }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!dragId || dragId === p.id) return
                  setDropTarget({ id: p.id, position: getDropPosition(e) })
                }}
                onDrop={(e) => handleDrop(e, p.id)}
                className={cn(
                  rowBase,
                  'group pl-1',
                  dragId === p.id && 'opacity-40',
                  dropTarget?.id === p.id && dropTarget.position === 'before' && 'shadow-[inset_0_2px_0_0_var(--brand)]',
                  dropTarget?.id === p.id && dropTarget.position === 'after' && 'shadow-[inset_0_-2px_0_0_var(--brand)]',
                )}
              >
                <span className="size-4 shrink-0 inline-flex items-center justify-center cursor-grab active:cursor-grabbing text-(--fg-faint) opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icon icon={GripVertical} size="xs" />
                </span>
                <button
                  type="button"
                  onClick={() => { onChange(p.id); setOpen(false) }}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-[12.5px] cursor-pointer bg-transparent border-none p-0"
                >
                  <span className="size-3.5 shrink-0 inline-flex items-center justify-center text-(--brand)">
                    {p.id === value && <Icon icon={Check} size="xs" />}
                  </span>
                  <><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: p.color }} /><span className="truncate">{p.name}</span></>
                </button>
                <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => startEditing(p)}
                    aria-label={`Renombrar "${p.name}"`}
                    className="size-6 inline-flex items-center justify-center rounded-[5px] text-(--fg-faint) hover:text-(--fg) hover:bg-(--surface) cursor-pointer bg-transparent border-none"
                  >
                    <Icon icon={PencilIcon} size="xs" />
                  </button>
                  <InlineDeleteButton
                    elementName={p.name}
                    onConfirm={() => onDelete(p.id)}
                    isPending={isDeletePending ?? false}
                    className="size-6 rounded-[5px]"
                  />
                </span>
              </div>
            )
          })}
        </div>

        <div className="h-px my-1 bg-(--line)" />

        <button
          type="button"
          onClick={() => { onChange(null); setOpen(false) }}
          className={cn(rowBase, rowIndent, 'w-full text-left text-[12.5px] text-(--fg-muted) cursor-pointer bg-transparent border-none')}
        >
          <span className="size-3.5 shrink-0 inline-flex items-center justify-center text-(--brand)">
            {value == null && <Icon icon={Check} size="xs" />}
          </span>
          Sin prioridad
        </button>

        <button
          type="button"
          onClick={handleCreate}
          className={cn(rowBase, rowIndent, 'w-full text-left text-[12.5px] font-semibold text-(--brand) cursor-pointer bg-transparent border-none')}
        >
          <Icon icon={PlusIcon} size="xs" />
          Añadir prioridad
        </button>
      </PopoverContent>
    </Popover>
  )
}
