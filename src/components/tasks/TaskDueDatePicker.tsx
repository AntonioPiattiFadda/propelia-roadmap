import { useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DatePickerCalendar } from '@/components/ui/date-picker-calendar'

// due_date es date-only ('YYYY-MM-DD'): parsear/formatear siempre en local,
// nunca via new Date(string) (ver comentario en TaskList).
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface TaskDueDatePickerProps {
  value: string | null
  onSelect: (date: string | null) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}

// Popover de fecha para tareas sobre DatePickerCalendar. Sin hora ni botón
// guardar: due_date es date-only y elegir día aplica al toque.
export function TaskDueDatePicker({ value, onSelect, children, align = 'end' }: TaskDueDatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* `z-70` para quedar por encima de la pantalla de escritura de móvil (z-60): si no,
          el calendario se abre DEBAJO y parece que el botón no hace nada. En escritorio no
          cambia nada, ahí no hay nada tan alto. */}
      <PopoverContent className="z-70 w-auto p-0" align={align}>
        {/* El disparador es sólo un ícono de calendario, así que el título acá adentro
            es lo único que dice qué fecha se está eligiendo. */}
        <div className="border-b px-3 py-2 text-[11px] font-bold text-(--fg-muted)">
          Fecha de vencimiento
        </div>
        <DatePickerCalendar
          selected={value ? parseIsoDate(value) : undefined}
          onSelect={day => { onSelect(toIsoDate(day)); setOpen(false) }}
        />
        {value && (
          <div className="border-t px-3 py-2 flex justify-end">
            <button
              onClick={() => { onSelect(null); setOpen(false) }}
              className="text-xs text-muted-foreground hover:text-danger transition-colors"
            >
              Quitar fecha
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
