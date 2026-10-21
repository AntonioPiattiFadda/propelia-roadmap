import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useGoogleConnection } from '../../hooks/useCalendarConnection'
import { useCancelMeeting } from '../../hooks/useMeetings'
import { notifyNoGoogleConnection } from '../../lib/googleConnectionToast'
import type { Meeting } from '../../lib/meetings.types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  meeting: Pick<Meeting, 'id' | 'ics_sequence' | 'sync_status'>
  /** Se dispara sólo si la cancelación se guardó — la agenda lo usa para cerrar el form de atrás. */
  onCancelled?: () => void
  /** z-index del velo Y del contenido juntos. Radix dibuja en z-50; abierto desde el popover
   * de la agenda (z-index 250) quedaría debajo sin subirlo. */
  zIndexClassName?: string
}

/** Confirmación de cancelar una reunión (Google les avisa a los invitados y borra el evento).
 * `CancelVisitDialog` de `propelia-frontend` (21/10/2026). Lo usa el form de la agenda. */
export function CancelMeetingDialog({ open, onOpenChange, meeting, onCancelled, zIndexClassName }: Props) {
  const [reason, setReason] = useState('')
  const navigate = useNavigate()
  const { data: connection } = useGoogleConnection()
  const cancelMutation = useCancelMeeting()

  const handleOpenChange = (next: boolean) => {
    if (next) setReason('')
    onOpenChange(next)
  }

  const handleConfirm = () => {
    const neverSynced = meeting.sync_status === 'disabled' || meeting.sync_status === 'error'
    if (neverSynced && connection?.status !== 'active') {
      notifyNoGoogleConnection(navigate)
    }
    cancelMutation.mutate(
      { id: meeting.id, current: { ics_sequence: meeting.ics_sequence }, reason: reason.trim() || null },
      { onSuccess: () => onCancelled?.() },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className={cn(zIndexClassName)} overlayClassName={cn(zIndexClassName)}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar esta reunión?</AlertDialogTitle>
          <AlertDialogDescription>
            Google les avisa a los invitados y se borra el evento de Google Calendar si estaba sincronizado. Queda en el historial del lead como cancelada, con el motivo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (opcional)"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Cancelar reunión
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
