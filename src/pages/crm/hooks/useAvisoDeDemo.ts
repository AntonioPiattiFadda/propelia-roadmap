import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { listLeadNotificationPreferences } from '@/pages/ajustes/service/leadNotificationPreferences.service'
import type { AvisoDeDemo, FirmanteDeAviso } from '../lib/emailDeAvisoDeDemo'

/* Lo que necesita el «Ver email» de un aviso de demo sobre un lead de verdad (4/11/2026): la
   inmobiliaria (nombre, contacto y email), el equipo (para saber qué invitado es de afuera y quién
   firma: el responsable de la reunión, con sus `firma_*`) y si ese aviso está prendido por email. */

export type FilaDeFirmante = NonNullable<FirmanteDeAviso> & { id: string }

/** La misma key que Ajustes › Avisos a leads: guardar ahí refresca acá. */
export const PREFERENCIAS_KEY = ['lead-notification-preferences']

export function useAvisoPrendido(tipo: AvisoDeDemo) {
  const q = useQuery({ queryKey: PREFERENCIAS_KEY, queryFn: listLeadNotificationPreferences, staleTime: 60_000 })
  return !!q.data?.some(p => p.event_type === tipo && p.channel === 'email' && p.enabled)
}

export function useDatosDelAvisoDeDemo(leadId: string | null | undefined, activo: boolean) {
  return useQuery({
    queryKey: ['crm', 'aviso-de-demo', leadId],
    enabled: activo && !!leadId,
    staleTime: 60_000,
    queryFn: async () => {
      const [lead, equipo] = await Promise.all([
        supabase.from('crm_leads').select('client:crm_clients(first_name, company_name, email)').eq('id', leadId!).maybeSingle(),
        supabase.from('users').select('id, nombre, last_name, email, phone, firma_nombre, firma_cargo, firma_telefono'),
      ])
      if (lead.error) throw lead.error
      if (equipo.error) throw equipo.error
      const c = lead.data?.client
      const cliente = (Array.isArray(c) ? c[0] : c) as { first_name: string | null; company_name: string | null; email: string | null } | null | undefined
      return { cliente: cliente ?? null, equipo: (equipo.data ?? []) as FilaDeFirmante[] }
    },
  })
}
