import { useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { todayLocal } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useClaudeToni, useGuardarClaudeToni } from '../hooks/useClaudeToni'
import { alternarPagado, conNota, mesCorto, mesesClaudeToni, MONTO_CLAUDE_TONI } from '../lib/claudeToni'
import { eur } from '../lib/monto'
import { periodOf, tituloDePeriodo } from '../lib/periodos'

/* «Claude Toni · extra empresa»: qué meses le transfirió Toni a Lorenzo por Claude. Una caja chica
   a la derecha de la lista: es plata entre ellos y no suma a nada de la Caja de la empresa. Cada
   mes es un tilde; el pagado lleva además una nota de cuándo o cómo se pagó. */
export function ClaudeToni({ className }: { className?: string }) {
  const { data, isPending, isError } = useClaudeToni()
  const guardar = useGuardarClaudeToni()
  const mesActual = periodOf(todayLocal())
  const pagados = useMemo(() => data ?? {}, [data])
  const meses = useMemo(() => mesesClaudeToni(pagados, mesActual), [pagados, mesActual])

  return (
    <section className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <header className="border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold text-foreground">Claude Toni · extra empresa</h2>
        <p className="text-[11px] text-(--fg-muted)">No suma a la caja de la empresa</p>
      </header>
      {isPending ? (
        <Skeleton className="m-3 h-16" />
      ) : isError ? (
        <p role="alert" className="px-3 py-2.5 text-xs text-danger">No se pudieron cargar los pagos.</p>
      ) : (
        <ul className="divide-y divide-border">
          {meses.map(({ period, pagado, nota }) => {
            // El corto se ve; el largo («octubre de 2026») es el que leen los lectores de pantalla.
            const mes = tituloDePeriodo(period)
            return (
              <li key={period} className="flex flex-col gap-1 px-3 py-1.5 text-xs">
                <div className="flex min-h-5 items-center gap-2">
                  <Checkbox checked={pagado} aria-label={`Pagado ${mes}`}
                    onCheckedChange={() => guardar.mutate(alternarPagado(pagados, period))} />
                  <span className="flex-1 truncate" title={mes}>{mesCorto(period)}</span>
                  <span className="tabular-nums text-(--fg-2)">{eur(MONTO_CLAUDE_TONI)}</span>
                </div>
                {pagado && (
                  <NotaDelMes
                    key={nota} nota={nota} mes={mes}
                    onGuardar={texto => guardar.mutate(conNota(pagados, period, texto))}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* La nota de un mes pagado. Se guarda al salir del campo o con Enter, no tecla por tecla; Escape
   vuelve a lo guardado. El `key` con la nota guardada la reinicia cuando cambia desde afuera. */
function NotaDelMes({ nota, mes, onGuardar }: {
  nota: string
  mes: string
  onGuardar: (texto: string) => void
}) {
  const [borrador, setBorrador] = useState(nota)
  const confirmar = () => { if (borrador.trim() !== nota) onGuardar(borrador) }
  return (
    <input
      type="text"
      value={borrador}
      aria-label={`Cuándo se pagó ${mes}`}
      placeholder="¿Cuándo se pagó?"
      onChange={ev => setBorrador(ev.target.value)}
      onBlur={confirmar}
      onKeyDown={ev => {
        if (ev.key === 'Enter') ev.currentTarget.blur()
        if (ev.key === 'Escape') setBorrador(nota)
      }}
      className="ml-6 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-(--fg-2) placeholder:text-(--fg-faint) hover:border-border focus:border-border focus:outline-none"
    />
  )
}
