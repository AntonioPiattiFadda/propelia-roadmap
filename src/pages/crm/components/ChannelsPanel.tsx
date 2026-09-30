import { useRef, useState } from 'react'
import { LockIcon, PlusIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineDeleteButton } from '@/components/ui/inline-delete-button'
import { cn } from '@/lib/utils'
import { useCatalogoMutaciones } from '../hooks/useCatalogoMutaciones'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import type { CrmChannel } from '../types'

type DropTarget = { id: string; position: 'before' | 'after' } | null

/* Copiado de propelia-frontend (src/pages/ajustes/components/ChannelsPanel.tsx). La tabla de
   canales arranca vacía y se carga desde acá. */
export function ChannelsPanel() {
  const { canalesActivos: channels, isLoading } = useCrmCatalogos()
  const m = useCatalogoMutaciones()
  const [newLabel, setNewLabel] = useState('')
  const dragId = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  if (isLoading) return <div className="h-24 animate-pulse bg-secondary rounded-lg" />

  const sorted = [...channels].sort((a, b) => a.position - b.position)

  const handleCreate = () => {
    const label = newLabel.trim()
    if (!label) return
    const last = sorted[sorted.length - 1]
    m.crearCanal.mutate({ label, position: last ? last.position + 1 : 1 })
    setNewLabel('')
  }

  const getDropPosition = (e: React.DragEvent): 'before' | 'after' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    setDropTarget(null)
    if (!dragId.current || dragId.current === targetId) return
    const items = [...sorted]
    const fromIdx = items.findIndex((c) => c.id === dragId.current)
    const toIdx = items.findIndex((c) => c.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const position = getDropPosition(e)
    const [item] = items.splice(fromIdx, 1)
    const newToIdx = items.findIndex((c) => c.id === targetId)
    items.splice(position === 'after' ? newToIdx + 1 : newToIdx, 0, item)
    m.reordenarCanales.mutate(items.map((c, i) => ({ id: c.id, position: i + 1 })))
    dragId.current = null
  }

  return (
    <div className="max-w-md">
      <div className="bg-[--surface] border border-[--line] rounded-md overflow-hidden mb-3">
        <div className="flex items-center justify-between px-3.5 py-2 bg-[--surface-3] border-b border-[--line]">
          <span className="text-[10px] font-semibold text-[--fg-muted] uppercase tracking-[0.05em]">
            Canales de origen. Arrastrá para reordenar
          </span>
        </div>
        <table className="w-full border-collapse table-fixed">
          <colgroup>
            <col className="w-[24px]" />
            <col />
            <col className="w-[40px]" />
          </colgroup>
          <tbody
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
            }}
          >
            {sorted.map((channel: CrmChannel) => {
              const isDropBefore = dropTarget?.id === channel.id && dropTarget.position === 'before'
              const isDropAfter = dropTarget?.id === channel.id && dropTarget.position === 'after'
              return (
                <tr
                  key={channel.id}
                  draggable
                  onDragStart={() => { dragId.current = channel.id }}
                  onDragEnd={() => { dragId.current = null; setDropTarget(null) }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!dragId.current || dragId.current === channel.id) return
                    setDropTarget({ id: channel.id, position: getDropPosition(e) })
                  }}
                  onDrop={(e) => handleDrop(e, channel.id)}
                  className={cn(
                    'h-8 border-b border-[--line] last:border-b-0 hover:bg-[--surface-2] transition-colors',
                    dragId.current === channel.id && 'opacity-40',
                    isDropBefore && 'shadow-[inset_0_2px_0_0_var(--brand)]',
                    isDropAfter && 'shadow-[inset_0_-2px_0_0_var(--brand)]',
                  )}
                >
                  <td className="px-1 text-center select-none">
                    <span className="text-[--fg-faint] cursor-grab text-sm">⠿</span>
                  </td>
                  <td className="px-2.5 py-1">
                    <InlineEditCell
                      value={channel.label}
                      onSave={(label) => m.actualizarCanal.mutate({ id: channel.id, payload: { label } })}
                      className="font-medium"
                    />
                  </td>
                  <td className="px-2.5 py-1 text-right">
                    {channel.allow_delete ? (
                      <InlineDeleteButton
                        elementName={channel.label}
                        onConfirm={() => m.borrarCanal.mutate(channel.id)}
                        isPending={m.borrarCanal.isPending}
                      />
                    ) : (
                      <LockIcon className="size-3 text-[--fg-faint] ml-auto" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          placeholder="Nuevo canal..."
          className="h-8 text-xs"
        />
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-white cursor-pointer border-none font-medium hover:opacity-90 transition-opacity shrink-0"
          style={{ background: 'var(--purple, #534AB7)' }}
        >
          <PlusIcon className="size-3" />
          Agregar
        </button>
      </div>
    </div>
  )
}
