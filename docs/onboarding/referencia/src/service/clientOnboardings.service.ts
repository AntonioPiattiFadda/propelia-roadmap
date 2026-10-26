import { supabase } from './index'

// Todo esto es sólo superadmin: las policies de las cuatro tablas lo exigen.

export type ClientOnboarding = {
  id: string
  agencyName: string
  organizationId: string | null
  createdAt: string
  /** `task_id` de las tareas hechas (`<paso>.<tarea>`). */
  doneTasks: string[]
}

export type OnboardingMemberRole = 'agent' | 'admin'

export type ClientOnboardingMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  role: OnboardingMemberRole
  isOwner: boolean
  /** Habla con soporte y con su equipo, configura la organización y conecta los portales. */
  isContact: boolean
}

export type ClientOnboardingMemberInput = Omit<ClientOnboardingMember, 'id' | 'isOwner' | 'isContact'>

export const listClientOnboardings = async (): Promise<ClientOnboarding[]> => {
  const { data, error } = await supabase
    .from('client_onboardings')
    .select('id, agency_name, organization_id, created_at, client_onboarding_tasks (task_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    id: r.id,
    agencyName: r.agency_name,
    organizationId: r.organization_id,
    createdAt: r.created_at,
    doneTasks: r.client_onboarding_tasks.map((t) => t.task_id),
  }))
}

/** Organizaciones para vincular al onboarding. La policy de organizations deja ver todas al superadmin. */
export const listOnboardingOrganizations = async (): Promise<{ id: string; name: string }[]> => {
  const { data, error } = await supabase.from('organizations').select('id, name').is('deleted_at', null).order('name')
  if (error) throw error
  return data
}

/** Alta nueva con su responsable, en una sola operación. Devuelve el id. */
export const createClientOnboarding = async (input: {
  agencyName: string
  ownerFirstName: string
  ownerLastName: string
  ownerPhone: string
}): Promise<string> => {
  const { data, error } = await supabase.rpc('client_onboarding_create', {
    p_agency_name: input.agencyName,
    p_owner_first_name: input.ownerFirstName,
    p_owner_last_name: input.ownerLastName,
    p_owner_phone: input.ownerPhone,
  })
  if (error) throw error
  return data
}

export const linkClientOnboardingOrganization = async (onboardingId: string, organizationId: string | null) => {
  const { error } = await supabase
    .from('client_onboardings')
    .update({ organization_id: organizationId })
    .eq('id', onboardingId)
  if (error) throw error
}

/** Marca o desmarca una tarea. `done_by` lo completa la base con quien la marca. */
export const setClientOnboardingTask = async (onboardingId: string, taskId: string, done: boolean) => {
  const { error } = done
    ? await supabase
        .from('client_onboarding_tasks')
        .upsert({ onboarding_id: onboardingId, task_id: taskId }, { onConflict: 'onboarding_id,task_id', ignoreDuplicates: true })
    : await supabase.from('client_onboarding_tasks').delete().eq('onboarding_id', onboardingId).eq('task_id', taskId)
  if (error) throw error
}

// --- Equipo ---

export const listClientOnboardingMembers = async (onboardingId: string): Promise<ClientOnboardingMember[]> => {
  const { data, error } = await supabase
    .from('client_onboarding_members')
    .select('id, first_name, last_name, email, phone, role, is_owner, is_contact')
    .eq('onboarding_id', onboardingId)
    .order('is_owner', { ascending: false })
    .order('created_at')
  if (error) throw error
  return data.map((m) => ({
    id: m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    email: m.email,
    phone: m.phone,
    role: m.role as OnboardingMemberRole,
    isOwner: m.is_owner,
    isContact: m.is_contact,
  }))
}

const memberRow = (m: ClientOnboardingMemberInput) => ({
  first_name: m.firstName.trim(),
  last_name: m.lastName.trim(),
  email: m.email?.trim() || null,
  phone: m.phone?.trim() || null,
  role: m.role,
})

/** Devuelve el id de la persona nueva. */
export const addClientOnboardingMember = async (onboardingId: string, member: ClientOnboardingMemberInput): Promise<string> => {
  const { data, error } = await supabase
    .from('client_onboarding_members')
    .insert({ onboarding_id: onboardingId, ...memberRow(member) })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export const updateClientOnboardingMember = async (memberId: string, member: ClientOnboardingMemberInput) => {
  const { error } = await supabase.from('client_onboarding_members').update(memberRow(member)).eq('id', memberId)
  if (error) throw error
}

/** Pasa a ser la persona de contacto de su onboarding (y deja de serlo quien lo era). */
export const setClientOnboardingContact = async (memberId: string) => {
  const { error } = await supabase.rpc('client_onboarding_set_contact', { p_member_id: memberId })
  if (error) throw error
}

export const deleteClientOnboardingMember = async (memberId: string) => {
  const { error } = await supabase.from('client_onboarding_members').delete().eq('id', memberId)
  if (error) throw error
}

// --- Mensajes ---

export const listOnboardingTemplates = async (): Promise<Record<string, string>> => {
  const { data, error } = await supabase.from('onboarding_message_templates').select('id, body')
  if (error) throw error
  return Object.fromEntries(data.map((t) => [t.id, t.body]))
}

export const updateOnboardingTemplate = async (id: string, body: string, userId: string) => {
  const { error } = await supabase
    .from('onboarding_message_templates')
    .update({ body, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
