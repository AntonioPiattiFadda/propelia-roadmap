import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useHighlightOnDeepLink } from '@/hooks/useHighlightOnDeepLink'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import {
  useBackfillMeetings,
  useBackfillableCount,
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleConnection,
} from '@/pages/agenda/hooks/useCalendarConnection'
import { registerCalendarWatch } from '@/pages/agenda/service/calendar.service'
import { MeetingsDebugCard } from './MeetingsDebugCard'
import { GoogleAgendaDebugCard } from './GoogleAgendaDebugCard'
import { DisconnectButton } from './DisconnectButton'

/* `IntegrationsPanel` de `propelia-frontend` (21/10/2026), con Google Calendar y nada más: Idealista
   y Fotocasa son del producto. La conexión es de cada uno, así que la pestaña es de todos; las
   dos tarjetas de prueba son solo SUPERADMIN, como allá. */
export function IntegrationsPanel() {
  const { esSuperadmin } = useCarteras()
  const { data: connection, isLoading: connectionLoading } = useGoogleConnection()
  const connectMutation = useConnectGoogle()
  const disconnectMutation = useDisconnectGoogle()
  const { data: backfillCount = 0 } = useBackfillableCount(connection?.status === 'active')
  const backfillMutation = useBackfillMeetings()
  const [searchParams, setSearchParams] = useSearchParams()
  const { ref: googleCardRef, highlighted: highlightGoogleCard } = useHighlightOnDeepLink<HTMLDivElement>('google-calendar')

  // Feedback one-shot del redirect del callback OAuth; limpia los params para no re-toastear.
  useEffect(() => {
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')
    if (!connected && !oauthError) return
    if (connected === 'google') {
      toast.success('Google Calendar conectado')
      registerCalendarWatch().catch(() => {}) // el cron diario lo levanta si esto falla
    }
    if (oauthError) toast.error(`No se pudo conectar Google Calendar (${oauthError})`)
    const next = new URLSearchParams(searchParams)
    next.delete('connected')
    next.delete('error')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          ref={googleCardRef}
          className={cn('transition-shadow duration-500', highlightGoogleCard && 'ring-2 ring-warning')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-4" />
              Google Calendar
            </CardTitle>
            <CardDescription>
              Conectá tu cuenta para registrar tus reuniones y demos directamente en tu calendario de Google, y ver tu agenda en la página Agenda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {connectionLoading ? (
              <div className="h-8 w-40 animate-pulse bg-secondary rounded" />
            ) : !connection ? (
              <Button size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                Conectar
              </Button>
            ) : connection.status === 'active' ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Conectado como <span className="font-medium text-foreground">{connection.connected_email}</span>
                </p>
                <div>
                  <DisconnectButton
                    serviceName="Google Calendar"
                    isPending={disconnectMutation.isPending}
                    onConfirm={() => disconnectMutation.mutateAsync(connection.id)}
                  />
                </div>
                {backfillCount > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => backfillMutation.mutate()}
                      disabled={backfillMutation.isPending}
                    >
                      Sincronizar {backfillCount} reunión{backfillCount === 1 ? '' : 'es'} existente{backfillCount === 1 ? '' : 's'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-warning">La conexión expiró o fue revocada.</p>
                <div>
                  <Button size="sm" onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                    Reconectar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Todo lo que está detrás de esSuperadmin va abajo, en su propia fila. El badge SA lo
          lleva cada card en su título. */}
      {esSuperadmin && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MeetingsDebugCard />
          <GoogleAgendaDebugCard />
        </div>
      )}
    </div>
  )
}
