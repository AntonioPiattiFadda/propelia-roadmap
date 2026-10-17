import { CalendarClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { horarioDeEspana, JORNADAS, type Horario, type TipoDeBloque } from '../lib/planningDiario'

/* NUEVO. El planning diario del SDR, a mano en la cabecera del CRM: es la jornada contra la que
   se trabaja la lista. Es texto fijo (lib/planningDiario.ts) y no un dato de la base. Hay dos,
   verano e invierno, y abre en la que rige hoy en España; la otra queda a una pestaña. */

const ESTILO: Record<TipoDeBloque, { caja: string; titulo: string; texto: string }> = {
  arranque: { caja: 'bg-blue-50 border border-blue-200', titulo: 'text-blue-700', texto: 'text-slate-700' },
  volumen: { caja: 'bg-blue-600', titulo: 'text-white', texto: 'text-blue-50' },
  tareas: { caja: 'bg-violet-600', titulo: 'text-white', texto: 'text-violet-50' },
  pausa: { caja: 'bg-slate-100 border border-slate-200', titulo: 'text-slate-500', texto: 'text-slate-500' },
  capacitacion: { caja: 'bg-orange-50 border border-orange-200', titulo: 'text-orange-700', texto: 'text-slate-700' },
  seguimiento: { caja: 'bg-emerald-50 border border-emerald-200', titulo: 'text-emerald-700', texto: 'text-slate-700' },
  revision: { caja: 'bg-slate-900', titulo: 'text-cyan-300', texto: 'text-slate-200' },
}

const OBJETIVOS = [
  { titulo: 'Conseguir demos', texto: 'cualificadas, con el decisor' },
  { titulo: 'Contactar decisores', texto: 'hablar con quien decide, no con el filtro' },
  { titulo: 'Nutrir cuentas', texto: 'cada lead avanzado, con su próxima acción' },
  { titulo: 'Cuidar la relación', texto: 'puntualidad, trato y seguimiento' },
  { titulo: 'CRM impecable', texto: 'si no está en el CRM, no pasó' },
]

const HORARIOS: Horario[] = ['verano', 'invierno']

function TablaDeJornada({ horario }: { horario: Horario }) {
  const j = JORNADAS[horario]
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2.5">
        <div>
          <p className="text-[15px] font-bold text-white">{j.titulo}</p>
          <p className="text-[11.5px] text-cyan-300">{j.bajada}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {j.metas.map(m => (
            <span key={m} className="rounded-md bg-blue-600 px-2 py-0.5 text-[11.5px] font-semibold text-white">{m}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[64px_64px_1fr] gap-x-3 bg-slate-50 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 max-sm:grid-cols-[56px_1fr]">
        <span>Venezuela</span>
        <span className="max-sm:hidden">España</span>
        <span>Bloque</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {j.bloques.map(b => {
          const e = ESTILO[b.tipo]
          return (
            <li key={b.vzla} className="grid grid-cols-[64px_64px_1fr] items-center gap-x-3 px-4 py-1.5 max-sm:grid-cols-[56px_1fr]">
              <span className="text-[14px] font-bold tabular-nums text-foreground">{b.vzla}</span>
              <span className="text-[12px] tabular-nums text-(--fg-muted) max-sm:hidden">{b.espana}</span>
              <div className={cn('rounded-md px-3 py-1.5', e.caja)}>
                <p className={cn('text-[13px] font-semibold', e.titulo)}>{b.titulo}</p>
                <p className={cn('text-[12px] leading-snug', e.texto)}>{b.texto}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function PlanningDiarioDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={CalendarClockIcon} size="xs" />
          <span className="max-md:hidden">Planning diario</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[1040px] max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:rounded-none">
        <DialogHeader>
          <DialogTitle>Planning diario 8 h · SDR Propelia</DialogTitle>
          <DialogDescription>
            Inicio fijo: 04:30 Venezuela · fin 13:00 · diferencia con España 6 h en verano, 5 h en invierno
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {OBJETIVOS.map(o => (
            <div key={o.titulo} className="rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 px-3 py-2">
              <p className="text-[13px] font-semibold text-white">{o.titulo}</p>
              <p className="text-[11.5px] leading-snug text-blue-50">{o.texto}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue={horarioDeEspana()}>
          <TabsList>
            {HORARIOS.map(h => (
              <TabsTrigger key={h} value={h}>{JORNADAS[h].titulo}</TabsTrigger>
            ))}
          </TabsList>
          {HORARIOS.map(h => (
            <TabsContent key={h} value={h}>
              <TablaDeJornada horario={h} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
