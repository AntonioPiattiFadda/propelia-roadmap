import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'

/**
 * Barra de selección múltiple. Copiada de propelia-frontend
 * (src/pages/leads/components/BulkActionBar.tsx) sin el modo destructivo: acá la única acción en
 * lote es reasignar.
 */
export function BulkActionBar({ selectedCount, totalCount, confirmLabel, onCancel, onConfirm }: {
  selectedCount: number
  /** Cuántos hay en la lista filtrada: «3 de 40» dice qué tan grande es lo que se está moviendo. */
  totalCount?: number
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const { state, isMobile } = useSidebar()
  const leftOffset = isMobile ? '0px' : state === 'collapsed' ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)'
  return (
    /* `bottom` desde `--tabbar-h`: en el teléfono se apoya encima de la barra de pestañas. */
    <div
      className="ui-scale-reset fixed bottom-(--tabbar-h) right-0 z-10 flex items-center justify-between gap-3 bg-card px-4 py-3 transition-[left] duration-200 ease-linear [border-top:0.5px_solid_var(--line)]"
      style={{ left: leftOffset }}
    >
      <span className="text-sm text-muted-foreground">
        {totalCount != null
          ? `${selectedCount} de ${totalCount} lead${totalCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`
          : `${selectedCount} lead${selectedCount === 1 ? '' : 's'} seleccionado${selectedCount === 1 ? '' : 's'}`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onConfirm} disabled={selectedCount === 0}>{confirmLabel}</Button>
      </div>
    </div>
  )
}
