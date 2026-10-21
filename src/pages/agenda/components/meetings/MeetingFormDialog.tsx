import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MeetingFormContent, type EditableMeeting } from './MeetingFormContent'

/* `VisitFormDialog` de `propelia-frontend` (21/10/2026): el form de reunión en un modal centrado. */

export type { EditableMeeting }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId?: string
  assignedTo?: string
  defaultTitle?: string
  defaultDescription?: string
  guests?: { label: string }[]
  meeting?: EditableMeeting
}

export function MeetingFormDialog({ open, onOpenChange, meeting, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>{meeting ? 'Editar reunión' : 'Agendar reunión'}</DialogTitle>
        </DialogHeader>
        <MeetingFormContent open={open} onClose={() => onOpenChange(false)} meeting={meeting} {...rest} />
      </DialogContent>
    </Dialog>
  )
}
