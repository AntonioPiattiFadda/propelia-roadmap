import { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useGoogleAgenda } from '@/pages/agenda/hooks/useCalendarConnection'
import { getWeekRange, toLocalYmd } from '@/lib/time'
import { groupAgendaByDay } from '@/pages/agenda/lib/googleAgenda'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

const DAY_LABEL = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
const TIME_LABEL = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

// Herramienta de debug (copiada del producto): agenda REAL de Google Calendar (no solo lo que el CRM sincronizó)
// para chequear disponibilidad. Por ahora semana fija lunes-domingo; el selector de semana
// con navegación se agrega después reusando getWeekRange con un offset.
export function GoogleAgendaDialog({ open, onOpenChange }: Props) {
  const { start, end, days } = useMemo(() => {
    const { start, end } = getWeekRange(new Date())
    const days = Array.from({ length: 7 }, (_, i) =>
      toLocalYmd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
    )
    return { start, end, days }
  }, [])

  const {
    data: events = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGoogleAgenda(start.toISOString(), end.toISOString(), open)
  const grouped = useMemo(() => groupAgendaByDay(events, days), [events, days])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle>Agenda de Google (lunes a domingo)</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando agenda…</p>}

        {isError && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-danger">{(error as Error)?.message ?? 'Error al traer la agenda'}</p>
            <div>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Reintentar
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !isError && (
          <ul className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
            {days.map((day) => (
              <li key={day}>
                <p className="text-sm font-medium capitalize">{DAY_LABEL.format(new Date(`${day}T12:00:00`))}</p>
                {grouped[day].length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-3">Sin eventos</p>
                ) : (
                  <ul className="flex flex-col gap-1 pl-3">
                    {grouped[day].map((event) => (
                      <li key={event.id} className="text-sm flex items-center gap-2">
                        <span className="text-muted-foreground shrink-0">
                          {event.isAllDay
                            ? 'Todo el día'
                            : `${TIME_LABEL.format(new Date(event.start))}–${TIME_LABEL.format(new Date(event.end))}`}
                        </span>
                        <span>{event.summary}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
