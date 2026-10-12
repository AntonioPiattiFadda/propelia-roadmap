import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { eur } from '../lib/monto'
import { periodOf, tituloDePeriodo } from '../lib/periodos'
import { subtotalesPorMes } from '../lib/resumen'
import type { FilaCaja } from '../types'
import { FilaGasto } from './FilaGasto'

const claveDe = (f: FilaCaja) => f.gasto?.id ?? `${f.etiqueta?.id}:${f.period}`

export function ListaGastos({ filas, variosMeses, cargando, error, onPagar, onBorrar, onNuevo }: {
  filas: FilaCaja[]
  /** Separador por mes solo si el rango toca más de uno: en un mes solo, el título repetiría el selector. */
  variosMeses: boolean
  cargando: boolean
  error: boolean
  onPagar: (fila: FilaCaja) => void
  onBorrar: (gastoId: string) => void
  onNuevo: () => void
}) {
  if (error) {
    return <p role="alert" className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-danger">No se pudieron cargar los gastos. Probá de nuevo.</p>
  }
  if (cargando) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy>
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="border-t border-(--line-soft) px-4 py-3 first:border-t-0"><Skeleton className="h-9 w-full" /></div>)}
      </div>
    )
  }
  if (!filas.length) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-(--fg-muted)">
        <p className="mb-3.5">No hay gastos en este período.</p>
        <Button variant="outline" onClick={onNuevo}><Icon icon={PlusIcon} size="xs" />Nuevo gasto</Button>
      </div>
    )
  }
  const subtotales = new Map(subtotalesPorMes(filas).map(s => [s.period, s.total]))
  let mesActual: string | null = null
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {filas.map(f => {
        const p = periodOf(f.fecha)
        const separador = variosMeses && p !== mesActual
        mesActual = p
        return (
          <div key={claveDe(f)} className="border-t border-(--line-soft) first:border-t-0">
            {separador && (
              <div className="flex items-center justify-between bg-(--surface-2) px-4 py-2 text-xs font-semibold text-(--fg-2)">
                <span className="capitalize">{tituloDePeriodo(p)}</span>
                <span className="tabular-nums">{eur(subtotales.get(p) ?? 0)}</span>
              </div>
            )}
            <FilaGasto fila={f} onPagar={onPagar} onBorrar={onBorrar} />
          </div>
        )
      })}
    </section>
  )
}
