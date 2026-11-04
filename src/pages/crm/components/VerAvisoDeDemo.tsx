import { MailCheck, MailX } from 'lucide-react'
import { VerEmail } from '@/components/EmailPreviewDialog'
import { cn } from '@/lib/utils'
import { useAvisoPrendido, useDatosDelAvisoDeDemo } from '../hooks/useAvisoDeDemo'
import { assetsDeLosAvisos, deLaBandeja, destinatarioDelAviso, renderAvisoDeDemo, type AvisoDeDemo } from '../lib/emailDeAvisoDeDemo'

/* El renglón «… le llega un mail al cliente. Ver email» de los formularios de reunión con lead y de
   las dos cancelaciones (4/11/2026, por pedido): `VisitEmailPreview` de propelia-frontend, para las
   demos. Solo aparece si ese aviso está prendido por email en Ajustes › Avisos a leads. Usa el mismo
   render, firmante y destinatario que el dispatcher; sin email a donde mandarlo, lo dice.
   Reprogramada y cancelada salen solo si la agendada ya había salido (trigger
   `enqueue_demo_change_lead_notification`): desde acá no se sabe, por eso el «si». */

const LINEA: Record<AvisoDeDemo, string> = {
  demo_scheduled: 'Al agendar le llega un mail al cliente.',
  demo_rescheduled: 'Si al cliente le llegó la confirmación, al guardar recibe un mail con el nuevo horario.',
  demo_cancelled: 'Si al cliente le llegó la confirmación, recibe un mail avisando que se canceló la demo.',
}

const TITULO: Record<AvisoDeDemo, string> = {
  demo_scheduled: 'Así le llega el mail al cliente',
  demo_rescheduled: 'Así le llega el aviso de cambio de horario',
  demo_cancelled: 'Así le llega el aviso de cancelación',
}

/** Sin horario elegido, mañana a las 11: solo para que el mail tenga algo que mostrar. */
function inicioDeRelleno(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  return d.toISOString()
}

export function VerAvisoDeDemo({ tipo, leadId, responsableId, inicio, inicioAnterior, invitados, className }: {
  tipo: AvisoDeDemo
  leadId: string | null | undefined
  /** De quién es la reunión: firma el mail. Sin él, quien la agenda. */
  responsableId: string | null | undefined
  /** El horario que lleva el mail; null si todavía no se eligió. */
  inicio: string | null
  inicioAnterior?: string | null
  /** Los invitados por email de la reunión: el primero de afuera es el destinatario. */
  invitados: string[]
  className?: string
}) {
  const prendido = useAvisoPrendido(tipo)
  const { data } = useDatosDelAvisoDeDemo(leadId, prendido)
  if (!prendido || !data) return null

  const para = destinatarioDelAviso(invitados, data.cliente?.email, data.equipo.map(u => u.email ?? '').filter(Boolean))
  if (!para) {
    return (
      <p className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <MailX className="size-3.5 shrink-0" aria-hidden />
        La inmobiliaria no tiene email ni hay un invitado de afuera: no le llega el aviso.
      </p>
    )
  }

  const firmante = data.equipo.find(u => u.id === responsableId) ?? null
  const datos = {
    inicio: inicio ?? inicioDeRelleno(),
    inicioAnterior,
    inmobiliaria: data.cliente?.company_name ?? null,
    nombreDelCliente: data.cliente?.first_name ?? null,
    firmante,
    assets: assetsDeLosAvisos(window.location.origin),
  }
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
      <MailCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        {LINEA[tipo]}{' '}
        <VerEmail
          render={() => renderAvisoDeDemo(tipo, datos)}
          title={TITULO[tipo]}
          description={inicio ? 'Con el horario y los datos de esta reunión.' : 'Todavía no elegiste horario: se muestra uno de ejemplo.'}
          from={deLaBandeja(firmante)}
          to={para}
        />
      </span>
    </p>
  )
}
