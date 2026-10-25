import type { Tables } from '@/types/database.types'

/* Los tipos del CRM, en un archivo que solo hace `import type`. La lógica pura de `lib/` y sus
   tests los usan sin cargar `@/lib/supabase`, que exige el `.env` al importarse y vitest corre
   sin él. */
/** `importante` (23/10/2026) va opcional: hasta que se corra `20261023135323_crm_leads_importante`
 *  la base no lo trae, y la lista lee `*`. undefined = no marcado. */
export type CrmLead = Omit<Tables<'crm_leads'>, 'importante'> & { importante?: boolean }
export type CrmClient = Tables<'crm_clients'>
/** El lead como lo trae la lista: con el cliente embebido (`client:crm_clients(*)`) y la fecha del
 *  último registro a mano de su Actividad (ver `getLeads`). Opcional: un optimista no la conoce. */
export type CrmLeadRow = CrmLead & { client: CrmClient | null; ultima_actividad_at?: string | null }
/** `show_in_dashboard` (23/10/2026) va opcional, como `importante`: hasta que se corra
 *  `20261023164216_crm_funnel_stages_show_in_dashboard` la base no lo trae. undefined = no se ve. */
export type CrmStage = Omit<Tables<'crm_funnel_stages'>, 'show_in_dashboard'> & { show_in_dashboard?: boolean }
export type CrmChannel = Tables<'crm_channels'>
export type CrmTask = Tables<'crm_tasks'>
export type CrmComment = Tables<'crm_comments'>
export type CrmEmail = Tables<'crm_emails'>
export type CrmManagementEvent = Tables<'crm_management_events'>
export type CrmMeeting = Tables<'crm_meetings'>
export type CrmStageHistory = Tables<'crm_stage_history'>
export type CrmAssignmentHistory = Tables<'crm_assignment_history'>
/** El nivel de acceso a una cartera ajena. Los tipos generados lo traen como `string` (la base
 *  lo restringe con un check), así que acá se acota a mano a los dos valores que existen. */
export type CrmAccess = 'read' | 'write'
export type CrmDataAccess = Omit<Tables<'crm_data_access'>, 'access'> & { access: CrmAccess }
/** Lo que el CRM lee de `users`: la cartera es una persona. */
export type Usuario = Pick<Tables<'users'>, 'id' | 'email' | 'nombre' | 'iniciales' | 'color' | 'rol' | 'activo' | 'phone' | 'last_name'>
/** Todo lo que se pide al abrir el dialog de un lead (el `getLeadDetail` del producto). */
export type LeadDetalle = {
  tasks: CrmTask[]
  comments: CrmComment[]
  events: CrmManagementEvent[]
  meetings: CrmMeeting[]
  stageHistory: CrmStageHistory[]
  assignmentHistory: CrmAssignmentHistory[]
}
