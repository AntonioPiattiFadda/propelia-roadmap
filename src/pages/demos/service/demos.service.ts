import { supabase } from '@/lib/supabase'
import { leerMetaDeActividad } from '@/pages/crm/lib/actividad'
import type { RegistroDeLaDemo } from '@/pages/crm/lib/reuniones'
import type { CrmMeeting } from '@/pages/crm/types'

export type Demo = CrmMeeting & {
  lead: { id: string; client: { company_name: string | null } | null } | null
  /** El registro de actividad que se dejó al agendarla (desde el 22/10/2026; las de antes, null). */
  registro: RegistroDeLaDemo | null
}

/* Todas las reuniones del CRM, la última agendada primero. Sin filtro por título: hoy todas las
   agenda el SDR como «Demo» y una reunión cargada desde el perfil también es una demo. Un SUPERADMIN
   lee todas (`crm_puede`), así que esto no necesitó migración ni RPC. */
export async function getDemos(): Promise<Demo[]> {
  const [reuniones, registros] = await Promise.all([
    supabase
      .from('crm_meetings')
      .select('*, lead:crm_leads(id, client:crm_clients(company_name))')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    // Los registros de demo (`tipo: 'demo'` en la meta): de ahí salen quién asiste y las notas.
    supabase
      .from('crm_comments')
      .select('description, long_description')
      .eq('comment_type', 'MANUAL')
      .is('deleted_at', null)
      .like('long_description', '%"tipo":"demo"%')
      .limit(1000),
  ])
  if (reuniones.error) throw reuniones.error
  if (registros.error) throw registros.error
  const porReunion = new Map<string, RegistroDeLaDemo>()
  for (const r of registros.data ?? []) {
    const meta = leerMetaDeActividad(r.long_description)
    if (meta?.tipo === 'demo' && meta.reunion) {
      porReunion.set(meta.reunion, { con: meta.con, decisorApuntado: meta.decisorApuntado, texto: r.description })
    }
  }
  return ((reuniones.data ?? []) as unknown as Omit<Demo, 'registro'>[])
    .map(d => ({ ...d, registro: porReunion.get(d.id) ?? null }))
}
