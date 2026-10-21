import { useState } from 'react'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MeetingFormDialog } from '@/pages/agenda/components/meetings/MeetingFormDialog'
import { MeetingSyncBadge } from '@/pages/agenda/components/meetings/MeetingSyncBadge'
import { useCancelMeeting, useMyMeetings, useUpdateMeeting } from '@/pages/agenda/hooks/useMeetings'

const formatWhen = (iso: string): string =>
  new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

// Herramienta de smoke test del sync con Google Calendar (`VisitsDebugCard` del producto): crear
// cubre el insert, "+30 min" el patch y "Cancelar" el delete. Solo SUPERADMIN.
export function MeetingsDebugCard() {
  const [formOpen, setFormOpen] = useState(false)
  const { data: meetings = [] } = useMyMeetings()
  const updateMutation = useUpdateMeeting()
  const cancelMutation = useCancelMeeting()

  const latest = meetings.slice(-5).reverse()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Reuniones (debug)
          <SuperadminBadge />
        </CardTitle>
        <CardDescription>
          Crear, mover y cancelar reuniones de prueba para verificar la sincronización con Google Calendar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            Agendar reunión de prueba
          </Button>
        </div>
        {latest.length > 0 && (
          <ul className="flex flex-col gap-2">
            {latest.map((meeting) => (
              <li key={meeting.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{formatWhen(meeting.starts_at)}</span>
                <span>{meeting.status}</span>
                <MeetingSyncBadge meeting={meeting} />
                {meeting.status === 'scheduled' && (
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      disabled={updateMutation.isPending}
                      onClick={() =>
                        updateMutation.mutate({
                          id: meeting.id,
                          current: { ics_sequence: meeting.ics_sequence },
                          changes: {
                            startsAt: new Date(new Date(meeting.starts_at).getTime() + 30 * 60_000).toISOString(),
                            endsAt: new Date(new Date(meeting.ends_at).getTime() + 30 * 60_000).toISOString(),
                          },
                        })
                      }
                    >
                      +30 min
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs text-danger"
                      disabled={cancelMutation.isPending}
                      onClick={() =>
                        cancelMutation.mutate({ id: meeting.id, current: { ics_sequence: meeting.ics_sequence } })
                      }
                    >
                      Cancelar
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <MeetingFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </Card>
  )
}
