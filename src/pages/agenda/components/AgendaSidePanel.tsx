import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { toLocalYmd } from '@/lib/time'
import { buildMiniCalendarGrid } from '../lib/miniCalendar'

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type Props = {
  open: boolean
  selectedYmd: string
  onSelectDay: (ymd: string) => void
  showMeetings: boolean
  onToggleMeetings: (checked: boolean) => void
  showGoogleEvents: boolean
  onToggleGoogleEvents: (checked: boolean) => void
  className?: string
}

// Panel propio de /agenda (no es el nav principal; copiado de `propelia-frontend`): mini-calendario para saltar
// de semana + filtros de qué mostrar en el grid. El toggle hamburguesa+crear vive flotando
// en Agenda.tsx (position absolute), por eso acá dejamos un padding-top que lo esquiva.
// El ancho anima al abrir/cerrar en vez de aparecer/desaparecer de golpe.
export function AgendaSidePanel({
  open,
  selectedYmd,
  onSelectDay,
  showMeetings,
  onToggleMeetings,
  showGoogleEvents,
  onToggleGoogleEvents,
  className,
}: Props) {
  // El mes arranca en el mes del día seleccionado (ej. al llegar por /agenda?date=...),
  // pero después se navega independiente con las flechas — no se resincroniza solo.
  const [monthReference, setMonthReference] = useState(() => new Date(`${selectedYmd}T12:00:00`))
  const todayYmd = toLocalYmd(new Date())
  const grid = buildMiniCalendarGrid(monthReference)

  const shiftMonth = (delta: number) =>
    setMonthReference(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col gap-4 overflow-hidden transition-[width] duration-200 ease-in-out',
        open ? 'w-64 border-r border-border p-3 pt-14' : 'w-0 p-0',
        className,
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium capitalize">{MONTH_LABEL.format(monthReference)}</span>
          <div className="flex items-center">
            <Button size="icon" variant="ghost" className="size-6" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => shiftMonth(1)}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAY_INITIALS.map(label => (
            <span key={label} className="text-[10px] text-muted-foreground">
              {label}
            </span>
          ))}
          {grid.map(day => (
            <button
              key={day.ymd}
              onClick={() => onSelectDay(day.ymd)}
              className={cn(
                'text-xs h-6 w-6 mx-auto rounded-full flex items-center justify-center',
                !day.isCurrentMonth && 'text-muted-foreground/40',
                day.ymd === todayYmd && day.ymd !== selectedYmd && 'ring-1 ring-inset ring-muted-foreground/50',
                day.ymd === selectedYmd && 'bg-primary text-primary-foreground font-semibold',
              )}
            >
              {day.dayOfMonth}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Mis reuniones</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={showMeetings} onCheckedChange={checked => onToggleMeetings(checked === true)} />
          Reuniones del CRM
        </label>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Google (solo lectura)</p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={showGoogleEvents} onCheckedChange={checked => onToggleGoogleEvents(checked === true)} />
          Resto de tu agenda de Google
        </label>
      </div>
    </div>
  )
}
