import { useState } from 'react'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleAgendaDialog } from './GoogleAgendaDialog'

// Ver la agenda completa de Google Calendar (más allá de lo que el CRM sincronizó) para
// chequear disponibilidad real. Solo SUPERADMIN, como en el producto.
export function GoogleAgendaDebugCard() {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Agenda de Google (debug)
          <SuperadminBadge />
        </CardTitle>
        <CardDescription>Ver la agenda completa de la semana (lunes a domingo) en tu Google Calendar.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" onClick={() => setOpen(true)}>
          Ver agenda de la semana
        </Button>
      </CardContent>
      <GoogleAgendaDialog open={open} onOpenChange={setOpen} />
    </Card>
  )
}
