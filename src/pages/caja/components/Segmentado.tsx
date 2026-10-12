import { cn } from '@/lib/utils'

/* El control segmentado del mock (Todos/Fijos/Variables, Tipo, Estado). No hay uno en
   `components/ui`, y `tabs` es navegación: acá son botones con `aria-pressed`. */
export function Segmentado<T extends string>({ valor, opciones, onChange, label, className }: {
  valor: T
  opciones: { valor: T; label: string; cuenta?: number }[]
  onChange: (valor: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-lg border border-(--line-strong) bg-(--surface-2) p-0.5', className)}>
      {opciones.map(o => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'h-7 cursor-pointer rounded-md px-3 text-xs font-medium text-(--fg-2) transition-colors',
            valor === o.valor && 'bg-white text-(--brand-700) shadow-sm',
          )}
        >
          {o.label}
          {o.cuenta != null && <span className="ml-1 font-normal text-(--fg-muted)">{o.cuenta}</span>}
        </button>
      ))}
    </div>
  )
}
