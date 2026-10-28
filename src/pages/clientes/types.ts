import type { Tables } from '@/types/database.types'
import type { CrmTask } from '@/pages/crm/types'

/* Los tipos de /clientes, en un archivo que solo hace `import type` (como `crm/types.ts`): la
   lógica de `lib/` y sus tests no cargan `@/lib/supabase`. */
export type ClientOnboarding = Tables<'client_onboardings'>
export type MiembroDelOnboarding = Tables<'client_onboarding_members'>
export type PlantillaDeMensaje = Tables<'onboarding_message_templates'>

export type ClienteDelOnboarding = Pick<Tables<'crm_clients'>, 'company_name' | 'first_name' | 'last_name' | 'email' | 'phone'
  | 'alternative_phone_1' | 'alternative_phone_2' | 'alternative_phone_1_is_decision_maker' | 'alternative_phone_2_is_decision_maker'
  | 'google_maps_phone'>

/** Un alta en curso como la trae la lista: con su lead, el cliente del CRM, el equipo y lo hecho. */
export type Onboarding = ClientOnboarding & {
  lead: Pick<Tables<'crm_leads'>, 'id' | 'assigned_to' | 'propelia_organization_id' | 'lead_type'> & {
    client: ClienteDelOnboarding | null
    /** Las tareas del CRM del lead (todas: el front se queda con las pendientes). */
    tareas_crm: CrmTask[]
  }
  miembros: MiembroDelOnboarding[]
  tareas: Pick<Tables<'client_onboarding_tasks'>, 'task_id' | 'done_at' | 'done_by'>[]
}
