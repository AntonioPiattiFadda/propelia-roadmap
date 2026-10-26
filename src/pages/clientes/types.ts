import type { Tables } from '@/types/database.types'

/* Los tipos de /clientes, en un archivo que solo hace `import type` (como `crm/types.ts`): la
   lógica de `lib/` y sus tests no cargan `@/lib/supabase`. */
export type ClientOnboarding = Tables<'client_onboardings'>
export type MiembroDelOnboarding = Tables<'client_onboarding_members'>
export type PlantillaDeMensaje = Tables<'onboarding_message_templates'>

export type ClienteDelOnboarding = Pick<Tables<'crm_clients'>, 'company_name' | 'first_name' | 'last_name' | 'email' | 'phone'>

/** Un alta en curso como la trae la lista: con su lead, el cliente del CRM, el equipo y lo hecho. */
export type Onboarding = ClientOnboarding & {
  lead: Pick<Tables<'crm_leads'>, 'id' | 'assigned_to' | 'propelia_organization_id' | 'lead_type'> & {
    client: ClienteDelOnboarding | null
  }
  miembros: MiembroDelOnboarding[]
  tareas: Pick<Tables<'client_onboarding_tasks'>, 'task_id' | 'done_at' | 'done_by'>[]
}
