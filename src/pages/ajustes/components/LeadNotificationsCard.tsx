import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  isLeadNotificationChannelAvailable,
  LEAD_NOTIFICATION_CHANNELS,
  LEAD_NOTIFICATION_EVENTS,
  type LeadNotificationChannel,
  type LeadNotificationEventDef,
  type LeadNotificationEventType,
} from '../lib/leadNotifications'
import { useUserSession } from '@/hooks/useUserSession'
import { cn } from '@/lib/utils'
import {
  type LeadNotificationPreferenceChange,
  listLeadNotificationPreferences,
  saveLeadNotificationPreferences,
} from '../service/leadNotificationPreferences.service'

const CHANNEL_META: Record<LeadNotificationChannel, { label: string; icon: LucideIcon }> = {
  email: { label: 'Email', icon: Mail },
  sms: { label: 'SMS', icon: MessageSquare },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
}

const GROUP_HINTS: Record<LeadNotificationEventDef['group'], string> = {
  Demos: 'se envían solos',
}

const isGroupStart = (i: number) => i === 0 || LEAD_NOTIFICATION_EVENTS[i - 1].group !== LEAD_NOTIFICATION_EVENTS[i].group

type Key = `${LeadNotificationEventType}|${LeadNotificationChannel}`
const keyOf = (eventType: LeadNotificationEventType, channel: LeadNotificationChannel): Key => `${eventType}|${channel}`
const usable = (ev: LeadNotificationEventDef, channel: LeadNotificationChannel) =>
  ev.configurable && isLeadNotificationChannelAvailable(channel)

const PREFERENCES_KEY = ['lead-notification-preferences']

/**
 * Ajustes → «Avisos a leads» (sólo SUPERADMIN). `LeadNotificationsCard` de `propelia-frontend`
 * (21/10/2026), con las demos en lugar de las visitas y sin el grupo «Propiedad». Tabla evento × vía
 * para todo el equipo. Los cambios se juntan y se guardan de una con la barra de abajo.
 */
export function LeadNotificationsCard() {
  const { userSession } = useUserSession()
  const user = userSession?.user
  const queryClient = useQueryClient()
  const { data: rows, isLoading: prefsLoading } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => listLeadNotificationPreferences(),
    enabled: !!user,
  })
  // Sólo lo que el admin tocó y difiere de lo guardado.
  const [draft, setDraft] = useState<Map<Key, boolean>>(new Map())

  const saved = useMemo(() => {
    const map = new Map<Key, boolean>()
    for (const r of rows ?? []) {
      if (r.enabled) map.set(keyOf(r.event_type as LeadNotificationEventType, r.channel as LeadNotificationChannel), true)
    }
    return map
  }, [rows])

  const isOn = (k: Key) => draft.get(k) ?? saved.get(k) ?? false
  const toggle = (k: Key) =>
    setDraft((prev) => {
      const next = new Map(prev)
      const value = !isOn(k)
      if (value === (saved.get(k) ?? false)) next.delete(k)
      else next.set(k, value)
      return next
    })

  const loading = prefsLoading || !user

  const save = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('No hay sesión')
      const changes: LeadNotificationPreferenceChange[] = [...draft].map(([k, enabled]) => {
        const [eventType, channel] = k.split('|') as [LeadNotificationEventType, LeadNotificationChannel]
        return { eventType, channel, enabled }
      })
      return saveLeadNotificationPreferences(changes, user.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY })
      setDraft(new Map())
      toast.success('Avisos guardados')
    },
    onError: (error: Error) => toast.error(error.message || 'No se pudieron guardar los avisos'),
  })

  if (loading) return <div className="h-24 animate-pulse bg-secondary rounded-lg" />

  return (
    <section className="flex flex-col gap-4 min-w-0 max-w-3xl">
      <div className="flex flex-col gap-1 max-w-xl">
        <h3 className="text-sm font-semibold">Avisos a leads</h3>
        <p className="text-xs text-muted-foreground">Qué le avisamos a las inmobiliarias y por dónde. Vale para todo el equipo.</p>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full min-w-105 border-separate border-spacing-0 text-xs">
          <thead className="bg-secondary">
            <tr>
              <th className="w-full px-3 py-2 text-left font-semibold border-b">Evento</th>
              {LEAD_NOTIFICATION_CHANNELS.map((channel) => (
                <th key={channel} className="px-3 py-2 font-semibold border-b">
                  <div className="flex flex-col items-center gap-1">
                    <Icon icon={CHANNEL_META[channel].icon} size="sm" />
                    {CHANNEL_META[channel].label}
                    {!isLeadNotificationChannelAvailable(channel) && (
                      <Badge variant="secondary" className="text-[10px]">Próximamente</Badge>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEAD_NOTIFICATION_EVENTS.map((ev, i) => (
              <Fragment key={ev.type}>
                {isGroupStart(i) && (
                  <tr>
                    <td
                      colSpan={LEAD_NOTIFICATION_CHANNELS.length + 1}
                      className="bg-secondary/60 px-3 py-1.5 text-[10px] text-muted-foreground border-b"
                    >
                      <span className="font-semibold uppercase tracking-wide">{ev.group}</span>
                      <span> · {GROUP_HINTS[ev.group]}</span>
                    </td>
                  </tr>
                )}
                <tr>
                  <td className={cn('px-3 py-2.5 border-b', !ev.configurable && 'text-muted-foreground')}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{ev.label}</span>
                      {!ev.configurable && <Badge variant="secondary" className="text-[10px]">Próximamente</Badge>}
                    </div>
                  </td>
                  {LEAD_NOTIFICATION_CHANNELS.map((channel) => {
                    const k = keyOf(ev.type, channel)
                    return (
                      <td key={channel} className="px-3 py-2.5 border-b text-center">
                        <ChannelPill
                          channel={channel}
                          pressed={isOn(k)}
                          dirty={draft.has(k)}
                          disabled={!usable(ev, channel) || save.isPending}
                          onClick={() => toggle(k)}
                          label={`${ev.label} por ${CHANNEL_META[channel].label}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {draft.size > 0 && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg"
        >
          <span className="text-xs">
            {draft.size} {draft.size === 1 ? 'cambio' : 'cambios'} sin guardar
          </span>
          <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => setDraft(new Map())}>
            Descartar
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </div>
      )}
    </section>
  )
}

function ChannelPill({
  channel,
  pressed,
  dirty,
  disabled,
  onClick,
  label,
}: {
  channel: LeadNotificationChannel
  pressed: boolean
  dirty?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-full border transition-colors',
        pressed ? 'bg-primary border-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:border-primary/50',
        disabled && 'opacity-40 cursor-not-allowed hover:border-border',
        dirty && 'ring-2 ring-primary/25',
      )}
      aria-pressed={pressed}
      aria-label={label}
      title={CHANNEL_META[channel].label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon icon={CHANNEL_META[channel].icon} size="sm" />
    </button>
  )
}
