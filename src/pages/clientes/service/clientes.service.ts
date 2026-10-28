import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'
import { TAREA_EQUIPO_RECIBIDO } from '../lib/pasos'
import type { Onboarding, PlantillaDeMensaje } from '../types'

/* La base de /clientes (migración `20261026184212_clientes_onboarding`). Todo es solo SUPERADMIN
   por RLS. El paso a ONBOARDING no se hace desde acá: lo hace el trigger cuando el comercial mueve
   el lead a «Contratado», y ese mismo trigger crea el `client_onboardings`. */

/** Las altas en curso: el lead ONBOARDING, sin borrar y sin completar. La última que entró, primero. */
export async function getOnboardings(): Promise<Onboarding[]> {
  const { data, error } = await supabase
    .from('client_onboardings')
    .select(`*,
      lead:crm_leads!inner(id, assigned_to, propelia_organization_id, lead_type,
        client:crm_clients(company_name, first_name, last_name, email, phone, alternative_phone_1, alternative_phone_2,
          alternative_phone_1_is_decision_maker, alternative_phone_2_is_decision_maker, google_maps_phone),
        tareas_crm:crm_tasks(*)),
      miembros:client_onboarding_members(*),
      tareas:client_onboarding_tasks(task_id, done_at, done_by)`)
    .is('completed_at', null)
    .eq('lead.lead_type', 'ONBOARDING')
    .is('lead.deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Onboarding[]
}

export async function marcarTarea({ onboardingId, taskId, hecha }: { onboardingId: string; taskId: string; hecha: boolean }) {
  const { error } = hecha
    ? await supabase.from('client_onboarding_tasks').upsert({ onboarding_id: onboardingId, task_id: taskId }, { ignoreDuplicates: true })
    : await supabase.from('client_onboarding_tasks').delete().eq('onboarding_id', onboardingId).eq('task_id', taskId)
  if (error) throw error
}

/** El título de la tarea del CRM que crea el trigger `client_onboardings_alta_recibida` («Revisar e
 *  importar el equipo de …»). Si cambia allá, cambia acá. */
export const PREFIJO_TAREA_REVISAR_EQUIPO = 'Revisar e importar el equipo de '

/** Con los accesos enviados, la tarea del CRM que avisó que llegó el equipo ya está hecha: se
 *  completan todas las pendientes del lead con ese título (por prefijo: el nombre de la
 *  inmobiliaria puede haber cambiado desde que se creó). */
export async function completarTareasDeRevisarEquipo(leadId: string) {
  const { error } = await supabase.from('crm_tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('lead_id', leadId).eq('completed', false).is('deleted_at', null)
    .like('title', `${PREFIJO_TAREA_REVISAR_EQUIPO}%`)
  if (error) throw error
}

/** Quién de soporte lleva el alta («Tomar»). */
export async function asignarOnboarding({ onboardingId, userId }: { onboardingId: string; userId: string | null }) {
  const { error } = await supabase.from('client_onboardings').update({ assigned_to: userId }).eq('id', onboardingId)
  if (error) throw error
}

/** Vuelve a abrir la página de alta para que el cliente corrija lo enviado: borra `submitted_at`
 *  y destilda «Recibir el equipo», que la base vuelve a tildar cuando lo reenvíe. */
export async function reabrirAlta(onboardingId: string) {
  const { error } = await supabase.from('client_onboardings').update({ submitted_at: null }).eq('id', onboardingId)
  if (error) throw error
  const { error: e2 } = await supabase.from('client_onboarding_tasks').delete()
    .eq('onboarding_id', onboardingId).eq('task_id', TAREA_EQUIPO_RECIBIDO)
  if (e2) throw e2
}

export type MiembroAImportar = { first_name: string; last_name: string; email: string; phone: string; role: 'admin' | 'agent'; is_owner: boolean }

/** Guarda el equipo importado, vincula la org al lead y tilda las dos tareas del import. Todo o nada. */
export async function importarEquipo(p: { onboardingId: string; organizationId: string; miembros: MiembroAImportar[] }) {
  const { error } = await supabase.rpc('client_onboarding_importar_equipo', {
    p_onboarding_id: p.onboardingId, p_organization_id: p.organizationId, p_miembros: p.miembros as unknown as Json,
  })
  if (error) throw error
}

/** Termina el alta: el lead pasa a CLIENT y sale de la lista. */
export async function completarOnboarding(onboardingId: string) {
  const { error } = await supabase.rpc('client_onboarding_completar', { p_onboarding_id: onboardingId })
  if (error) throw error
}

export async function getPlantillas(): Promise<PlantillaDeMensaje[]> {
  const { data, error } = await supabase.from('onboarding_message_templates').select('*')
  if (error) throw error
  return data ?? []
}
