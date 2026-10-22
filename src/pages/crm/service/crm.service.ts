import { supabase } from '@/lib/supabase'
import type { Json, TablesInsert, TablesUpdate } from '@/types/database.types'
import { cancelMeeting, requestMeetingSync } from '@/pages/agenda/service/meetings.service'
import type { FilaDelLote } from '../lib/importarLote'
import type { NivelAcceso } from '../lib/permisos'
import type {
  CrmChannel, CrmClient, CrmComment, CrmDataAccess, CrmLead, CrmLeadRow, CrmMeeting, CrmStage, CrmTask,
  LeadDetalle, Usuario,
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
/* «Última actividad» es el último registro hecho a mano en la Actividad del lead (nota, llamada,
   contacto fallido): el comentario MANUAL más nuevo sin borrar. No `last_important_event_at`, que
   lo escribe también la reasignación. Se embebe uno solo por lead, ya recortado por la RLS. */
export async function getLeads(): Promise<CrmLeadRow[]> {
  const { data, error } = await supabase
    .from('crm_leads')
    .select('*, client:crm_clients(*), registros:crm_comments(created_at)')
    .is('deleted_at', null)
    .eq('registros.comment_type', 'MANUAL')
    .is('registros.deleted_at', null)
    .order('created_at', { referencedTable: 'registros', ascending: false })
    .limit(1, { referencedTable: 'registros' })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(({ registros, ...lead }) => ({
    ...lead,
    ultima_actividad_at: registros[0]?.created_at ?? null,
  })) as CrmLeadRow[]
}

/** Un lead con su cliente, para la Agenda: el registro de la demo (22/10/2026) necesita los
 *  contactos, el responsable y la etapa, y ahí no está la lista entera del CRM. */
export async function getLead(id: string): Promise<CrmLeadRow> {
  const { data, error } = await supabase
    .from('crm_leads').select('*, client:crm_clients(*)').eq('id', id).is('deleted_at', null).single()
  if (error) throw error
  return { ...data, ultima_actividad_at: null } as CrmLeadRow
}

/** Con las borradas: un lead en una etapa borrada tiene que poder leer su nombre (ver etapaDelLead). */
export async function getCatalogos(): Promise<{ etapas: CrmStage[]; canales: CrmChannel[] }> {
  const [etapas, canales] = await Promise.all([
    supabase.from('crm_funnel_stages').select('*').order('position'),
    supabase.from('crm_channels').select('*').order('position'),
  ])
  if (etapas.error) throw etapas.error
  if (canales.error) throw canales.error
  return { etapas: etapas.data, canales: canales.data }
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('users').select('id, email, nombre, iniciales, color, rol, activo, phone, last_name').order('nombre')
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
// `gestion_*` NO está: la escribe la base (crm_gestion_refresh) y el front ya no la muestra
// (10/10/2026). Tampoco los historiales.
export type LeadPatch = Pick<TablesUpdate<'crm_leads'>,
  'funnel_stage_id' | 'channel_id' | 'discard_reason' | 'recontact_at' | 'assigned_to' | 'last_important_event_at'>

export async function updateLead(id: string, patch: LeadPatch): Promise<CrmLead> {
  const { data, error } = await supabase.from('crm_leads').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

export type ClientePatch = Pick<TablesUpdate<'crm_clients'>,
  'company_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'alternative_phone_1'
  | 'alternative_phone_1_note' | 'alternative_phone_2' | 'alternative_phone_2_note' | 'notes'
  // Los datos de la inmobiliaria. Pueden no existir todavía en la base (ver supabase/schema.sql):
  // por eso se guardan de a uno y nunca junto con otro campo, y las lecturas van con `*`.
  | 'website' | 'idealista_url' | 'city' | 'neighborhood' | 'office_address' | 'agents_count' | 'current_crm' | 'sdr_advice'
  | 'idealista_years' | 'idealista_listings'
  // Rol y notas de cada contacto: mismo caso, pendientes de migración.
  | 'contact_role' | 'contact_notes' | 'alternative_phone_1_role' | 'alternative_phone_1_notes'
  | 'alternative_phone_2_role' | 'alternative_phone_2_notes'
  // El email de cada alternativo: mismo caso, pendiente de migración (17/10/2026).
  | 'alternative_phone_1_email' | 'alternative_phone_2_email'
  // Si cada contacto decide: mismo caso, pendiente de migración.
  | 'contact_is_decision_maker' | 'alternative_phone_1_is_decision_maker' | 'alternative_phone_2_is_decision_maker'
  // Lo que trae la importación desde Excel (lote, motivo, origen de cada teléfono y los teléfonos
  // de Google Maps e Idealista): mismo caso, pendientes de migración.
  | 'import_batch' | 'batch_activated_on' | 'selection_reason' | 'phone_source'
  | 'alternative_phone_1_source' | 'alternative_phone_2_source' | 'google_maps_phone' | 'idealista_phone'>

export async function updateCliente(id: string, patch: ClientePatch): Promise<CrmClient> {
  const { data, error } = await supabase.from('crm_clients').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

// ---------- Actividad ----------
export async function crearComentario(input: {
  lead_id: string; description: string; comment_type?: 'MANUAL' | 'SYSTEM'
  /** La meta de la actividad (llamada, con quién): ver `armarMetaDeActividad`. */
  long_description?: string | null
}): Promise<CrmComment> {
  const { data, error } = await supabase.from('crm_comments')
    .insert({
      lead_id: input.lead_id, description: input.description, comment_type: input.comment_type ?? 'MANUAL',
      long_description: input.long_description ?? null,
    })
    .select().single()
  if (error) throw error
  return data
}

/** Borrar una actividad cargada por error es soft delete (`deleted_at`), como el resto del CRM:
 *  la fila sigue en la base y «Deshacer» la devuelve con `borrado: false`. */
export const marcarComentarioBorrado = (id: string, borrado: boolean) =>
  comprobar(supabase.from('crm_comments').update({ deleted_at: borrado ? ahora() : null }).eq('id', id))

/** Editar lo escrito de una actividad (20/10/2026): solo el texto. La meta (`long_description`:
 *  con quién, teléfono, resultado) no se toca, y no queda marca de «editado»: la tabla no tiene
 *  `updated_at` y no se migra por esto. */
export const actualizarComentario = (id: string, patch: { description: string }) =>
  comprobar(supabase.from('crm_comments').update({ description: patch.description }).eq('id', id))

/** La meta (y el lead) de las actividades que `autor` registró en [desde, hasta): de ahí sale el
 *  contador de llamadas. Se filtra por la marca en la base para no traer todos los comentarios. */
export async function metasDeActividad(autor: string, desde: string, hasta: string): Promise<{ lead_id: string | null; long_description: string | null }[]> {
  const { data, error } = await supabase.from('crm_comments').select('lead_id, long_description')
    .eq('created_by', autor).eq('comment_type', 'MANUAL').is('deleted_at', null)
    .gte('created_at', desde).lt('created_at', hasta)
    .like('long_description', '<!--act-->%')
  if (error) throw error
  return data ?? []
}

/** Las demos que `autor` agendó en [desde, hasta): cuenta cuándo se agendaron, no para cuándo son. */
export async function demosAgendadas(autor: string, desde: string, hasta: string): Promise<{ lead_id: string | null }[]> {
  const { data, error } = await supabase.from('crm_meetings').select('lead_id')
    .eq('created_by', autor).is('deleted_at', null)
    .gte('created_at', desde).lt('created_at', hasta)
  if (error) throw error
  return data ?? []
}

// ---------- Tareas y reuniones ----------
/* `due_time` (la hora, 17/10/2026) va SOLO si hay hora: sin la migración `crm_tasks_due_time` corrida,
   mandar la columna aunque sea en null haría fallar el insert entero. Así la tarea sin hora anda igual
   que antes, y la que tiene hora contesta FALTA_MIGRACION (PGRST204, ver errores.ts). Las lecturas
   van con `*`: una columna que todavía no existe no las rompe, simplemente no viene. */
export async function crearTarea(input: {
  lead_id: string | null; title: string; due_date: string | null; due_time?: string | null; assigned_to: string
}): Promise<CrmTask> {
  const { due_time, ...resto } = input
  const fila = due_time ? { ...resto, due_time } : resto
  const { data, error } = await supabase.from('crm_tasks').insert(fila).select().single()
  if (error) throw error
  return data
}

/* `due_time` va solo cuando cambió (ver `cambiosDeTarea`): por lo mismo que en `crearTarea`. */
export type TareaPatch = Pick<TablesUpdate<'crm_tasks'>, 'completed' | 'completed_at' | 'title' | 'due_date' | 'due_time' | 'deleted_at'>

export async function actualizarTarea(id: string, patch: TareaPatch): Promise<CrmTask> {
  const { data, error } = await supabase.from('crm_tasks').update(patch).eq('id', id).select()
  if (error) throw error
  return unaFila(data)
}

export type ReunionNueva = Pick<TablesInsert<'crm_meetings'>, 'lead_id' | 'assigned_to' | 'starts_at' | 'ends_at' | 'title' | 'description' | 'guest_emails'>

/* Desde el 21/10/2026 la reunión va sola al Google Calendar de su responsable, si lo tiene
   conectado (`calendar-sync`, copiado del producto). Nace con `sync_status = 'pending'` y se empuja
   en el momento, fire-and-forget: si falla, la levanta el barrido de cada 5 minutos. */
export async function crearReunion(input: ReunionNueva): Promise<CrmMeeting> {
  const { data, error } = await supabase.from('crm_meetings').insert(input).select().single()
  if (error) throw error
  requestMeetingSync(data.id).catch(() => {})
  return data
}

/* Cancelar re-encola el sync: borra el evento de Google y Google les avisa a los invitados.
   Marcarla hecha (`actualizarReunion` con status) no, a propósito: ver `markMeetingOutcome`. */
export async function cancelarReunion(reunion: Pick<CrmMeeting, 'id' | 'ics_sequence'>, motivo: string | null): Promise<CrmMeeting> {
  const data = await cancelMeeting(reunion.id, reunion, motivo)
  requestMeetingSync(data.id).catch(() => {})
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

// ---------- Importar un lote del Excel (solo SUPERADMIN: la RPC lo exige) ----------
export type ResultadoDeFila = {
  fila: number
  empresa: string
  resultado: 'nueva' | 'posible_repetida' | 'contactos_nuevos' | 'sin_novedad'
  /** El aviso de posible repetida, o los contactos que se suman. */
  detalle: string | null
}
export type ResultadoDelImport = { filas: ResultadoDeFila[]; etiquetas_nuevas: string[]; simulado: boolean }

/** Con `simular` la base hace todo y lo deshace: es el preview, y cuenta exactamente lo que va a pasar. */
export async function importarLote(assignedTo: string, filas: FilaDelLote[], simular: boolean): Promise<ResultadoDelImport> {
  const { data, error } = await supabase.rpc('crm_importar_lote', {
    p_assigned_to: assignedTo, p_filas: filas as unknown as Json, p_simular: simular,
  })
  if (error) throw error
  return data as unknown as ResultadoDelImport
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
// Prioridad y tiempo de gestión de la etapa (`priority_id`, `management_tolerance_hours`) siguen
// en la base pero el front no los escribe desde el 10/10/2026: una etapa nueva nace con los dos
// en null.
const ahora = () => new Date().toISOString()

export type EtapaNueva = Pick<TablesInsert<'crm_funnel_stages'>,
  'label' | 'value' | 'position' | 'allow_delete' | 'allow_reorder' | 'allow_rename' | 'is_out_of_funnel'>
export type EtapaPatch = Pick<TablesUpdate<'crm_funnel_stages'>, 'label' | 'position' | 'management_type'>

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
