import { CalendarClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { alturaDeBloque, horarioDeEspana, JORNADAS, type Horario, type TipoDeBloque } from '../lib/planningDiario'

/* NUEVO. El planning diario del SDR, a mano en la cabecera del CRM: es la jornada contra la que
   se trabaja la lista. Es texto fijo (lib/planningDiario.ts) y no un dato de la base. Hay dos,
   verano e invierno, y abre en la que rige hoy en España; la otra queda a una pestaña. */

const ESTILO: Record<TipoDeBloque, { caja: string; vzla: string; espana: string; titulo: string; duracion: string }> = {
  contactar: { caja: 'bg-blue-600', vzla: 'text-white', espana: 'text-blue-100', titulo: 'text-white', duracion: 'text-blue-50' },
  seguimiento: { caja: 'bg-slate-950', vzla: 'text-white', espana: 'text-slate-400', titulo: 'text-white', duracion: 'text-slate-300' },
  pausa: { caja: 'bg-slate-100 border border-slate-200', vzla: 'text-slate-600', espana: 'text-slate-400', titulo: 'text-slate-600', duracion: 'text-slate-500' },
  capacitacion: { caja: 'bg-cyan-50 border border-cyan-200 border-l-4 border-l-cyan-500', vzla: 'text-slate-900', espana: 'text-slate-500', titulo: 'text-cyan-700', duracion: 'text-slate-500' },
  revision: { caja: 'bg-white border-2 border-blue-600', vzla: 'text-slate-900', espana: 'text-slate-500', titulo: 'text-blue-600', duracion: 'text-slate-700' },
}

/* Venezuela, España, bloque, duración. El alto de cada fila sale de alturaDeBloque(): crece con
   la duración, pero no en proporción exacta (ver lib). */
const COLUMNAS = 'grid grid-cols-[52px_44px_1fr_auto] items-center gap-x-3 max-sm:grid-cols-[52px_1fr_auto]'

const HORARIOS: Horario[] = ['verano', 'invierno']

function TablaDeJornada({ horario }: { horario: Horario }) {
  const j = JORNADAS[horario]
  return (
    <div>
      <div className={cn(COLUMNAS, 'px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400')}>
        <span>Vzla</span>
        <span className="max-sm:hidden">España</span>
        <span className="truncate normal-case tracking-normal">{j.bajada}</span>
        <span />
      </div>
      <ul className="space-y-1">
        {j.bloques.map(b => {
          const e = ESTILO[b.tipo]
          return (
            <li
              key={b.vzla}
              style={{ height: alturaDeBloque(b.minutos) }}
              className={cn(COLUMNAS, 'rounded-md px-3', e.caja)}
            >
              <span className={cn('font-mono text-[14px] font-bold tabular-nums', e.vzla)}>{b.vzla}</span>
              <span className={cn('font-mono text-[12px] tabular-nums max-sm:hidden', e.espana)}>{b.espana}</span>
              <span className={cn('truncate text-[13.5px] font-semibold', e.titulo)}>{b.titulo}</span>
              <span className={cn('text-right font-mono text-[12px] tabular-nums', e.duracion)}>{b.duracion}</span>
            </li>
          )
        })}
      </ul>
      <div className={cn(COLUMNAS, 'px-3 pt-1.5 text-slate-400')}>
        <span className="font-mono text-[14px] font-bold tabular-nums">{j.fin.vzla}</span>
        <span className="font-mono text-[12px] tabular-nums max-sm:hidden">{j.fin.espana}</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest">Fin de jornada</span>
      </div>
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
      <DialogContent aria-describedby={undefined} className="max-h-[96dvh] gap-3 overflow-y-auto p-5 sm:max-w-[640px] max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:rounded-none">
        <DialogHeader>
          <DialogTitle>Planning diario 8 h · SDR Propelia</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={horarioDeEspana()} className="gap-2">
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
