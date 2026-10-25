import { useSearchParams } from 'react-router-dom'
import { Bell, Check, ChevronDown, MailX, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUserSession } from '@/hooks/useUserSession'
import { useEmailsQueNoLlegaron, useMarcarEmailVisto } from '../hooks/useEmails'
import { useVerComo } from '../hooks/useVerComo'
import { cn } from '@/lib/utils'
import { avisosSinVer, cuandoSeMando, motivoLegible, noLlegaronDelLead, noLlego, rotuloDelEstado, sigueEnElPerfil } from '../lib/emails'
import { escribirLeadAbierto } from '../lib/leadFilterParams'
import type { CrmClient } from '../types'

/* Los emails que no llegaron (20/10/2026). El estado lo trae el webhook de Resend a `crm_emails`.
   Tres lugares: el toast de `useAvisosDeEmails` (una vez, esté donde esté), la campana de la
   cabecera (para quien lo mandó, con el número hasta que lo mire) y el cartel del lead (para
   cualquiera que abra el lead, siempre). */

/** Cuántos de los ya vistos siguen en la lista de la campana, para tener a mano lo reciente. */
const VISTOS_EN_LA_CAMPANA = 10

/** La campana de la cabecera del CRM: siempre a la vista, con el número rojo si hay algo sin ver.
 *  Lista tus envíos que no llegaron: primero los sin ver, después los últimos ya vistos, apagados. */
