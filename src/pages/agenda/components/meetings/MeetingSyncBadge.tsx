import { AlertCircle, CalendarCheck2, Clock, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGoogleConnection } from '../../hooks/useCalendarConnection'
import { useRetryMeetingSync } from '../../hooks/useMeetings'
import type { Meeting } from '../../lib/meetings.types'

type Props = {
  meeting: Pick<Meeting, 'id' | 'sync_status' | 'sync_error'>
}

// `VisitSyncBadge` de `propelia-frontend` (21/10/2026). Solo informa a quien tiene calendario
// conectado; 'disabled' es invisible por diseño.
export function MeetingSyncBadge({ meeting }: Props) {
  const { data: connection } = useGoogleConnection()
  const retryMutation = useRetryMeetingSync()

  if (connection?.status !== 'active' || meeting.sync_status === 'disabled') return null

  if (meeting.sync_status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success" title="Sincronizada con Google Calendar">
        <CalendarCheck2 className="size-3.5" />
      </span>
    )
  }

  if (meeting.sync_status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Sincronización pendiente">
        <Clock className="size-3.5" />
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-danger" title={meeting.sync_error ?? 'Error de sincronización'}>
      <AlertCircle className="size-3.5" />
      <Button
        size="sm"
        variant="ghost"
        className="h-5 px-1"
        onClick={() => retryMutation.mutate(meeting.id)}
        disabled={retryMutation.isPending}
      >
        <RotateCw className="size-3" />
      </Button>
    </span>
  )
}
