import { useMemo } from 'react'
import { getWeekRange, toLocalYmd } from '@/lib/time'
import { buildAgendaEvents, groupEventsByDay } from '../lib/agendaEvents'
import type { MeetingStatus } from '../lib/meetings.types'
import { diasDeLaSemana } from '../lib/selectorDeHorario'
import { useMeetingsInRange } from './useMeetings'
import { useGoogleAgenda } from './useCalendarConnection'

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' })

/** «octubre de 2026», o «oct – noviembre de 2026» si la semana cruza de mes. */
export const weekTitle = (start: Date, end: Date): string => {
  if (start.getMonth() === end.getMonth()) return MONTH_LABEL.format(start)
  return `${MONTH_SHORT.format(start)} – ${MONTH_LABEL.format(end)}`
}

/* La semana de la Agenda (23/10/2026): los días, tus reuniones del CRM y el resto de tu Google,
   agrupados por día para `WeekGrid`. La usan la página /agenda y el «Seleccionar día y hora» del
   formulario de la reunión (`SelectorDeHorario`): un solo camino de datos para las dos. */
export function useSemanaDeAgenda(
  referenceDate: Date,
  { showMeetings = true, showGoogleEvents = true }: { showMeetings?: boolean; showGoogleEvents?: boolean } = {},
) {
  const { start, end } = useMemo(() => getWeekRange(referenceDate), [referenceDate])
  const days = useMemo(() => diasDeLaSemana(start), [start])
  const isCurrentWeek = days.includes(toLocalYmd(new Date()))

  const { data: meetings = [] } = useMeetingsInRange(start.toISOString(), end.toISOString())
  const { data: googleEvents = [] } = useGoogleAgenda(start.toISOString(), end.toISOString(), true)

  const events = useMemo(
    () =>
      buildAgendaEvents(
        showMeetings ? meetings.map(m => ({ ...m, status: m.status as MeetingStatus })) : [],
        showGoogleEvents ? googleEvents : [],
      ),
    [meetings, googleEvents, showMeetings, showGoogleEvents],
  )
  const eventsByDay = useMemo(() => groupEventsByDay(events, days), [events, days])

  return { start, end, days, isCurrentWeek, meetings, eventsByDay }
}
