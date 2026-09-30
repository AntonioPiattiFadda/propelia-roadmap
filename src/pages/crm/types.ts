import type { Tables } from '@/types/database.types'

/* Los tipos del CRM, en un archivo que solo hace `import type`. La lógica pura de `lib/` y sus
   tests los usan sin cargar `@/lib/supabase`, que exige el `.env` al importarse y vitest corre
   sin él. */
export type CrmLead = Tables<'crm_leads'>
export type CrmClient = Tables<'crm_clients'>
/** El lead como lo trae la lista: con el cliente embebido (`client:crm_clients(*)`). */
export type CrmLeadRow = CrmLead & { client: CrmClient | null }
export type CrmStage = Tables<'crm_funnel_stages'>
export type CrmPriority = Tables<'crm_priorities'>
export type CrmChannel = Tables<'crm_channels'>
export type CrmTask = Tables<'crm_tasks'>
export type CrmComment = Tables<'crm_comments'>
export type CrmManagementEvent = Tables<'crm_management_events'>
export type CrmMeeting = Tables<'crm_meetings'>
export type CrmStageHistory = Tables<'crm_stage_history'>
export type CrmAssignmentHistory = Tables<'crm_assignment_history'>
/** El nivel de acceso a una cartera ajena. Los tipos generados lo traen como `string` (la base
 *  lo restringe con un check), así que acá se acota a mano a los dos valores que existen. */
export type CrmAccess = 'read' | 'write'
export type CrmDataAccess = Omit<Tables<'crm_data_access'>, 'access'> & { access: CrmAccess }
/** Lo que el CRM lee de `users`: la cartera es una persona. */
export type Usuario = Pick<Tables<'users'>, 'id' | 'email' | 'nombre' | 'iniciales' | 'color' | 'rol' | 'activo'>
/** La etapa con su prioridad ya resuelta: el color y el filtro de prioridad cuelgan de acá. */
export type EtapaConPrioridad = CrmStage & { priority: CrmPriority | null }
/** Todo lo que se pide al abrir el dialog de un lead (el `getLeadDetail` del producto). */
export type LeadDetalle = {
  tasks: CrmTask[]
  comments: CrmComment[]
  events: CrmManagementEvent[]
  meetings: CrmMeeting[]
  stageHistory: CrmStageHistory[]
  assignmentHistory: CrmAssignmentHistory[]
}
