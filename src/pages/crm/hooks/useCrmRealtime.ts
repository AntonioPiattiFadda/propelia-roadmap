import { useEffect } from 'react'
import { useQueryClient, type InvalidateQueryFilters, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { cuandoEsteVisible } from '@/lib/pestanas'
import { supabase } from '@/lib/supabase'
import {
  RECARGAR, campoDelAviso, esLlamadaDe, leadsConCliente, leadsConComentario, leadsConLead, tareasConTarea,
  type AvisoRealtime, type Resultado,
} from '../lib/realtimeCrm'
import type { CrmLeadRow, CrmTask } from '../types'
import { CRM_KEYS } from './keys'

/* Un canal para todas las tablas publicadas del CRM. Realtime aplica la RLS: a cada uno le llega
   solo lo que ve.

   Desde el 24/11/2026 la lista de leads y las tareas pendientes NO se re-traen por cada aviso: el
   aviso se aplica sobre lo que ya está en la cache (`lib/realtimeCrm.ts`). Hasta ese día cada
   llamada registrada por una SDR hacía re-traer la lista entera en todas las pantallas abiertas, y
   con dos SDR registrando todo el día la base se saturaba (3,2 s de media por lista, hasta 8 s).
   Lo que no se puede deducir del aviso sí se re-trae, pero junto: las invalidaciones esperan
   `ESPERA_MS` de calma (como mucho `ESPERA_MAX_MS`) y salen todas juntas, sin repetir. */
const ESPERA_MS = 2_000
const ESPERA_MAX_MS = 6_000

type Pendientes = Map<string, InvalidateQueryFilters>

function encolador(qc: QueryClient) {
  const pendientes: Pendientes = new Map()
  let timer: ReturnType<typeof setTimeout> | undefined
  let primero = 0
  let esperandoVista: (() => void) | undefined

  /* Con la pestaña de fondo la tanda espera a que vuelva a estar a la vista (26/11/2026): con
     muchas pestañas abiertas, cada aviso se re-traía en todas. Lo pendiente se sigue juntando y
     sale una sola vez al volver. */
  const vaciar = () => {
    esperandoVista = undefined
    const filtros = [...pendientes.values()]
    pendientes.clear()
    for (const f of filtros) void qc.invalidateQueries(f)
  }
  const soltar = () => {
    timer = undefined
    primero = 0
    if (esperandoVista) return
    let yaCorrio = false
    const cancelar = cuandoEsteVisible(() => { yaCorrio = true; vaciar() })
    if (!yaCorrio) esperandoVista = cancelar
  }

  return {
    /** `clave` deduplica: dos avisos que piden lo mismo salen una vez. */
    encolar(clave: string, filtro: InvalidateQueryFilters) {
      pendientes.set(clave, filtro)
      if (esperandoVista) return // ya hay una tanda esperando la vista: se suma a esa
      const ahora = Date.now()
      if (!primero) primero = ahora
      if (timer) clearTimeout(timer)
      timer = setTimeout(soltar, Math.max(0, Math.min(ESPERA_MS, primero + ESPERA_MAX_MS - ahora)))
    },
    cerrar() { if (timer) clearTimeout(timer); esperandoVista?.() },
  }
}

export function useCrmRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const cola = encolador(qc)
    const recargar = (queryKey: QueryKey) => cola.encolar(JSON.stringify(queryKey), { queryKey })

    /** Aplica el aviso sobre la cache de `queryKey`. Si no se puede (o la query se está trayendo
     *  ahora y su respuesta pisaría el cambio), se re-trae en la próxima tanda. */
    function aplicar<T>(queryKey: QueryKey, cambio: (actual: T) => Resultado<T>) {
      const actual = qc.getQueryData<T>(queryKey)
      if (actual === undefined) return // nadie la pidió todavía: la primera lectura ya viene al día
      const r = cambio(actual)
      if (r === RECARGAR || qc.isFetching({ queryKey, exact: true }) > 0) return recargar(queryKey)
      if (r !== actual) qc.setQueryData<T>(queryKey, r)
    }

    /** El detalle abierto del lead del aviso; sin lead (un DELETE), todos. */
    const detalleDe = (a: AvisoRealtime) => {
      const leadId = campoDelAviso(a, 'lead_id')
      recargar(leadId ? CRM_KEYS.detalle(leadId) : CRM_KEYS.detalles)
    }

    /** El contador de llamadas de quien registró (o agendó); sin autor, todos. */
    const llamadasDe = (a: AvisoRealtime) => {
      const autor = campoDelAviso(a, 'created_by')
      if (!autor) return recargar(CRM_KEYS.llamadas)
      cola.encolar(`llamadas:${autor}`, { predicate: q => esLlamadaDe(q.queryKey, autor) })
    }

    const AL_AVISAR: Record<string, (a: AvisoRealtime) => void> = {
      crm_leads: a => {
        aplicar<CrmLeadRow[]>(CRM_KEYS.leads, l => leadsConLead(l, a))
        // El lead solo de la Agenda (`['crm','leads','uno',id]`) y el detalle abierto.
        const id = campoDelAviso(a, 'id')
        if (id) { recargar(CRM_KEYS.lead(id)); recargar(CRM_KEYS.detalle(id)) }
      },
      crm_clients: a => aplicar<CrmLeadRow[]>(CRM_KEYS.leads, l => leadsConCliente(l, a)),
      crm_tasks: a => {
        aplicar<CrmTask[]>(CRM_KEYS.tareasPendientes, t => tareasConTarea(t, a))
        detalleDe(a)
      },
      crm_comments: a => {
        // `leads`: la columna «Última actividad» sale del último comentario MANUAL.
        aplicar<CrmLeadRow[]>(CRM_KEYS.leads, l => leadsConComentario(l, a))
        detalleDe(a)
        llamadasDe(a)
      },
      crm_management_events: detalleDe,
      // `llamadas`: el contador de Objetivos cuenta también las demos agendadas.
      crm_meetings: a => {
        detalleDe(a)
        recargar(['crm', 'reuniones'])
        llamadasDe(a)
      },
      // El webhook de Resend cambia el estado: el rebote aparece en la campana sin recargar.
      crm_emails: () => recargar(CRM_KEYS.emails),
      // Un aviso nuevo del conector (o un «Listo» de otro) aparece sin recargar.
      crm_lead_avisos: () => recargar(CRM_KEYS.avisos),
      // Te dieron o te sacaron acceso: cambian las carteras Y lo que la RLS te deja leer.
      crm_data_access: () => {
        recargar(CRM_KEYS.accesos)
        recargar(CRM_KEYS.leads)
        recargar(CRM_KEYS.tareasPendientes)
      },
    }

    /* Topic único por montaje: `channel()` devuelve el canal existente si el topic se repite, y
       `removeChannel` es async, así que al pasar del CRM a Equipo el hook nuevo recibiría el canal
       que se está yendo y sus listeners se perderían (el realtime dejaría de andar sin avisar). */
    const canal = supabase.channel(`crm-${crypto.randomUUID()}`)
    for (const [tabla, alAvisar] of Object.entries(AL_AVISAR)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, payload => {
        alAvisar({ eventType: payload.eventType, new: payload.new ?? {}, old: payload.old ?? {} })
      })
    }
    /* Si el canal se cayó y volvió (la pestaña dormida, un corte de red), lo que pasó mientras
       tanto no llegó: se re-trae lo que se mantiene a mano. La primera suscripción no cuenta. */
    let suscripto = false
    canal.subscribe(estado => {
      if (estado !== 'SUBSCRIBED') return
      if (suscripto) { recargar(CRM_KEYS.leads); recargar(CRM_KEYS.tareasPendientes) }
      suscripto = true
    })
    return () => { cola.cerrar(); void supabase.removeChannel(canal) }
  }, [qc])
}
