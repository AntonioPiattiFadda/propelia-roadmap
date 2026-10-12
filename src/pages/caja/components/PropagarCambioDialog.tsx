import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { AlcancePropagacion } from '../service/caja.service'

const OPCIONES: { scope: AlcancePropagacion; titulo: string; detalle: string; hover: string }[] = [
  { scope: 'forward', titulo: 'Cambió ahora — actualizar de este mes en adelante', detalle: 'Los gastos históricos quedan como estaban.', hover: 'hover:border-(--brand-200) hover:bg-(--brand-soft)' },
  { scope: 'all', titulo: 'Me equivoqué — corregir todos los registros históricos', detalle: 'Todos los gastos con esta etiqueta se actualizan.', hover: 'hover:border-[#f1dfb4] hover:bg-(--warning-soft)' },
  { scope: 'none', titulo: 'Solo la etiqueta — no tocar los gastos registrados', detalle: 'El cambio aplica solo a nuevos gastos.', hover: 'hover:border-(--line-strong) hover:bg-(--surface-2)' },
]

/**
 * «¿Cómo aplicás el cambio?». Es un AlertDialog: un clic afuera NO lo cierra, porque la etiqueta ya
 * se guardó y falta decidir qué pasa con los gastos. Escape equivale a «solo la etiqueta».
 */
export function PropagarCambioDialog({ campos, guardando, onElegir, onCerrar }: {
  /** «el nombre», «el tipo a fijo»: lo que cambió, para la frase. */
  campos: string[]
  guardando: boolean
  onElegir: (scope: AlcancePropagacion) => void
  onCerrar: () => void
}) {
  return (
    <AlertDialog open onOpenChange={o => { if (!o && !guardando) onCerrar() }}>
      <AlertDialogContent className="sm:max-w-[460px]">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cómo aplicás el cambio?</AlertDialogTitle>
          <AlertDialogDescription>Cambiaste {campos.join(' y ')} de la etiqueta. ¿Qué hacemos con los gastos ya registrados?</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          {OPCIONES.map(o => (
            <button
              key={o.scope}
              type="button"
              disabled={guardando}
              onClick={() => onElegir(o.scope)}
              className={cn('flex w-full cursor-pointer flex-col gap-0.5 rounded-xl border border-border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60', o.hover)}
            >
              <b className="text-[13.5px] font-semibold">{o.titulo}</b>
              <span className="text-xs text-(--fg-muted)">{o.detalle}</span>
            </button>
          ))}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
