import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { localTodayIso, startOfMonthIso, startOfWeekIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useObjetivos } from '../hooks/useObjetivos'
import { escribirFiltros, filtrosDesdeUrl } from '../lib/leadFilterParams'
import type { Objetivo } from '../lib/objetivos'

const COLUMNAS: { k: Objetivo; label: string; title: string }[] = [
  { k: 'contestadas', label: 'Contestadas', title: 'Llamadas en las que hablaste con alguien de la inmobiliaria' },
  { k: 'decisores', label: 'Con decisor', title: 'De las contestadas, en cuántas hablaste con alguien que decide' },
  { k: 'noRespondidas', label: 'No respondidas', title: 'Llamadas que nadie atendió' },
  { k: 'demos', label: 'Demos agendadas', title: 'Demos que agendaste (cuenta el día en que se agendaron, no para cuándo son)' },
]

const numero = (n: number | undefined) => (
  <span className={cn('tabular-nums', n === undefined && 'text-(--fg-faint)')}>{n ?? '–'}</span>
)

/* Lo que registré HOY, en cuatro números: cuántas llamadas atendió alguien, cuántas de esas con un
   decisor, cuántas no respondieron y cuántas demos agendé. Cada número es un botón: filtra la lista a
   esos leads (`?objetivo=`) y otro clic lo saca. El rótulo «Objetivos hoy» abre los mismos números
   de hoy, de la semana (desde el lunes) y del mes corriente. */
export function ContadorDeLlamadas() {
  const [abierto, setAbierto] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const elegido = filtrosDesdeUrl(searchParams).objetivo
  const { data, isError } = useObjetivos(localTodayIso())
  if (isError) return null

  const alternar = (k: Objetivo) =>
    setSearchParams(prev => escribirFiltros(prev, { objetivo: elegido === k ? null : k }), { replace: true })

  return (
    <>
      <div role="group" aria-label="Objetivos de hoy"
        className="flex flex-wrap items-stretch overflow-hidden rounded-lg bg-card [border:1px_solid_var(--line)]">
        <button type="button" onClick={() => setAbierto(true)} title="Ver hoy, la semana y el mes"
          className="flex cursor-pointer items-center px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted) hover:bg-(--surface-2) hover:text-foreground">
          Objetivos hoy
        </button>
        {COLUMNAS.map(c => (
          <button key={c.k} type="button" aria-pressed={elegido === c.k}
            title={elegido === c.k ? 'Quitar el filtro' : `${c.title}. Tocá para ver esos leads.`}
            onClick={() => alternar(c.k)}
            className={cn(
              'flex cursor-pointer items-baseline gap-1.5 px-2.5 py-1 [border-left:1px_solid_var(--line)] hover:bg-(--surface-2)',
              elegido === c.k && 'bg-(--surface-2) shadow-[inset_0_-2px_0_var(--brand)]',
            )}>
            <span className="text-[15px] font-semibold text-foreground">{numero(data?.resumen[c.k])}</span>
            <span className={cn('text-[12px] text-(--fg-2)', elegido === c.k && 'font-semibold text-foreground')}>{c.label}</span>
          </button>
        ))}
      </div>
      <ObjetivosDialog open={abierto} onOpenChange={setAbierto} />
    </>
  )
}

function ObjetivosDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const hoy = localTodayIso()
  // Las tres se piden recién al abrir: la de hoy es la misma consulta que el contador y sale de la caché.
  const periodos = [
    { label: 'Hoy', q: useObjetivos(hoy, open) },
    { label: 'Esta semana', q: useObjetivos(startOfWeekIso(hoy), open) },
    { label: 'Este mes', q: useObjetivos(startOfMonthIso(hoy), open) },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Objetivos</DialogTitle>
          <DialogDescription>Tus llamadas y demos de hoy, acumuladas desde el lunes y en el mes corriente.</DialogDescription>
        </DialogHeader>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
              <th className="py-2 font-bold" />
              {COLUMNAS.map(c => <th key={c.k} title={c.title} className="px-2 py-2 text-right font-bold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {periodos.map(p => (
              <tr key={p.label} className="[border-top:1px_solid_var(--line-soft)]">
                <th scope="row" className="py-2.5 text-left font-semibold text-foreground">{p.label}</th>
                {COLUMNAS.map(c => (
                  <td key={c.k} className="px-2 py-2.5 text-right text-[15px] font-semibold text-foreground">
                    {p.q.isError ? <span className="text-(--fg-faint)">!</span> : numero(p.q.data?.resumen[c.k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  )
}
