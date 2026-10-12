import { XIcon } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { parseCalendarDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { eur } from '../lib/monto'
import type { FilaCaja } from '../types'
import { PillTipo } from './PillTipo'

const FECHA_LARGA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
// Un fijo sin cargar en el período ES el pendiente: mismo cartel que un variable pendiente.
const CHIP = {
  PAID: { texto: 'Pagado', clase: 'bg-(--success-soft) text-(--success-strong)' },
  PENDING: { texto: 'Pendiente', clase: 'bg-(--warning-soft) text-[#8A5A0B]' },
  NONE: { texto: 'Pendiente', clase: 'bg-(--warning-soft) text-[#8A5A0B]' },
} as const

/* Una fila de la lista. En escritorio son cinco columnas; en el teléfono una tarjeta: la fecha a la
   izquierda ocupando los dos renglones, nombre y monto arriba, etiquetas y acciones abajo. */
export function FilaGasto({ fila: f, onPagar, onBorrar }: {
  fila: FilaCaja
  onPagar: (fila: FilaCaja) => void
  onBorrar: (gastoId: string) => void
}) {
  const d = parseCalendarDay(f.fecha)
  const chip = CHIP[f.status]
  const virtual = f.status === 'NONE'
  return (
    <div className="group grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-[11px] hover:bg-(--surface-2) md:grid-cols-[52px_minmax(0,1fr)_200px_110px_96px]">
      <div
        title={`${f.status === 'PAID' ? 'Pagado el' : 'Vence el'} ${d.toLocaleDateString('es-ES', FECHA_LARGA)}`}
        className="col-start-1 row-span-2 row-start-1 flex flex-col items-center leading-[1.1] md:col-auto md:row-auto md:row-span-1"
      >
        <b className="text-base font-semibold tabular-nums">{d.getDate()}</b>
        <span className="text-[10px] uppercase tracking-wide text-(--fg-muted)">{d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span>
      </div>
      <div className="col-start-2 row-start-1 min-w-0 md:col-auto md:row-auto">
        <div className="truncate font-medium">{f.nombre}</div>
        {f.sub && <div className="mt-0.5 truncate text-xs text-(--fg-muted)">{f.sub}</div>}
      </div>
      <div className="col-start-2 row-start-2 flex items-center gap-1.5 md:col-auto md:row-auto">
        <PillTipo tipo={f.kind} className="w-[70px]" />
        <span className={cn(
          'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold before:size-1.5 before:rounded-full before:bg-current before:content-[""]',
          chip.clase,
        )}>{chip.texto}</span>
      </div>
      <div
        title={virtual ? 'Monto habitual de la etiqueta: el real se pone al pagar' : undefined}
        className={cn(
          'col-start-3 row-start-1 text-right font-semibold tabular-nums md:col-auto md:row-auto',
          virtual && 'font-medium text-(--fg-muted)',
        )}
      >
        {eur(f.amount)}
      </div>
      <div className="col-start-3 row-start-2 flex justify-end gap-1 md:col-auto md:row-auto">
        {f.status !== 'PAID' && (
          <button
            type="button"
            onClick={() => onPagar(f)}
            className="h-[26px] cursor-pointer rounded-md border border-(--brand-200) bg-(--brand-soft) px-2.5 text-xs font-semibold text-(--brand-700) hover:bg-white"
          >
            Pagar
          </button>
        )}
        {f.gasto && (
          <button
            type="button"
            title="Borrar"
            aria-label={`Borrar ${f.nombre}`}
            onClick={() => onBorrar(f.gasto!.id)}
            className="grid size-[26px] cursor-pointer place-items-center rounded-md text-(--fg-faint) hover:bg-white hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <Icon icon={XIcon} size="sm" />
          </button>
        )}
      </div>
    </div>
  )
}
