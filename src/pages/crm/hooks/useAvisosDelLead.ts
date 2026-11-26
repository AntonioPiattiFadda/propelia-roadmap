import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUserSession } from '@/hooks/useUserSession'
import { useSondeaDeFondo } from '@/lib/pestanas'
import { getAvisosPendientes, marcarAvisoListo } from '../service/email.service'
import { avisosPendientesPara, type AvisoDelLead } from '../lib/avisosDelLead'
import { enlaceAlCrm, escribirLeadAbierto } from '../lib/leadFilterParams'
import { CRM_KEYS } from './keys'

/* Avisos para la SDR (19/11/2026): una sola query para la campana, el cartel del lead y el toast,
   como los emails que no llegaron. Adentro del CRM la refresca el realtime (`crm_lead_avisos`);
   afuera, el `refetchInterval` del aviso global. */
export function useAvisosPendientes(opciones: { enabled?: boolean; refetchInterval?: number } = {}) {
  const deFondo = useSondeaDeFondo() // de fondo sondea una pestaña sola (`lib/pestanas.ts`)
  return useQuery({
    queryKey: CRM_KEYS.avisos, queryFn: getAvisosPendientes,
    enabled: opciones.enabled,
    refetchInterval: opciones.refetchInterval,
    refetchIntervalInBackground: opciones.refetchInterval != null && deFondo,
  })
}

/** «Listo» al toque, con «Deshacer» en el aviso; si la base dice que no, vuelve y lo avisa. */
export function useMarcarAvisoListo() {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: marcarAvisoListo,
    onMutate: async ({ id, listo = true }: { id: string; listo?: boolean }) => {
      await qc.cancelQueries({ queryKey: CRM_KEYS.avisos })
      const antes = qc.getQueryData<AvisoDelLead[]>(CRM_KEYS.avisos)
      qc.setQueryData<AvisoDelLead[]>(CRM_KEYS.avisos, lista => lista?.map(a => (a.id !== id ? a
        : { ...a, resuelto_at: listo ? new Date().toISOString() : null })))
      return { antes }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CRM_KEYS.avisos, ctx.antes)
      toast.error('No se pudo marcar el aviso')
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.avisos }) },
  })
  /** Marca «Listo» y ofrece deshacerlo. */
  const listo = (id: string) => {
    mutation.mutate({ id })
    toast.success('Aviso marcado como listo', {
      action: { label: 'Deshacer', onClick: () => mutation.mutate({ id, listo: false }) },
    })
  }
  return { listo, isPending: mutation.isPending }
}

/** Fuera del CRM no hay realtime: cada cuánto se pregunta si llegó un aviso. */
const REFRESCO_MS = 30_000
/** Los que ya sonaron, por navegador: recargar no vuelve a tirar el toast (la campana sigue). */
const CLAVE_AVISADOS = 'crm-avisos-avisados'

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

/* El toast de un aviso nuevo para mí, con «Abrir lead» y la notificación del navegador si ya hay
   permiso. Se monta en `AppLayout`, como el de los emails: suena aunque estés en otra página. Cada
   aviso suena una vez por navegador; la campana y el cartel del lead lo siguen mostrando hasta
   que alguien lo marca «Listo». */
export function useToastsDeAvisos(activo: boolean) {
  const { userSession } = useUserSession()
  const yo = userSession?.user.id ?? null
  const avisos = useAvisosPendientes({ enabled: activo && !!yo, refetchInterval: REFRESCO_MS })
  const navigate = useNavigate()
  const location = useLocation()
  const ultimo = useRef({ location, navigate })
  useEffect(() => { ultimo.current = { location, navigate } })

  useEffect(() => {
    if (!activo || !avisos.data) return
    const mios = avisosPendientesPara(avisos.data, yo)
    const avisados = leerAvisados()
    const nuevos = mios.filter(a => !avisados.has(a.id))
    // Se podan los que la base ya no trae (marcados «Listo»): la lista no crece para siempre.
    const vigentes = new Set([...avisados].filter(id => avisos.data.some(a => a.id === id)))
    for (const a of nuevos) {
      vigentes.add(a.id)
      const abrir = () => {
        const { location: loc, navigate: nav } = ultimo.current
        if (loc.pathname === '/crm') nav({ pathname: '/crm', search: escribirLeadAbierto(new URLSearchParams(loc.search), a.lead_id).toString() })
        else nav(enlaceAlCrm({ lead: a.lead_id }))
      }
      const inmobiliaria = a.lead?.client?.company_name
      const titulo = inmobiliaria ? `Aviso en ${inmobiliaria}` : 'Tenés un aviso en un lead'
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(titulo, { body: a.texto, tag: `aviso-${a.id}` })
          n.onclick = () => { window.focus(); abrir(); n.close() }
        } catch { /* Android Chrome sin service worker: queda el toast */ }
      }
      toast.warning(titulo, {
        description: a.texto,
        duration: Infinity,
        closeButton: true,
        action: { label: 'Abrir lead', onClick: abrir },
      })
    }
    guardarAvisados(vigentes)
  }, [activo, avisos.data, yo])
}
