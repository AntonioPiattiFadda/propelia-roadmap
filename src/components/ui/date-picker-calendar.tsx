import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { es } from 'react-day-picker/locale'
import type { Matcher } from 'react-day-picker'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

interface DatePickerCalendarProps {
  selected?: Date
  onSelect: (day: Date) => void
  disabled?: Matcher | Matcher[]
}

// Calendario + panel derecho con grilla de meses y navegación de año (mismo
// layout que el editor de fecha de entrega de pediclick). Pensado para montarse
// dentro de un PopoverContent: como Radix desmonta el contenido al cerrar, la
// vista se inicializa del valor seleccionado en cada apertura sin re-sync manual.
export function DatePickerCalendar({ selected, onSelect, disabled }: DatePickerCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const base = selected ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [rightYear, setRightYear] = useState(() => (selected ?? new Date()).getFullYear())

  function handleMonthChange(month: Date) {
    setViewMonth(month)
    setRightYear(month.getFullYear())
  }

  function handleDaySelect(day: Date | undefined) {
    if (!day) return
    setViewMonth(new Date(day.getFullYear(), day.getMonth(), 1))
    setRightYear(day.getFullYear())
    onSelect(day)
  }

  return (
    <div className="flex">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={handleDaySelect}
        month={viewMonth}
        onMonthChange={handleMonthChange}
        locale={es}
        disabled={disabled}
      />

      {/* Panel derecho: grilla de meses + año */}
      <div className="border-l flex flex-col w-36 p-3">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <button
            onClick={() => setRightYear(y => y - 1)}
            className="rounded p-0.5 hover:bg-muted text-muted-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-sm font-medium">{rightYear}</span>
          <button
            onClick={() => setRightYear(y => y + 1)}
            className="rounded p-0.5 hover:bg-muted text-muted-foreground"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => {
            const isActive =
              viewMonth.getMonth() === i && viewMonth.getFullYear() === rightYear
            return (
              <button
                key={m}
                onClick={() => setViewMonth(new Date(rightYear, i, 1))}
                className={cn(
                  'rounded py-1.5 text-xs transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                {m}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
