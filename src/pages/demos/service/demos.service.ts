import { supabase } from '@/lib/supabase'
import type { CrmMeeting } from '@/pages/crm/types'

export type Demo = CrmMeeting & { lead: { id: string; client: { company_name: string | null } | null } | null }

/* Todas las reuniones del CRM, la última agendada primero. Sin filtro por título: hoy todas las
   agenda el SDR como «Demo» y una reunión cargada desde el perfil también es una demo. Un SUPERADMIN
   lee todas (`crm_puede`), así que esto no necesitó migración ni RPC. */
export async function getDemos(): Promise<Demo[]> {
  const { data, error } = await supabase
    .from('crm_meetings')
    .select('*, lead:crm_leads(id, client:crm_clients(company_name))')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []) as unknown as Demo[]
}
