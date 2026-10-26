import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DEMO_ORG_SLUG,
  getOrgInboundTargets,
  idealistaInboundAddress,
  sendSimulatedInboundEmail,
} from '@/service/inboundSimulation.service'
import { SIMULATED_INBOUND_EMAILS, type SimulatedInboundEmail } from './inboundSimulationEmails'

const NO_USER = '__org__'

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'error desconocido')

/**
 * Onboarding › Cargar la cartera, sólo en la org demo: manda mails de Idealista reales de Docta
 * (con datos de interesado inventados) a la dirección de inbound de un agente, para probar que
 * los leads entran y se vinculan a las propiedades importadas por código de anuncio.
 */
export function InboundSimulator({ organizationId }: { organizationId: string }) {
  const [userSlug, setUserSlug] = useState<string>(NO_USER)
  const [sent, setSent] = useState<Set<string>>(new Set())

  const targets = useQuery({
    queryKey: ['inbound-simulation-targets', organizationId],
    queryFn: () => getOrgInboundTargets(organizationId),
  })

  const send = useMutation({
    mutationFn: ({ email, to }: { email: SimulatedInboundEmail; to: string }) => sendSimulatedInboundEmail(to, email),
    onSuccess: (_, { email, to }) => {
      setSent(prev => new Set(prev).add(email.id))
      toast.success(`Mail enviado a ${to}. El lead aparece en unos segundos.`)
    },
    onError: (e) => toast.error(`No se pudo mandar el mail: ${errorMessage(e)}`),
  })

  if (targets.data?.orgSlug !== DEMO_ORG_SLUG) return null

  const to = idealistaInboundAddress(targets.data.orgSlug, userSlug === NO_USER ? null : userSlug)

  return (
    <div className="flex flex-col gap-3 rounded-md border border-(--line) p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon icon={Mail} size="md" />
        Simular mails de Idealista
      </div>
      <p className="text-xs text-muted-foreground">
        Mails reales que recibió Docta Capital, con interesados inventados. Entran por el webhook como
        cualquier mail de Idealista y se vinculan a la propiedad por el código del anuncio.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Agente:</span>
        <Select value={userSlug} onValueChange={setUserSlug}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_USER}>Sin agente (sólo la organización)</SelectItem>
            {targets.data.users.map(u => (
              <SelectItem key={u.slug} value={u.slug}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-mono text-muted-foreground">{to}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {SIMULATED_INBOUND_EMAILS.map(email => (
          <li key={email.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <div>{email.label}</div>
              <div className="truncate text-muted-foreground">{email.subject}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={send.isPending}
              onClick={() => send.mutate({ email, to })}
            >
              <Icon icon={sent.has(email.id) ? CheckCircle2 : Send} size="sm" />
              {sent.has(email.id) ? 'Reenviar' : 'Enviar'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
