import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import type { ManagementAction } from '../lib/gestionStatus'
import type { NivelAcceso } from '../lib/permisos'
import type {
  CrmChannel, CrmClient, CrmComment, CrmDataAccess, CrmLead, CrmLeadRow, CrmManagementEvent, CrmMeeting,
  CrmPriority, CrmStage, CrmTask, LeadDetalle, Usuario,
} from '../types'

/* Todas las queries y mutaciones del CRM contra las `crm_*`. Nada de permisos acá: la RLS ya
   recorta lo que cada uno lee, y rechaza lo que no puede escribir. */

/* Un update que la RLS frena NO falla: devuelve cero filas. Sin esto la mutación «salía bien» y
   el optimista quedaba mintiendo hasta el próximo refresco. `crm_sin_fila` lo traduce
   `mensajeDeError()` a «No tenés permiso sobre esa cartera». */
function unaFila<T>(data: T[] | null): T {
  const fila = data?.[0]
  if (!fila) throw new Error('crm_sin_fila')
  return fila
}

async function comprobar(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p
  if (error) throw error
}

// ---------- Lectura ----------
export async function getLeads(): Promise<CrmLeadRow[]> {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*, client:crm_clients(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CrmLeadRow[]
}

/** Con las borradas: un lead en una etapa borrada tiene que poder leer su nombre (ver etapaDelLead). */
export async function getCatalogos(): Promise<{ etapas: CrmStage[]; prioridades: CrmPriority[]; canales: CrmChannel[] }> {
  const [etapas, prioridades, canales] = await Promise.all([
    supabase.from('crm_funnel_stages').select('*').order('position'),
    supabase.from('crm_priorities').select('*').order('position'),
    supabase.from('crm_channels').select('*').order('position'),
  ])
  if (etapas.error) throw etapas.error
  if (prioridades.error) throw prioridades.error
  if (canales.error) throw canales.error
  return { etapas: etapas.data, prioridades: prioridades.data, canales: canales.data }
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('users').select('id, email, nombre, iniciales, color, rol, activo').order('nombre')
  if (error) throw error
  return data
}

export async function getAccesos(): Promise<CrmDataAccess[]> {
  const { data, error } = await supabase.from('crm_data_access').select('*')
  if (error) throw error
  // La base lo guarda como text con un check: los tipos generados dicen `string`.
  return data as CrmDataAccess[]
}

export async function getTareasPendientes(): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from('crm_tasks').select('*').eq('completed', false).is('deleted_at', null)
  if (error) throw error
  return data
}

export async function getReunionesEntre(desde: string, hasta: string): Promise<CrmMeeting[]> {
  const { data, error } = await supabase
    .from('crm_meetings').select('*').gte('starts_at', desde).lt('starts_at', hasta).is('deleted_at', null)
  if (error) throw error
  return data
}

/** Todo lo del lead, al abrir el dialog (el `getLeadDetail` del producto). */
export async function getDetalleLead(leadId: string): Promise<LeadDetalle> {
  const [tasks, comments, events, meetings, stageHistory, assignmentHistory] = await Promise.all([
    supabase.from('crm_tasks').select('*').eq('lead_id', leadId).is('deleted_at', null).order('due_date', { nullsFirst: false }),
    supabase.from('crm_comments').select('*').eq('lead_id', leadId).is('deleted_at', null).order('created_at'),
    supabase.from('crm_management_events').select('*').eq('lead_id', leadId).is('deleted_at', null).order('created_at'),
    supabase.from('crm_meetings').select('*').eq('lead_id', leadId).is('deleted_at', null).order('starts_at'),
    supabase.from('crm_stage_history').select('*').eq('lead_id', leadId).order('changed_at'),
    supabase.from('crm_assignment_history').select('*').eq('lead_id', leadId).order('changed_at'),
  ])
  for (const r of [tasks, comments, events, meetings, stageHistory, assignmentHistory]) if (r.error) throw r.error
  return {
    tasks: tasks.data ?? [], comments: comments.data ?? [], events: events.data ?? [],
    meetings: meetings.data ?? [], stageHistory: stageHistory.data ?? [], assignmentHistory: assignmentHistory.data ?? [],
  }
}

