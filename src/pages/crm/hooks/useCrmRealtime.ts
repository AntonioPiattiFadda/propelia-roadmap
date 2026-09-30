import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CRM_KEYS } from './keys'

/* Un canal para todas las tablas publicadas del CRM. No aplica el cambio: invalida la query que
   corresponde y TanStack re-trae. Un eco de lo propio re-trae lo mismo que la mutación ya puso,
   y no pisa nada porque los campos de texto guardan al salir (blur), como en el producto.
   Realtime aplica la RLS: a cada uno le llega solo lo que ve. */
const TABLAS: Record<string, QueryKey[]> = {
  crm_leads: [CRM_KEYS.leads, CRM_KEYS.detalles],
  crm_clients: [CRM_KEYS.leads],
  crm_tasks: [CRM_KEYS.tareasPendientes, CRM_KEYS.detalles],
  crm_comments: [CRM_KEYS.detalles],
  crm_management_events: [CRM_KEYS.detalles],
  crm_meetings: [CRM_KEYS.detalles, ['crm', 'reuniones']],
  // Te dieron o te sacaron acceso: cambian las carteras Y lo que la RLS te deja leer.
  crm_data_access: [CRM_KEYS.accesos, CRM_KEYS.leads, CRM_KEYS.tareasPendientes],
}

export function useCrmRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    /* Topic único por montaje: `channel()` devuelve el canal existente si el topic se repite, y
       `removeChannel` es async, así que al pasar del CRM a Equipo el hook nuevo recibiría el canal
       que se está yendo y sus listeners se perderían (el realtime dejaría de andar sin avisar). */
    const canal = supabase.channel(`crm-${crypto.randomUUID()}`)
    for (const [tabla, keys] of Object.entries(TABLAS)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, () => {
        for (const queryKey of keys) void qc.invalidateQueries({ queryKey })
      })
    }
    canal.subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [qc])
}