export function CampanaDeEmails() {
  // Con «Ver como», los envíos de la persona que se mira (lo ve como lo vería ella). El cartel del
  // lead, más abajo, no: ahí `yo` decide quién puede marcar «Listo», y eso es un permiso.
  const { perspectivaId: yo } = useVerComo()
  const emails = useEmailsQueNoLlegaron()
  const visto = useMarcarEmailVisto()
  const [, setSearchParams] = useSearchParams()
  const sinVer = avisosSinVer(emails.data ?? [], yo)
  const vistos = (emails.data ?? []).filter(e => e.sent_by === yo && noLlego(e) && e.seen_at).slice(0, VISTOS_EN_LA_CAMPANA)

  const abrir = (id: string, leadId: string | null) => {
    visto.mutate({ id })
    if (leadId) setSearchParams(prev => escribirLeadAbierto(prev, leadId), { replace: true })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative" aria-label={sinVer.length ? `Notificaciones: ${sinVer.length} sin ver` : 'Notificaciones'}
          title={sinVer.length ? `${sinVer.length} ${sinVer.length === 1 ? 'email no llegó' : 'emails no llegaron'}` : 'Notificaciones'}>
          <Icon icon={Bell} size="xs" />
          {sinVer.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
              {sinVer.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2 [border-bottom:1px_solid_var(--line)]">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-(--fg-muted)">Notificaciones</p>
          {sinVer.length > 1 && (
            <button type="button" onClick={() => sinVer.forEach(e => visto.mutate({ id: e.id }))}
              className="cursor-pointer text-[12px] font-medium text-(--fg-2) hover:text-foreground">Marcar todo como visto</button>
          )}
        </div>
        {sinVer.length + vistos.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-(--fg-muted)">Sin notificaciones. Si un email tuyo rebota o no sale, aparece acá.</p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto">
            {[...sinVer, ...vistos].map(e => {
              const nuevo = !e.seen_at
              const motivo = motivoLegible(e)
              const inmobiliaria = e.lead?.client?.company_name
              return (
                <li key={e.id} className={cn('relative [border-bottom:1px_solid_var(--line)] last:border-0', !nuevo && 'opacity-60')}>
                  <button type="button" onClick={() => abrir(e.id, e.lead_id)}
                    className="flex w-full cursor-pointer gap-2.5 px-3 py-2.5 pr-9 text-left hover:bg-(--surface-2)">
                    <MailX size={16} className={cn('mt-0.5 shrink-0', nuevo ? 'text-red-600' : 'text-(--fg-muted)')} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn('text-[13px] font-semibold', nuevo ? 'text-red-700' : 'text-(--fg-2)')}>
                        El email {rotuloDelEstado(e.status).toLowerCase()}{inmobiliaria ? ` · ${inmobiliaria}` : ''}
                      </span>
                      <span className="truncate text-[12.5px] text-foreground">{e.to_email}</span>
                      <span className="truncate text-[12px] text-(--fg-muted)">«{e.subject}» · {cuandoSeMando(e.sent_at)}</span>
                      {motivo && <span className="text-[12px] leading-snug text-(--fg-2)">{motivo}</span>}
                      {e.lead_id && <span className="text-[12px] font-medium text-[#0147FE]">Abrir lead</span>}
                    </span>
                  </button>
                  {nuevo && (
                    <button type="button" onClick={() => visto.mutate({ id: e.id })} title="Marcar como visto"
                      className="absolute right-2 top-2 grid size-6 cursor-pointer place-items-center rounded-md text-(--fg-muted) hover:bg-(--surface-2) hover:text-foreground">
                      <X size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** El cartel del perfil del lead, debajo de «Mensajes». Plegado de entrada (20/10/2026, por pedido):
 *  el título ya dice cuántos no llegaron, y desplegado ocupaba media columna del perfil. Cada línea
 *  lleva «Listo» (el mismo `seen_at` que apaga la campana): se pone gris, y con todas en gris el
 *  cartel entero deja de ser rojo. Marca quien lo mandó o quien escribe el lead (`crm_email_visto`). */
export function EmailsQueNoLlegaronDelLead({ leadId, client, puedeEscribir }: {
  leadId: string
  client: CrmClient | null
  puedeEscribir: boolean
}) {
  const { userSession } = useUserSession()
  const yo = userSession?.user.id ?? null
  const emails = useEmailsQueNoLlegaron()
  const visto = useMarcarEmailVisto()
  const fallidos = noLlegaronDelLead(emails.data ?? [], leadId)
  if (fallidos.length === 0) return null
  const pendientes = fallidos.filter(e => !e.seen_at).length
  const apagado = pendientes === 0
  return (
    <details className={cn('group mt-2 rounded-lg border px-3 py-2',
      apagado ? 'border-(--line) bg-(--surface-2)' : 'border-red-200 bg-red-50')}>
      <summary className={cn('flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold [&::-webkit-details-marker]:hidden',
        apagado ? 'text-(--fg-muted)' : 'text-red-700')}>
        <MailX size={14} />
        {fallidos.length === 1 ? 'Un email no llegó' : `${fallidos.length} emails no llegaron`}
        {apagado ? <span className="font-normal">· listo</span>
          : pendientes < fallidos.length && <span className="font-normal">· {pendientes} sin revisar</span>}
        <ChevronDown size={14} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {fallidos.map(e => {
          const listo = !!e.seen_at
          const motivo = motivoLegible(e)
          // El mismo corte que `crm_email_visto()`: quien lo mandó o quien escribe el lead.
          const puede = puedeEscribir || e.sent_by === yo
          return (
            <li key={e.id} className={cn('flex items-start gap-2 text-[12px] leading-snug', listo ? 'text-(--fg-muted)' : 'text-(--fg-2)')}>
              <span className="min-w-0 flex-1">
                <span className={cn('font-medium', !listo && 'text-foreground')}>{rotuloDelEstado(e.status)}</span>
                {' · '}<span className="break-all">{e.to_email}</span>{' · '}{cuandoSeMando(e.sent_at)}
                <span className="block text-(--fg-muted)">«{e.subject}»</span>
                {motivo && <span className="block">{motivo}</span>}
                {!listo && sigueEnElPerfil(e.to_email, client) && (
                  <span className="block font-medium text-red-700">Sigue cargada en el perfil: corregila o borrala.</span>
                )}
              </span>
              {puede && (
                <button type="button" onClick={() => visto.mutate({ id: e.id, visto: !listo })}
                  title={listo ? `Marcado como listo ${cuandoSeMando(e.seen_at!)}. Tocá para volver a dejarlo pendiente.` : 'Ya lo revisé'}
                  className={cn('inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium transition-colors',
                    listo ? 'text-(--fg-muted) hover:bg-(--surface) hover:text-foreground'
                      : 'border border-red-200 bg-white text-red-700 hover:bg-red-100')}>
                  {listo ? <><RotateCcw size={12} />Deshacer</> : <><Check size={12} />Listo</>}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
