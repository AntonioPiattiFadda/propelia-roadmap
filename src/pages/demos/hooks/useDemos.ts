import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useUserSession } from '@/hooks/useUserSession'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { enlaceAlCrm, escribirLeadAbierto } from '@/pages/crm/lib/leadFilterParams'
import { getDemos } from '../service/demos.service'
import { demosParaAvisar } from '../lib/demos'

/** Por si el canal de realtime se cae: así igual se entera en un minuto. */
const REFRESCO_MS = 60_000
/** El `created_at` más nuevo ya mirado en este navegador (ver `demosParaAvisar`). */
const CLAVE_MARCA = 'crm-demos-avisadas-hasta'

const fmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function useDemos(opciones: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: CRM_KEYS.demos, queryFn: getDemos,
    enabled: opciones.enabled,
    refetchInterval: opciones.refetchInterval,
    refetchIntervalInBackground: opciones.refetchInterval != null,
  })
}

function leerMarca(): string | null {
  try { return localStorage.getItem(CLAVE_MARCA) } catch { return null }
}

function guardarMarca(marca: string) {
  try { localStorage.setItem(CLAVE_MARCA, marca) } catch { /* storage bloqueado: avisaría de nuevo al recargar */ }
}

/* El aviso de demo nueva a los SUPERADMIN (20/10/2026, por pedido): un toast que no se va solo, con
   «Abrir lead», y la notificación del navegador si hay permiso (se pide desde la página Demos o al
   guardar una tarea con hora). Se monta en `AppLayout`, como las alarmas y los emails: avisa estés
   en la página que estés, pero solo con la app abierta en alguna pestaña — sin push, a propósito.
   Lo agendado con la app cerrada avisa al abrirla. El canal propio es porque fuera del CRM no hay
   realtime; adentro, `useCrmRealtime` también invalida esta key (cuelga de `['crm','reuniones']`). */
export function useAvisosDeDemos(activo: boolean) {
  const { userSession } = useUserSession()
  const yo = userSession?.user.id ?? null
  const demos = useDemos({ enabled: activo && !!yo, refetchInterval: REFRESCO_MS })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const ultimo = useRef({ location, navigate })
  useEffect(() => { ultimo.current = { location, navigate } })

  useEffect(() => {
    if (!activo) return
    const canal = supabase.channel(`demos-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_meetings' },
        () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.demos }) })
      .subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [activo, qc])

  useEffect(() => {
    if (!activo || !demos.data) return
    const { nuevas, marca } = demosParaAvisar(demos.data, leerMarca(), yo, new Date())
    guardarMarca(marca)
    for (const d of nuevas) {
      const leadId = d.lead_id
      const abrir = leadId ? () => {
        const { location: loc, navigate: nav } = ultimo.current
        if (loc.pathname === '/crm') nav({ pathname: '/crm', search: escribirLeadAbierto(new URLSearchParams(loc.search), leadId).toString() })
        else nav(enlaceAlCrm({ lead: leadId }))
      } : undefined
      const empresa = d.lead?.client?.company_name
      const titulo = `Nueva demo${empresa ? ` con ${empresa}` : ''}`
      const cuerpo = fmt.format(new Date(d.starts_at))
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(titulo, { body: cuerpo, tag: `demo-${d.id}` })
          n.onclick = () => { window.focus(); abrir?.(); n.close() }
        } catch { /* Android Chrome sin service worker: queda el toast */ }
      }
      toast.success(titulo, {
        description: cuerpo,
        duration: Infinity,
        closeButton: true,
        action: abrir ? { label: 'Abrir lead', onClick: abrir } : undefined,
      })
    }
  }, [activo, demos.data, yo])
}
