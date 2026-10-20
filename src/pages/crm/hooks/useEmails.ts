import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUserSession } from '@/hooks/useUserSession'
import { getEmailsQueNoLlegaron, getEstadoDeEnvio, marcarEmailVisto, type EmailQueNoLlego } from '../service/email.service'
import { avisosSinVer, estadoDelEnvio, motivoLegible, rotuloDelEstado } from '../lib/emails'
import { enlaceAlCrm, escribirLeadAbierto } from '../lib/leadFilterParams'
import { CRM_KEYS } from './keys'

/* Una sola query para la campana, el cartel del lead y el aviso global: son pocos, y cada uno filtra
   lo suyo con las funciones de `lib/emails.ts`. Adentro del CRM la refresca el realtime
   (`crm_emails`); afuera, el `refetchInterval` del aviso global. */
export function useEmailsQueNoLlegaron(opciones: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: CRM_KEYS.emailsQueNoLlegaron, queryFn: getEmailsQueNoLlegaron,
    enabled: opciones.enabled,
    refetchInterval: opciones.refetchInterval,
    refetchIntervalInBackground: opciones.refetchInterval != null,
  })
}

/** El estado de un envío recién hecho. Pregunta cada 4 s hasta que Resend lo cierra (entregado o
 *  no llegó): el realtime también lo trae, esto es por si el canal tarda o se cayó. */
export function useEstadoDeEnvio(resendId: string | null) {
  return useQuery({
    queryKey: CRM_KEYS.envio(resendId ?? ''),
    queryFn: () => getEstadoDeEnvio(resendId!),
    enabled: !!resendId,
    refetchInterval: q => (estadoDelEnvio(q.state.data?.status ?? null).final ? false : 4000),
  })
}

/** Marca «Listo» (o lo deshace) al toque; si la base dice que no, vuelve y lo avisa. */
export function useMarcarEmailVisto() {
  const qc = useQueryClient()
  const { userSession } = useUserSession()
  const yo = userSession?.user.id ?? null
  return useMutation({
    mutationFn: marcarEmailVisto,
    onMutate: async ({ id, visto = true }: { id: string; visto?: boolean }) => {
      await qc.cancelQueries({ queryKey: CRM_KEYS.emailsQueNoLlegaron })
      const antes = qc.getQueryData<EmailQueNoLlego[]>(CRM_KEYS.emailsQueNoLlegaron)
      qc.setQueryData<EmailQueNoLlego[]>(CRM_KEYS.emailsQueNoLlegaron, lista => lista?.map(e => (e.id !== id ? e
        : visto ? { ...e, seen_at: e.seen_at ?? new Date().toISOString(), seen_by: e.seen_by ?? yo }
        : { ...e, seen_at: null, seen_by: null })))
      return { antes }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CRM_KEYS.emailsQueNoLlegaron, ctx.antes)
      toast.error('No se pudo marcar el email')
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.emailsQueNoLlegaron }) },
  })
}

/** Fuera del CRM no hay realtime: cada cuánto se pregunta si rebotó algo. */
const REFRESCO_MS = 30_000
/** Los que ya avisaron, por navegador: recargar no vuelve a tirar el toast (la campana sigue). */
const CLAVE_AVISADOS = 'crm-emails-avisados'

function leerAvisados(): Set<string> {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_AVISADOS) ?? '[]') as unknown
    if (Array.isArray(crudo)) return new Set(crudo.filter((c): c is string => typeof c === 'string'))
  } catch { /* storage bloqueado o basura */ }
  return new Set()
}

function guardarAvisados(ids: Set<string>) {
  try { localStorage.setItem(CLAVE_AVISADOS, JSON.stringify([...ids])) } catch { /* idem */ }
}

/* El aviso de que un mail tuyo no llegó (20/10/2026): un toast que no se va solo, con «Abrir lead»,
   y la notificación del navegador si ya hay permiso (lo pide la alarma de tareas). Se monta en
   `AppLayout`, como las alarmas: avisa aunque el dialog esté cerrado o estés en el Roadmap. Cada
   envío avisa una vez por navegador; la campana del CRM lo sigue mostrando hasta que lo veas. */
export function useAvisosDeEmails(activo: boolean) {
  const { userSession } = useUserSession()
  const yo = userSession?.user.id ?? null
  const emails = useEmailsQueNoLlegaron({ enabled: activo && !!yo, refetchInterval: REFRESCO_MS })
  const visto = useMarcarEmailVisto()
  const navigate = useNavigate()
  const location = useLocation()
  const ultimo = useRef({ location, navigate, visto })
  useEffect(() => { ultimo.current = { location, navigate, visto } })

  useEffect(() => {
    if (!activo || !emails.data) return
    const sinVer = avisosSinVer(emails.data, yo)
    const avisados = leerAvisados()
    const nuevos = sinVer.filter(e => !avisados.has(e.id))
    // Se podan los que ya se vieron: la lista no crece para siempre.
    const vigentes = new Set([...avisados].filter(id => sinVer.some(e => e.id === id)))
    for (const e of nuevos) {
      vigentes.add(e.id)
      const abrir = e.lead_id ? () => {
        const { location: loc, navigate: nav, visto: v } = ultimo.current
        v.mutate({ id: e.id })
        if (loc.pathname === '/crm') nav({ pathname: '/crm', search: escribirLeadAbierto(new URLSearchParams(loc.search), e.lead_id!).toString() })
        else nav(enlaceAlCrm({ lead: e.lead_id! }))
      } : undefined
      const titulo = `Tu email a ${e.to_email}: ${rotuloDelEstado(e.status).toLowerCase()}`
      const cuerpo = [e.lead?.client?.company_name, motivoLegible(e)].filter(Boolean).join(' · ')
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(titulo, { body: cuerpo, tag: `email-${e.id}` })
          n.onclick = () => { window.focus(); abrir?.(); n.close() }
        } catch { /* Android Chrome sin service worker: queda el toast */ }
      }
      toast.error(titulo, {
        description: cuerpo || undefined,
        duration: Infinity,
        closeButton: true,
        action: abrir ? { label: 'Abrir lead', onClick: abrir } : undefined,
      })
    }
    guardarAvisados(vigentes)
  }, [activo, emails.data, yo])
}
