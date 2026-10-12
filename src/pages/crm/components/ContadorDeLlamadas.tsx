import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { localTodayIso, shiftIsoDate, startOfMonthIso, startOfWeekIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCarteras } from '../hooks/useCarteras'
import { CRM_KEYS } from '../hooks/keys'
import { resumenDeLlamadas, type ResumenDeLlamadas } from '../lib/actividad'
import { metasDeActividad } from '../service/crm.service'

/** Medianoche LOCAL del día, en UTC: el día es el de quien mira, no el del servidor. */
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()

/** Las llamadas que registré desde el día `desde` hasta hoy inclusive, en tres números. */
function useLlamadasDesde(desde: string, activo = true) {
  const { myId } = useCarteras()
  const hasta = shiftIsoDate(localTodayIso(), 1)
  return useQuery({
    queryKey: CRM_KEYS.llamadasEntre(myId ?? '', desde, hasta),
    queryFn: async () => resumenDeLlamadas(await metasDeActividad(myId!, inicioDelDia(desde), inicioDelDia(hasta))),
    enabled: !!myId && activo,
  })
}

const COLUMNAS: { k: keyof ResumenDeLlamadas; label: string; title: string }[] = [
  { k: 'contestadas', label: 'Contestadas', title: 'Llamadas en las que hablaste con alguien de la inmobiliaria' },
  { k: 'decisores', label: 'Con decisor', title: 'De las contestadas, en cuántas hablaste con alguien que decide' },
  { k: 'noRespondidas', label: 'No respondidas', title: 'Llamadas que nadie atendió' },
]

const numero = (n: number | undefined) => (
  <span className={cn('tabular-nums', n === undefined && 'text-(--fg-faint)')}>{n ?? '–'}</span>
)

/* Las llamadas que registré HOY, en tres números: cuántas atendió alguien, cuántas de esas con un
   decisor y cuántas no respondieron. Son las mías y no las de las carteras que estoy mirando: el
   contador es el día de trabajo de quien llama. Sale de la meta de cada llamada (`resumenDeLlamadas`).
   El rótulo «Objetivos hoy» es un botón: abre los mismos tres números de hoy, de la semana (desde el
   lunes) y del mes corriente. */
export function ContadorDeLlamadas() {
  const [abierto, setAbierto] = useState(false)
  const hoy = localTodayIso()
  const { data, isError } = useLlamadasDesde(hoy)
  if (isError) return null

  return (
    <>
      <div role="group" aria-label="Llamadas de hoy"
        className="flex items-stretch overflow-hidden rounded-lg bg-card [border:1px_solid_var(--line)]">
        <button type="button" onClick={() => setAbierto(true)} title="Ver hoy, la semana y el mes"
          className="flex cursor-pointer items-center px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted) hover:bg-(--surface-2) hover:text-foreground">
          Objetivos hoy
        </button>
        {COLUMNAS.map(c => (
          <div key={c.k} title={c.title}
            className="flex items-baseline gap-1.5 px-2.5 py-1 [border-left:1px_solid_var(--line)]">
            <span className="text-[15px] font-semibold text-foreground">{numero(data?.[c.k])}</span>
            <span className="text-[12px] text-(--fg-2)">{c.label}</span>
          </div>
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
    { label: 'Hoy', q: useLlamadasDesde(hoy, open) },
    { label: 'Esta semana', q: useLlamadasDesde(startOfWeekIso(hoy), open) },
    { label: 'Este mes', q: useLlamadasDesde(startOfMonthIso(hoy), open) },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Objetivos</DialogTitle>
          <DialogDescription>Tus llamadas de hoy, acumuladas desde el lunes y en el mes corriente.</DialogDescription>
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
                    {p.q.isError ? <span className="text-(--fg-faint)">!</span> : numero(p.q.data?.[c.k])}
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
