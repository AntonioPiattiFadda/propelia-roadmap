import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUserSession } from '@/hooks/useUserSession'
import { alarmasParaDisparar, claveDeAlarma, horaCorta, MINUTOS_DE_AVISO, podarAvisadas, horaEnVenezuela, textoVenezuela } from '../lib/alarmas'
import { enlaceAlCrm, escribirLeadAbierto } from '../lib/leadFilterParams'
import type { CrmLeadRow, CrmTask } from '../types'
import { CRM_KEYS } from './keys'
import { useTareasPendientes } from './useCrmLeads'

/* La alarma de las tareas con hora (17/10/2026, por pedido). Suena MIENTRAS EL CRM ESTÉ ABIERTO
   en alguna pestaña, aunque esté de fondo: sin push, sin service worker y sin cron, decidido así
   con Lorenzo. Con la app cerrada no suena nada. Se monta una vez en `AppLayout` (no en la página
   del CRM) para que siga sonando si uno se fue al Roadmap en la misma pestaña. */

/** Cada cuánto se mira el reloj. Con la pestaña de fondo el navegador lo estira hasta un minuto,
 *  que sigue entrando de sobra en los 5 de aviso. */
const TIC_MS = 20_000
/** Fuera del CRM no hay realtime: así se entera de una tarea que te agendaron en otra máquina. */
const REFRESCO_MS = 5 * 60_000
/** Las que ya sonaron, por navegador (como el resto de las preferencias de cada uno). Se lee en
 *  cada tic y no se guarda en memoria: con dos pestañas abiertas, la segunda ve lo que avisó la
 *  primera y no suena dos veces. */
const CLAVE_AVISADAS = 'crm-alarmas-avisadas'

function leerAvisadas(enMemoria: Set<string>): Set<string> {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_AVISADAS) ?? '[]') as unknown
    if (Array.isArray(crudo)) return new Set([...enMemoria, ...crudo.filter((c): c is string => typeof c === 'string')])
  } catch { /* storage bloqueado o basura: alcanza con lo de esta pestaña */ }
  return new Set(enMemoria)
}

function guardarAvisadas(claves: Set<string>, ahora: Date) {
  try { localStorage.setItem(CLAVE_AVISADAS, JSON.stringify(podarAvisadas([...claves], ahora))) } catch { /* idem */ }
}

/** Se pide en un gesto (guardar una tarea con hora): fuera de un clic el navegador lo rechaza solo.
 *  Sin permiso la alarma igual sale, como aviso adentro de la app. */
export function pedirPermisoDeAvisos() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  void Notification.requestPermission().then(p => {
    if (p === 'denied') toast.info('Sin permiso de notificaciones: la alarma va a salir solo adentro del CRM, con la pestaña abierta.')
  }).catch(() => { /* Safari viejo o el navegador no deja: queda el aviso adentro de la app */ })
}

export function useAlarmasDeTareas(activo: boolean) {
  const { userSession } = useUserSession()
  const myId = userSession?.user.id ?? null
  const tareasQ = useTareasPendientes({ enabled: activo && !!myId, refetchInterval: REFRESCO_MS })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()

  // El intervalo vive lo que vive el layout; lo que cambia entre tics se lee de acá.
  const ultimo = useRef({ tareas: [] as CrmTask[], myId, location, navigate })
  useEffect(() => {
    ultimo.current = { tareas: tareasQ.data ?? [], myId, location, navigate }
  })
  const enMemoria = useRef(new Set<string>())
  const ticAhora = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!activo) return
    const abrirLead = (leadId: string) => {
      const { location: loc, navigate: nav } = ultimo.current
      // Parado en el CRM se conservan los filtros que tenía puestos; desde otra página, el enlace.
      if (loc.pathname === '/crm') nav({ pathname: '/crm', search: escribirLeadAbierto(new URLSearchParams(loc.search), leadId).toString() })
      else nav(enlaceAlCrm({ lead: leadId }))
    }

    const tic = () => {
      const { tareas, myId: yo } = ultimo.current
      if (!yo) return
      const ahora = new Date()
      const avisadas = leerAvisadas(enMemoria.current)
      // Solo las mías: la lista trae todas las carteras que veo, y la alarma es de quien la hace.
      const sonar = alarmasParaDisparar(tareas.filter(t => t.assigned_to === yo), ahora, avisadas)
      if (sonar.length === 0) return
      const leads = qc.getQueryData<CrmLeadRow[]>(CRM_KEYS.leads)
      for (const t of sonar) {
        const clave = claveDeAlarma(t)
        avisadas.add(clave)
        enMemoria.current.add(clave)
        const inmobiliaria = t.lead_id ? leads?.find(l => l.id === t.lead_id)?.client?.company_name : null
        const titulo = `En ${MINUTOS_DE_AVISO} minutos: ${t.title}`
        // La hora de la tarea es de España; la de Venezuela va entre paréntesis.
        const ve = horaEnVenezuela(t.due_date, t.due_time)
        const cuando = horaCorta(t.due_time) && `A las ${horaCorta(t.due_time)} de España${ve ? ` (${textoVenezuela(ve)})` : ''}`
        const cuerpo = [cuando, inmobiliaria].filter(Boolean).join(' · ')
        const abrir = t.lead_id ? () => abrirLead(t.lead_id!) : undefined
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const n = new Notification(titulo, { body: cuerpo, tag: clave })
            n.onclick = () => { window.focus(); abrir?.(); n.close() }
          } catch { /* Android Chrome no deja `new Notification` sin service worker: queda el toast */ }
        }
        // El toast va siempre: es lo que se ve si el permiso se negó, y no se va solo — sonó
        // para que alguien lo lea.
        toast(titulo, {
          description: cuerpo || undefined,
          duration: Infinity,
          closeButton: true,
          action: abrir ? { label: 'Abrir lead', onClick: abrir } : undefined,
        })
      }
      guardarAvisadas(avisadas, ahora)
    }

    ticAhora.current = tic
    const id = window.setInterval(tic, TIC_MS)
    return () => { window.clearInterval(id); ticAhora.current = null }
  }, [activo, qc])

  // Cada vez que llegan las tareas no se espera al próximo tic: entrar a las 10:26, o agendar una
  // para dentro de 3 minutos, avisa ya. Va después de los otros dos efectos: `ultimo` ya está al día.
  const cargadas = tareasQ.data
  useEffect(() => {
    if (cargadas) ticAhora.current?.()
  }, [cargadas])
}
