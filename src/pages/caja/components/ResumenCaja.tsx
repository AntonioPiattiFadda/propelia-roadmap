import { cn } from '@/lib/utils'
import { eur } from '../lib/monto'
import type { ResumenCaja as Resumen } from '../types'

function Tarjeta({ titulo, valor, sub, className }: { titulo: string; valor: string; sub: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card px-4 py-3.5', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-(--fg-muted)">{titulo}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums tracking-tight">{valor}</div>
      <div className="mt-0.5 text-xs text-(--fg-2)">{sub}</div>
    </div>
  )
}

/** Las cuatro tarjetas. «Por pagar» no dibuja «0 €» con los pendientes apagados: no es que no haya
    nada por pagar, es que no se están mirando. */
export function ResumenCaja({ resumen: r, conPendientes, cargando = false }: { resumen: Resumen; conPendientes: boolean; cargando?: boolean }) {
  // Mientras llegan los gastos del rango nuevo no hay cifras honestas: se atenúa y no se muestran.
  if (cargando) {
    return (
      <section className="grid grid-cols-2 gap-3 opacity-50 md:grid-cols-4" aria-busy>
        {['Total del período', 'Pagado', 'Por pagar', 'Fijos · Variables'].map(t => <Tarjeta key={t} titulo={t} valor="—" sub="Cargando…" />)}
      </section>
    )
  }
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tarjeta titulo="Total del período" valor={eur(r.total)} sub={`${r.nGastos} gastos`} />
      <Tarjeta titulo="Pagado" valor={eur(r.pagado)} sub={`${r.nPagados} gastos`} />
      {conPendientes ? (
        <Tarjeta
          titulo="Por pagar"
          valor={eur(r.porPagar)}
          sub={`${r.nPendientes} pendientes${r.nFijosSinPagar ? ` · ${r.nFijosSinPagar} fijos sin pagar` : ''}`}
          className={r.nPendientes ? 'border-[#f1dfb4] bg-(--warning-soft) [&_.tabular-nums]:text-[#8A5A0B]' : ''}
        />
      ) : (
        <Tarjeta titulo="Por pagar" valor="—" sub="Pendientes ocultos" className="[&_.tabular-nums]:text-(--fg-faint)" />
      )}
      <Tarjeta titulo="Fijos · Variables" valor={eur(r.fijos)} sub={`+ ${eur(r.variables)} variables`} />
    </section>
  )
}
