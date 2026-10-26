import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { toLocalYmd } from '@/lib/time'
import { minutesToPx, layoutOverlappingEvents, minutesToHHMM, type TimedEvent } from '../lib/weekGridLayout'
import { DAY_COLUMN_ATTR, slotAtPointer } from '../lib/gridPointer'
import type { AgendaEvent } from '../lib/agendaEvents'
import { relojDeEspana } from '../lib/horaDeEspana'
import { AgendaEventBlock } from './AgendaEventBlock'
import { GridSlotTooltip } from './GridSlotTooltip'

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12} ${period}`
})

const WEEKDAY_LABEL = new Intl.DateTimeFormat('es-ES', { weekday: 'short' })
const DEFAULT_TIME_GUTTER_PX = 56
const COMPACT_TIME_GUTTER_PX = 36
const SCROLL_TO_HOUR = 7

const minutesOfDay = (iso: string): number => {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
}

// Duración calculada por diferencia de timestamps (no por resta de "minutos del día"),
// para no romperse si start/end cruzan la medianoche.
const toTimedEvent = (event: AgendaEvent): TimedEvent => {
  const startMinutes = minutesOfDay(event.startIso)
  const durationMinutes = (new Date(event.endIso).getTime() - new Date(event.startIso).getTime()) / 60_000
  const endMinutes = Math.min(startMinutes + Math.max(durationMinutes, 15), 24 * 60)
  return { id: event.id, startMinutes, endMinutes }
}

type CreateAtParams = { ymd: string; startTime: string; endTime: string; clientX: number; clientY: number }

type Props = {
  days: string[]
  eventsByDay: Record<string, AgendaEvent[]>
  selectedYmd: string
  onCreateAt: (params: CreateAtParams) => void
  onEditMeeting: (event: AgendaEvent, clientX: number, clientY: number) => void
  /** Teléfono: columna de horas más angosta, para dejarle el ancho a los 7 días. */
  compact?: boolean
  /** Los eventos ya vienen en el reloj de España (`eventosEnHoraDeEspana`): el «hoy» y la línea de
   *  la hora actual también. */
  horaDeEspana?: boolean
}

const minutosDeAhora = (horaDeEspana: boolean): number => {
  const now = new Date()
  return horaDeEspana ? relojDeEspana(now).minutos : now.getHours() * 60 + now.getMinutes()
}

export function WeekGrid({ days, eventsByDay, selectedYmd, onCreateAt, onEditMeeting, compact = false, horaDeEspana = false }: Props) {
  const TIME_GUTTER_PX = compact ? COMPACT_TIME_GUTTER_PX : DEFAULT_TIME_GUTTER_PX
  const scrollRef = useRef<HTMLDivElement>(null)
  const todayYmd = horaDeEspana ? relojDeEspana(new Date()).ymd : toLocalYmd(new Date())
  const [nowMinutes, setNowMinutes] = useState(() => minutosDeAhora(horaDeEspana))

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = minutesToPx(SCROLL_TO_HOUR * 60)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(minutosDeAhora(horaDeEspana)), 30_000)
    return () => clearInterval(interval)
  }, [horaDeEspana])

  const dayColumns = useMemo(
    () =>
      days.map(day => {
        const dayEvents = eventsByDay[day] ?? []
        const allDayEvents = dayEvents.filter(event => event.isAllDay)
        const timedEvents = dayEvents.filter(event => !event.isAllDay)
        const eventsById = new Map(timedEvents.map(event => [event.id, event]))
        const positioned = layoutOverlappingEvents(timedEvents.map(toTimedEvent))
        return { day, allDayEvents, positioned, eventsById }
      }),
    [days, eventsByDay],
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 border rounded-lg overflow-hidden">
      <div className="flex border-b bg-background">
        <div style={{ width: TIME_GUTTER_PX }} className="shrink-0" />
        {days.map(day => {
          const isSelected = day === selectedYmd
          const date = new Date(`${day}T12:00:00`)
          return (
            <div key={day} className="flex-1 min-w-0 flex flex-col items-center py-2 border-l">
              <span className="text-[11px] text-muted-foreground uppercase">{WEEKDAY_LABEL.format(date)}</span>
              <span
                className={cn(
                  'text-sm w-7 h-7 flex items-center justify-center rounded-full',
                  day === todayYmd && !isSelected && 'ring-1 ring-inset ring-muted-foreground/50',
                  isSelected && 'bg-primary text-primary-foreground font-semibold',
                )}
              >
                {date.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {dayColumns.some(column => column.allDayEvents.length > 0) && (
        <div className="flex border-b bg-background">
          <div style={{ width: TIME_GUTTER_PX }} className="shrink-0" />
          {dayColumns.map(({ day, allDayEvents }) => (
            <div key={day} className="flex-1 min-w-0 flex flex-col gap-0.5 p-0.5 border-l">
              {allDayEvents.map(event => (
                <div
                  key={event.id}
                  className={cn(
                    'rounded-sm px-1 py-0.5 text-[11px] text-white truncate',
                    event.source === 'google' && 'opacity-55 border border-dashed border-white/80',
                  )}
                  style={{ backgroundColor: '#5484ed' }}
                  title={event.title}
                >
                  {event.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto relative">
        <div className="flex" style={{ height: minutesToPx(24 * 60) }}>
          <div style={{ width: TIME_GUTTER_PX }} className="shrink-0 relative">
            {HOUR_LABELS.map((label, hour) => (
              <div
                key={label}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: minutesToPx(hour * 60) }}
              >
                {hour === 0 ? '' : compact ? label.replace(' ', '') : label}
              </div>
            ))}
          </div>

          {dayColumns.map(({ day, positioned, eventsById }) => (
            <div
              key={day}
              {...{ [DAY_COLUMN_ATTR]: day }}
              className="flex-1 min-w-0 relative border-l cursor-pointer"
              onClick={(e) => {
                const { startMinutes, endMinutes } = slotAtPointer(e.currentTarget, e.clientY)
                onCreateAt({
                  ymd: day,
                  startTime: minutesToHHMM(startMinutes),
                  endTime: minutesToHHMM(endMinutes),
                  clientX: e.clientX,
                  clientY: e.clientY,
                })
              }}
            >
              {HOUR_LABELS.map((_, hour) => (
                <div key={hour} className="absolute inset-x-0 border-t border-border/60" style={{ top: minutesToPx(hour * 60) }} />
              ))}

              {positioned.map(pos => {
                const event = eventsById.get(pos.id)
                if (!event) return null
                return (
                  <AgendaEventBlock
                    key={pos.id}
                    event={event}
                    top={minutesToPx(pos.startMinutes)}
                    height={minutesToPx(pos.endMinutes - pos.startMinutes)}
                    left={(pos.column / pos.columns) * 100}
                    width={100 / pos.columns}
                    onEditClick={onEditMeeting}
                  />
                )
              })}

              {day === todayYmd && (
                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: minutesToPx(nowMinutes) }}>
                  <div className="relative">
                    <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-danger" />
                    <div className="border-t border-danger" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <GridSlotTooltip gridRef={scrollRef} />
    </div>
  )
}
