import { useMemo } from 'react'
import { getWeekRange, toLocalYmd } from '@/lib/time'
import { buildAgendaEvents, groupEventsByDay } from '../lib/agendaEvents'
import { eventosEnHoraDeEspana, relojDeEspana } from '../lib/horaDeEspana'
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
  { showMeetings = true, showGoogleEvents = true, horaDeEspana = false }: {
    showMeetings?: boolean
    showGoogleEvents?: boolean
    /** La semana del reloj de España (el selector de la demo): cada evento cae en su día y hora de allá. */
    horaDeEspana?: boolean
  } = {},
) {
  const { start, end } = useMemo(() => getWeekRange(referenceDate), [referenceDate])
  const days = useMemo(() => diasDeLaSemana(start), [start])
  const isCurrentWeek = days.includes(horaDeEspana ? relojDeEspana(new Date()).ymd : toLocalYmd(new Date()))

  // En hora de España la semana de allá no calza con la local: se trae un día de más de cada lado
  // y `groupEventsByDay` deja afuera lo que no cae en estos siete días.
  const margen = horaDeEspana ? 86_400_000 : 0
  const desde = new Date(start.getTime() - margen).toISOString()
  const hasta = new Date(end.getTime() + margen).toISOString()
  const { data: meetings = [] } = useMeetingsInRange(desde, hasta)
  const { data: googleEvents = [] } = useGoogleAgenda(desde, hasta, true)

  const events = useMemo(() => {
    const todos = buildAgendaEvents(
      showMeetings ? meetings.map(m => ({ ...m, status: m.status as MeetingStatus })) : [],
      showGoogleEvents ? googleEvents : [],
    )
    return horaDeEspana ? eventosEnHoraDeEspana(todos) : todos
  }, [meetings, googleEvents, showMeetings, showGoogleEvents, horaDeEspana])
  const eventsByDay = useMemo(() => groupEventsByDay(events, days), [events, days])

  return { start, end, days, isCurrentWeek, meetings, eventsByDay }
}