// ---------- Lead y cliente ----------
// `gestion_*` NO está: la escribe la base (crm_gestion_refresh). Tampoco los historiales.
export type LeadPatch = Pick<TablesUpdate<'crm_leads'>,
  'funnel_stage_id' | 'channel_id' | 'discard_reason' | 'assigned_to' | 'last_important_event_at'>

export async function updateLead(id: string, patch: LeadPatch): Promise<CrmLead> {
  const { data, error } = await supabase.from('crm_leads').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

export type ClientePatch = Pick<TablesUpdate<'crm_clients'>,
  'company_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'alternative_phone_1'
  | 'alternative_phone_1_note' | 'alternative_phone_2' | 'alternative_phone_2_note' | 'notes'>

export async function updateCliente(id: string, patch: ClientePatch): Promise<CrmClient> {
  const { data, error } = await supabase.from('crm_clients').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

// ---------- Actividad ----------
export async function crearComentario(input: { lead_id: string; description: string; comment_type?: 'MANUAL' | 'SYSTEM' }): Promise<CrmComment> {
  const { data, error } = await supabase.from('crm_comments')
    .insert({ lead_id: input.lead_id, description: input.description, comment_type: input.comment_type ?? 'MANUAL' })
    .select().single()
  if (error) throw error
  return data
}

export async function crearEventoGestion(input: {
  lead_id: string; action: ManagementAction; effective_at?: string; note?: string | null
}): Promise<CrmManagementEvent> {
  const { data, error } = await supabase.from('crm_management_events').insert(input).select().single()
  if (error) throw error
  return data
}

// ---------- Tareas y reuniones ----------
export async function crearTarea(input: { lead_id: string | null; title: string; due_date: string | null; assigned_to: string }): Promise<CrmTask> {
  const { data, error } = await supabase.from('crm_tasks').insert(input).select().single()
  if (error) throw error
  return data
}

export type TareaPatch = Pick<TablesUpdate<'crm_tasks'>, 'completed' | 'completed_at' | 'title' | 'due_date' | 'deleted_at'>

export async function actualizarTarea(id: string, patch: TareaPatch): Promise<CrmTask> {
  const { data, error } = await supabase.from('crm_tasks').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

export type ReunionNueva = Pick<TablesInsert<'crm_meetings'>, 'lead_id' | 'assigned_to' | 'starts_at' | 'ends_at' | 'title' | 'description'>

export async function crearReunion(input: ReunionNueva): Promise<CrmMeeting> {
  const { data, error } = await supabase.from('crm_meetings').insert(input).select().single()
  if (error) throw error
  return data
}

export type ReunionPatch = Pick<TablesUpdate<'crm_meetings'>, 'status' | 'cancel_reason' | 'starts_at' | 'ends_at' | 'title' | 'description'>

export async function actualizarReunion(id: string, patch: ReunionPatch): Promise<CrmMeeting> {
  const { data, error } = await supabase.from('crm_meetings').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

// ---------- Alta y reasignación ----------
export type AltaLead = {
  assignedTo: string
  /** 'YYYY-MM-DD' en la zona de quien carga (localTodayIso). */
  initialTaskDueDate: string
  companyName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  channelId: string | null
  funnelStageId: string | null
}
export type ResultadoAlta = { lead_id: string; client_id: string; client_reused: boolean }

export async function crearLeadConCliente(input: AltaLead): Promise<ResultadoAlta> {
  const { data, error } = await supabase.rpc('crm_create_lead_with_client', {
    p_assigned_to: input.assignedTo,
    p_initial_task_due_date: input.initialTaskDueDate,
    p_company_name: input.companyName,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email,
    p_phone: input.phone,
    // `undefined` y no null: los parámetros con default de la RPC salen opcionales en los tipos.
    p_channel_id: input.channelId ?? undefined,
    p_funnel_stage_id: input.funnelStageId ?? undefined,
  })
  if (error) throw error
  return data as unknown as ResultadoAlta
}

/**
 * De a uno y no un update en bloque: en bloque, un solo choque con el único cliente+responsable
 * aborta el lote entero. El historial lo escribe el trigger; el comentario SYSTEM lo dejamos
 * acá, como `reassign_leads` del producto. Va DESPUÉS del update: el comentario se escribe con
 * el lead ya en la cartera nueva, sobre la que quien reasigna tiene write.
 */
export async function reasignarLead(leadId: string, nuevo: string, comentario: string): Promise<void> {
  await updateLead(leadId, { assigned_to: nuevo, last_important_event_at: new Date().toISOString() })
  await crearComentario({ lead_id: leadId, description: comentario, comment_type: 'SYSTEM' })
}

// ---------- Catálogo (solo SUPERADMIN: la RLS lo exige) ----------
// Borrar es soft delete: la FK de los leads es `on delete set null` y un borrado duro dejaría
// a los leads de esa etapa sin etapa y sin rastro de dónde estaban.
const ahora = () => new Date().toISOString()

export type EtapaNueva = Pick<TablesInsert<'crm_funnel_stages'>,
  'label' | 'value' | 'position' | 'priority_id' | 'management_tolerance_hours' | 'allow_delete' | 'allow_reorder' | 'allow_rename' | 'is_out_of_funnel'>
export type EtapaPatch = Pick<TablesUpdate<'crm_funnel_stages'>, 'label' | 'priority_id' | 'management_tolerance_hours' | 'position'>

export async function crearEtapa(input: EtapaNueva): Promise<CrmStage> {
  const { data, error } = await supabase.from('crm_funnel_stages').insert(input).select().single()
  if (error) throw error
  return data
}
export async function actualizarEtapa(id: string, patch: EtapaPatch): Promise<void> {
  const { data, error } = await supabase.from('crm_funnel_stages').update(patch).eq('id', id).select()
  if (error) throw error
  unaFila(data)
}
export const borrarEtapa = (id: string) =>
  comprobar(supabase.from('crm_funnel_stages').update({ deleted_at: ahora() }).eq('id', id))
export const reordenarEtapas = async (items: { id: string; position: number }[]) => {
  await Promise.all(items.map(i => comprobar(supabase.from('crm_funnel_stages').update({ position: i.position }).eq('id', i.id))))
}

export async function crearPrioridad(input: { name: string; color: string; position: number }): Promise<CrmPriority> {
  const { data, error } = await supabase.from('crm_priorities').insert(input).select().single()
  if (error) throw error
  return data
}
export const actualizarPrioridad = (id: string, patch: { name?: string; color?: string }) =>
  comprobar(supabase.from('crm_priorities').update(patch).eq('id', id))
export const borrarPrioridad = (id: string) =>
  comprobar(supabase.from('crm_priorities').update({ deleted_at: ahora() }).eq('id', id))
export const reordenarPrioridades = async (items: { id: string; position: number }[]) => {
  await Promise.all(items.map(i => comprobar(supabase.from('crm_priorities').update({ position: i.position }).eq('id', i.id))))
}

export async function crearCanal(input: { label: string; position: number }): Promise<CrmChannel> {
  const { data, error } = await supabase.from('crm_channels').insert(input).select().single()
  if (error) throw error
  return data
}
export const actualizarCanal = (id: string, patch: { label: string }) =>
  comprobar(supabase.from('crm_channels').update(patch).eq('id', id))
export const borrarCanal = (id: string) =>
  comprobar(supabase.from('crm_channels').update({ deleted_at: ahora() }).eq('id', id))
export const reordenarCanales = async (items: { id: string; position: number }[]) => {
  await Promise.all(items.map(i => comprobar(supabase.from('crm_channels').update({ position: i.position }).eq('id', i.id))))
}

// ---------- Visibilidad (solo SUPERADMIN) ----------
/**
 * Un solo punto para las tres transiciones de una celda: null borra la fila (DELETE de verdad,
 * ver el comentario de la tabla), read/write la crean o la cambian.
 */
export async function setAcceso(viewerId: string, subjectId: string, access: NivelAcceso | null): Promise<void> {
  if (viewerId === subjectId) throw new Error('Nadie necesita permiso para ver su propia cartera.')
  if (access === null) {
    await comprobar(supabase.from('crm_data_access').delete().eq('viewer_id', viewerId).eq('subject_id', subjectId))
    return
  }
  await comprobar(supabase.from('crm_data_access')
    .upsert({ viewer_id: viewerId, subject_id: subjectId, access }, { onConflict: 'viewer_id,subject_id' }))
}
