// Tools del servidor MCP del tablero: Roadmap, CRM, clientes (onboarding) y caja. Todas de SÓLO
// LECTURA y todas sobre las vistas `mcp_*` (db.ts, migración 20261031135450_mcp_tools), que ya
// recortan con los mismos permisos que la app: la cartera del CRM (`crm_puede`), y clientes y
// caja sólo para SUPERADMIN. Acá no se vuelve a filtrar por permisos a propósito: si se hiciera,
// taparía un agujero de una vista en vez de mostrarlo.
//
// Cada tool pide columnas explícitas y arma su salida campo por campo, con claves en castellano.
// Nunca salen teléfonos ni emails (las vistas no los tienen). sanitize.ts es la última barrera.
// Reglas para sumar una: docs/mcp/README.md › Agregar una tool.

import { z } from 'npm:zod@3.25.76'
import type { Filter, McpDb, Row } from './db.ts'
import {
  avisosDeExpl, ESTADO_IDS, estadoLabel, explATexto, fechaISO, type Paso, PRIORIDAD_IDS, prioridadLabel,
  responsablesDe,
} from './roadmap.ts'
import { actividadDe, hoyEnEspana } from './crm.ts'

export interface ToolContext {
  db: McpDb
  /** Quien conectó el conector: el «mías» de las tareas y reuniones. */
  userId: string
}

export interface McpToolDef {
  name: string
  title: string
  description: string
  inputSchema: z.ZodRawShape
  /** Claves sensibles que ESTA tool entrega a propósito y el sanitizador deja pasar. */
  publicKeys?: readonly string[]
  /** Sale a internet (MCP `openWorldHint`). */
  openWorld?: boolean
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<unknown>
}

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25
/** Tope para lo que se trae entero y se cuenta o pagina acá (equipo, etapas, caja). */
const ALL = 4999

const uuid = z.string().uuid()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha YYYY-MM-DD')
const limit = z.number().int().min(1).max(MAX_LIMIT).optional().describe(`Tamaño de página (por defecto ${DEFAULT_LIMIT}).`)
const offset = z.number().int().min(0).optional().describe('Cuántos saltear, para paginar.')

function page(args: Record<string, unknown>): { limit: number; offset: number } {
  return {
    limit: typeof args.limit === 'number' ? args.limit : DEFAULT_LIMIT,
    offset: typeof args.offset === 'number' ? args.offset : 0,
  }
}

function paged<T>(key: string, rows: T[], total: number | null, p: { limit: number; offset: number }) {
  return {
    total,
    offset: p.offset,
    limit: p.limit,
    has_more: total === null ? rows.length === p.limit : p.offset + rows.length < total,
    [key]: rows,
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

// ─── equipo ─────────────────────────────────────────────────────────────────

interface Persona {
  nombre: string
  rol: string
  activo: boolean
}

async function equipo(db: McpDb): Promise<Map<string, Persona>> {
  const { rows } = await db.select({ view: 'mcp_team', columns: ['id', 'nombre', 'last_name', 'rol', 'activo'], range: [0, ALL] })
  return new Map(rows.map((r) => [
    r.id as string,
    { nombre: [r.nombre, r.last_name].filter(Boolean).join(' ') || 'Sin nombre', rol: r.rol, activo: r.activo !== false },
  ]))
}

const nombreDe = (gente: Map<string, Persona>, id: unknown) =>
  typeof id === 'string' && id ? (gente.get(id)?.nombre ?? 'Alguien que ya no está') : null

const getMe: McpToolDef = {
  name: 'get_me',
  title: 'Quién soy',
  description: 'Con qué cuenta del tablero está conectado el asistente: id, nombre y rol. El id sirve para filtrar "lo mío" en otras herramientas.',
  inputSchema: {},
  async run({ db, userId }) {
    const me = (await db.rpc('mcp_whoami', {})) as Record<string, unknown> | null
    return { found: !!me, id: userId, nombre: me?.nombre ?? null, rol: me?.rol ?? null }
  },
}

const listTeam: McpToolDef = {
  name: 'list_team',
  title: 'Equipo',
  description: 'Las personas del equipo con su id, nombre, rol (SUPERADMIN o SDR) y si están activas. Los ids sirven para filtrar por responsable.',
  inputSchema: {
    incluir_inactivos: z.boolean().optional().describe('También a quienes se dieron de baja (por defecto no).'),
  },
  async run({ db }, args) {
    const gente = await equipo(db)
    const lista = [...gente.entries()]
      .filter(([, p]) => args.incluir_inactivos === true || p.activo)
      .map(([id, p]) => ({ id, nombre: p.nombre, rol: p.rol, activo: p.activo }))
    return { equipo: lista }
  },
}

// ─── roadmap ────────────────────────────────────────────────────────────────

const TAREA_COLUMNS = ['id', 'tarea', 'estado', 'prioridad', 'pend', 'backlog', 'sprint', 'modulo', 'dep', 'creada', 'updated_at'] as const

async function grupos(db: McpDb): Promise<Map<number, string>> {
  const { rows } = await db.select({ view: 'mcp_roadmap_grupos', columns: ['numero', 'nombre'], range: [0, ALL] })
  return new Map(rows.map((r) => [Number(r.numero), r.nombre as string]))
}

const nombreDeGrupo = (nombres: Map<number, string>, n: number) => nombres.get(n) || `Grupo ${n}`

function tareaResumen(r: Row, gente: Map<string, Persona>, nombresDeGrupo: Map<number, string>) {
  const enBacklog = r.backlog === true
  const sprint = Number(r.sprint) || 0
  return {
    id: r.id,
    titulo: str(r.tarea) ?? '(sin título)',
    estado: estadoLabel(r.estado),
    // En el backlog no hay prioridad a propósito: se elige al pasar la tarea al tablero.
    prioridad: enBacklog ? null : prioridadLabel(r.prioridad),
    en_backlog: enBacklog,
    grupo: enBacklog ? (sprint ? { numero: sprint, nombre: nombreDeGrupo(nombresDeGrupo, sprint) } : 'Sin planificar') : null,
    responsables: responsablesDe(r.pend).map((id) => nombreDe(gente, id)),
    area: str(r.modulo) ?? null,
    depende_de: str(r.dep) ?? null,
    creada: r.creada ?? null,
    actualizada: r.updated_at ?? null,
  }
}

const listRoadmapTasks: McpToolDef = {
  name: 'list_roadmap_tasks',
  title: 'Tareas del roadmap',
  description:
    'Lista las tareas del roadmap interno de Propelia. Por defecto, las del tablero (no las del backlog) sin las terminadas. ' +
    'Estados: Pendiente (Nueva), En curso, Bloqueado, Revision (En revisión), Hecho (Terminada). ' +
    'Prioridades: critica, urgente, semanal, mensual (las del backlog no tienen). El detalle de una tarea sale de get_roadmap_task.',
  inputSchema: {
    en_backlog: z.boolean().optional().describe('true: las del backlog (lo planificado que todavía no entró al tablero). Por defecto false.'),
    estado: z.enum(ESTADO_IDS).optional(),
    incluir_terminadas: z.boolean().optional().describe('Sin `estado`, también las terminadas (por defecto no).'),
    prioridad: z.enum(PRIORIDAD_IDS).optional(),
    responsable: uuid.optional().describe('Id de una persona (list_team o get_me).'),
    grupo: z.number().int().min(0).optional().describe('Número de grupo del backlog (list_backlog_groups); 0 = sin planificar.'),
    buscar: z.string().min(2).max(100).optional().describe('Texto en el título, el código, el área o la dependencia.'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const enBacklog = args.en_backlog === true
    const filters: Filter[] = [{ op: 'eq', column: 'backlog', value: enBacklog }]
    if (typeof args.estado === 'string') filters.push({ op: 'eq', column: 'estado', value: args.estado })
    else if (args.incluir_terminadas !== true) filters.push({ op: 'in', column: 'estado', values: ESTADO_IDS.filter((e) => e !== 'Hecho') })
    if (typeof args.prioridad === 'string') filters.push({ op: 'eq', column: 'prioridad', value: args.prioridad })
    if (typeof args.responsable === 'string') filters.push({ op: 'contains', column: 'pend', value: [args.responsable] })
    if (typeof args.grupo === 'number') {
      filters.push(args.grupo === 0 ? { op: 'is_null', column: 'sprint' } : { op: 'eq', column: 'sprint', value: args.grupo })
    }
    if (typeof args.buscar === 'string') filters.push({ op: 'ilike', column: 'busqueda', value: args.buscar.toLowerCase() })

    const [{ rows, total }, gente, nombres] = await Promise.all([
      db.select({
        view: 'mcp_roadmap_tareas',
        columns: TAREA_COLUMNS,
        filters,
        order: enBacklog
          ? [{ column: 'sprint', ascending: true }, { column: 'updated_at', ascending: false }]
          : [{ column: 'updated_at', ascending: false }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
      grupos(db),
    ])
    return paged('tareas', rows.map((r) => tareaResumen(r, gente, nombres)), total, p)
  },
}

const MAX_CHAT = 30

const getRoadmapTask: McpToolDef = {
  name: 'get_roadmap_task',
  title: 'Tarea del roadmap',
  description:
    'Una tarea del roadmap entera: estado, prioridad, responsables, la explicación como texto, el checklist de pasos, ' +
    'los avisos que dejó el equipo y los últimos mensajes de su conversación.',
  inputSchema: { id: z.string().min(1).max(100).describe('El id de la tarea (list_roadmap_tasks).') },
  async run({ db }, args) {
    const [{ rows }, gente, nombres] = await Promise.all([
      db.select({
        view: 'mcp_roadmap_tareas',
        columns: [...TAREA_COLUMNS, 'expl', 'subtareas', 'chat'],
        filters: [{ op: 'eq', column: 'id', value: String(args.id) }],
        range: [0, 0],
      }),
      equipo(db),
      grupos(db),
    ])
    const r = rows[0]
    if (!r) return { found: false }
    const pasos: Paso[] = Array.isArray(r.subtareas) ? r.subtareas : []
    const chat: Row[] = Array.isArray(r.chat) ? r.chat : []
    return {
      found: true,
      ...tareaResumen(r, gente, nombres),
      explicacion: explATexto(r.expl, pasos),
      pasos: pasos.map((s) => ({
        paso: str(s.titulo) ?? '(sin título)',
        estado: estadoLabel(s.estado),
        responsable: nombreDe(gente, s.resp),
      })),
      avisos: avisosDeExpl(r.expl).map((a) => ({
        texto: a.texto,
        autor: nombreDe(gente, a.autor),
        fecha: a.ts,
        visto: a.visto,
        para: a.para.length ? a.para.map((id) => nombreDe(gente, id)) : 'todo el equipo',
      })),
      conversacion: chat.slice(-MAX_CHAT).map((m) => ({
        autor: nombreDe(gente, m.autor),
        fecha: fechaISO(m.ts),
        texto: typeof m.texto === 'string' ? m.texto : '',
      })),
    }
  },
}

const listBacklogGroups: McpToolDef = {
  name: 'list_backlog_groups',
  title: 'Grupos del backlog',
  description: 'Los grupos en que se planifica el backlog, con su número, nombre y cuántas tareas tiene cada uno.',
  inputSchema: {},
  async run({ db }) {
    const [nombres, { rows }] = await Promise.all([
      grupos(db),
      db.select({ view: 'mcp_roadmap_tareas', columns: ['sprint'], filters: [{ op: 'eq', column: 'backlog', value: true }], range: [0, ALL] }),
    ])
    const cuenta = new Map<number, number>()
    for (const r of rows) {
      const n = Number(r.sprint) || 0
      cuenta.set(n, (cuenta.get(n) ?? 0) + 1)
    }
    const numeros = [...new Set([...nombres.keys(), ...cuenta.keys()])].filter((n) => n > 0).sort((a, b) => a - b)
    return {
      grupos: numeros.map((n) => ({ numero: n, nombre: nombreDeGrupo(nombres, n), tareas: cuenta.get(n) ?? 0 })),
      sin_planificar: cuenta.get(0) ?? 0,
    }
  },
}

// ─── CRM ────────────────────────────────────────────────────────────────────

const LEAD_COLUMNS = [
  'id', 'assigned_to', 'funnel_stage_id', 'stage_label', 'descartado', 'channel_label', 'lead_type', 'importante',
  'recontact_at', 'created_at', 'updated_at', 'last_important_event_at', 'company_name', 'city', 'neighborhood',
] as const

function leadResumen(r: Row, gente: Map<string, Persona>) {
  return {
    id: r.id,
    inmobiliaria: str(r.company_name) ?? '(sin nombre)',
    ciudad: str(r.city) ?? null,
    barrio: str(r.neighborhood) ?? null,
    etapa: r.stage_label ?? null,
    descartado: r.descartado === true,
    tipo: r.lead_type,
    importante: r.importante === true,
    responsable: nombreDe(gente, r.assigned_to),
    canal: r.channel_label ?? null,
    recontactar_el: r.recontact_at ?? null,
    ultima_actividad: r.last_important_event_at ?? null,
    creado: r.created_at,
    actualizado: r.updated_at,
  }
}

/** Nombre de la inmobiliaria por lead, para las listas de tareas y reuniones. */
async function inmobiliarias(db: McpDb, leadIds: unknown[]): Promise<Map<string, string>> {
  const ids = [...new Set(leadIds.filter((x): x is string => typeof x === 'string'))]
  if (ids.length === 0) return new Map()
  const { rows } = await db.select({ view: 'mcp_crm_leads', columns: ['id', 'company_name'], filters: [{ op: 'in', column: 'id', values: ids }], range: [0, ALL] })
  return new Map(rows.map((r) => [r.id as string, str(r.company_name) ?? '(sin nombre)']))
}

const listCrmStages: McpToolDef = {
  name: 'list_crm_stages',
  title: 'Funnel del CRM',
  description: 'Las etapas del funnel del CRM en orden, con cuántos leads hay en cada una (de las carteras que el usuario puede ver).',
  inputSchema: {},
  async run({ db }) {
    const [{ rows: etapas }, { rows: leads }] = await Promise.all([
      db.select({ view: 'mcp_crm_stages', columns: ['id', 'label', 'value', 'position', 'is_out_of_funnel'], order: [{ column: 'position', ascending: true }], range: [0, ALL] }),
      db.select({ view: 'mcp_crm_leads', columns: ['funnel_stage_id'], range: [0, ALL] }),
    ])
    const cuenta = new Map<string, number>()
    for (const l of leads) cuenta.set(l.funnel_stage_id, (cuenta.get(l.funnel_stage_id) ?? 0) + 1)
    return {
      total_leads: leads.length,
      etapas: etapas.map((e) => ({
        id: e.id,
        nombre: e.label,
        descartado: e.value === 'DISCARDED',
        fuera_del_funnel: e.is_out_of_funnel === true,
        leads: cuenta.get(e.id) ?? 0,
      })),
    }
  },
}

const listCrmLeads: McpToolDef = {
  name: 'list_crm_leads',
  title: 'Leads del CRM',
  description:
    'Lista los leads (inmobiliarias) del CRM de las carteras que el usuario puede ver, del más tocado al menos. ' +
    'Por defecto sin descartados. Sin teléfonos ni emails. El detalle de uno sale de get_crm_lead.',
  inputSchema: {
    etapa_id: uuid.optional().describe('Id de una etapa (list_crm_stages).'),
    etapa: z.string().min(2).max(60).optional().describe('Parte del nombre de la etapa, ej. "demo".'),
    responsable: uuid.optional().describe('Id de quien lleva la cartera (list_team o get_me).'),
    importante: z.boolean().optional().describe('Sólo los marcados con estrella.'),
    tipo: z.enum(['LEAD', 'ONBOARDING', 'CLIENT']).optional().describe('LEAD (en venta), ONBOARDING (dándose de alta) o CLIENT.'),
    incluir_descartados: z.boolean().optional(),
    buscar: z.string().min(2).max(100).optional().describe('Texto en el nombre, la ciudad, el barrio, la web o el lote.'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const filters: Filter[] = []
    if (typeof args.etapa_id === 'string') filters.push({ op: 'eq', column: 'funnel_stage_id', value: args.etapa_id })
    if (typeof args.etapa === 'string') filters.push({ op: 'ilike', column: 'stage_label', value: args.etapa })
    if (typeof args.responsable === 'string') filters.push({ op: 'eq', column: 'assigned_to', value: args.responsable })
    if (args.importante === true) filters.push({ op: 'eq', column: 'importante', value: true })
    if (typeof args.tipo === 'string') filters.push({ op: 'eq', column: 'lead_type', value: args.tipo })
    const pidioEtapa = typeof args.etapa_id === 'string' || typeof args.etapa === 'string'
    if (args.incluir_descartados !== true && !pidioEtapa) filters.push({ op: 'eq', column: 'descartado', value: false })
    if (typeof args.buscar === 'string') filters.push({ op: 'ilike', column: 'busqueda', value: args.buscar.toLowerCase() })

    const [{ rows, total }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_leads',
        columns: LEAD_COLUMNS,
        filters,
        order: [{ column: 'updated_at', ascending: false }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
    ])
    return paged('leads', rows.map((r) => leadResumen(r, gente)), total, p)
  },
}

const MAX_ACTIVIDAD = 40

const getCrmLead: McpToolDef = {
  name: 'get_crm_lead',
  title: 'Lead del CRM',
  description:
    'Un lead entero: la inmobiliaria (web, Idealista, agentes, CRM que usa, consejo del SDR), sus contactos (nombre, rol y si ' +
    'decide; sin teléfonos ni emails), tareas, reuniones/demos, la actividad registrada (llamadas, notas, sistema) y los cambios de etapa.',
  inputSchema: {
    lead_id: uuid,
    actividad: z.number().int().min(0).max(MAX_ACTIVIDAD).optional().describe(`Cuántas actividades, de la más nueva (por defecto 20, tope ${MAX_ACTIVIDAD}).`),
  },
  async run({ db }, args) {
    const leadId = String(args.lead_id)
    const porLead: Filter[] = [{ op: 'eq', column: 'lead_id', value: leadId }]
    const cuantas = typeof args.actividad === 'number' ? args.actividad : 20
    const [{ rows }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_leads',
        columns: [...LEAD_COLUMNS, 'discard_reason', 'website', 'idealista_url', 'google_maps_url', 'agents_count', 'current_crm',
          'idealista_years', 'idealista_listings', 'sdr_advice', 'import_batch', 'selection_reason', 'contactos'],
        filters: [{ op: 'eq', column: 'id', value: leadId }],
        range: [0, 0],
      }),
      equipo(db),
    ])
    const r = rows[0]
    if (!r) return { found: false }

    const [tareas, reuniones, actividad, cambios, etapas] = await Promise.all([
      db.select({ view: 'mcp_crm_tasks', columns: ['title', 'due_date', 'due_time', 'completed', 'completed_at', 'assigned_to'], filters: porLead, order: [{ column: 'due_date', ascending: true }], range: [0, 49] }),
      db.select({ view: 'mcp_crm_meetings', columns: ['title', 'starts_at', 'ends_at', 'status', 'cancel_reason', 'assigned_to'], filters: porLead, order: [{ column: 'starts_at', ascending: false }], range: [0, 19] }),
      cuantas > 0
        ? db.select({ view: 'mcp_crm_comments', columns: ['comment_type', 'description', 'long_description', 'created_by', 'created_at'], filters: porLead, order: [{ column: 'created_at', ascending: false }], range: [0, cuantas - 1] })
        : Promise.resolve({ rows: [], total: 0 }),
      db.select({ view: 'mcp_crm_stage_history', columns: ['from_stage_id', 'to_stage_id', 'changed_by', 'changed_at'], filters: porLead, order: [{ column: 'changed_at', ascending: false }], range: [0, 29] }),
      db.select({ view: 'mcp_crm_stages', columns: ['id', 'label'], range: [0, ALL] }),
    ])
    const etapa = new Map(etapas.rows.map((e) => [e.id as string, e.label as string]))
    const nombreEtapa = (id: unknown) => (typeof id === 'string' ? (etapa.get(id) ?? 'una etapa borrada') : null)

    return {
      found: true,
      ...leadResumen(r, gente),
      motivo_descarte: str(r.discard_reason) ?? null,
      inmobiliaria_datos: {
        web: str(r.website) ?? null,
        idealista: str(r.idealista_url) ?? null,
        google_maps: str(r.google_maps_url) ?? null,
        agentes: r.agents_count ?? null,
        crm_que_usa: str(r.current_crm) ?? null,
        anios_en_idealista: r.idealista_years ?? null,
        anuncios_en_idealista: r.idealista_listings ?? null,
        lote: str(r.import_batch) ?? null,
        motivo_de_seleccion: str(r.selection_reason) ?? null,
        consejo_sdr: str(r.sdr_advice) ?? null,
      },
      contactos: Array.isArray(r.contactos) ? r.contactos : [],
      tareas: tareas.rows.map((t) => ({
        titulo: t.title,
        vence: t.due_date ?? null,
        hora_espana: t.due_time ? String(t.due_time).slice(0, 5) : null,
        hecha: t.completed === true,
        hecha_el: t.completed_at ?? null,
        responsable: nombreDe(gente, t.assigned_to),
      })),
      reuniones: reuniones.rows.map((m) => ({
        titulo: m.title,
        inicio: m.starts_at,
        fin: m.ends_at,
        estado: m.status,
        motivo_cancelacion: str(m.cancel_reason) ?? null,
        responsable: nombreDe(gente, m.assigned_to),
      })),
      actividad: actividad.rows.map((k) => {
        const a = actividadDe(k.comment_type, k.long_description)
        return { fecha: k.created_at, tipo: a.tipo, autor: nombreDe(gente, k.created_by), con: a.con, texto: str(k.description) ?? '' }
      }),
      cambios_de_etapa: cambios.rows.map((h) => ({
        fecha: h.changed_at,
        de: nombreEtapa(h.from_stage_id),
        a: nombreEtapa(h.to_stage_id),
        por: nombreDe(gente, h.changed_by),
      })),
    }
  },
}

const listCrmTasks: McpToolDef = {
  name: 'list_crm_tasks',
  title: 'Tareas del CRM',
  description:
    'Las tareas del CRM (llamar, mandar algo, seguir a un lead). Por defecto, las pendientes del usuario conectado. ' +
    '"vencidas" = pendientes de antes de hoy (hora de España); "hoy" = pendientes para hoy o vencidas. La hora es de España.',
  inputSchema: {
    estado: z.enum(['pendientes', 'hoy', 'vencidas', 'hechas', 'todas']).optional().describe('Por defecto, pendientes.'),
    responsable: uuid.optional().describe('Id de una persona. Por defecto, el usuario conectado.'),
    de_todo_el_equipo: z.boolean().optional().describe('true: de todas las carteras que el usuario ve, no sólo las suyas.'),
    lead_id: uuid.optional(),
    desde: day.optional().describe('Vencimiento desde (inclusive).'),
    hasta: day.optional().describe('Vencimiento hasta (inclusive).'),
    limit,
    offset,
  },
  async run({ db, userId }, args) {
    const p = page(args)
    const estado = typeof args.estado === 'string' ? args.estado : 'pendientes'
    const hoy = hoyEnEspana()
    const filters: Filter[] = []
    if (typeof args.lead_id === 'string') filters.push({ op: 'eq', column: 'lead_id', value: args.lead_id })
    else if (typeof args.responsable === 'string') filters.push({ op: 'eq', column: 'assigned_to', value: args.responsable })
    else if (args.de_todo_el_equipo !== true) filters.push({ op: 'eq', column: 'assigned_to', value: userId })
    if (estado === 'hechas') filters.push({ op: 'eq', column: 'completed', value: true })
    else if (estado !== 'todas') filters.push({ op: 'eq', column: 'completed', value: false })
    if (estado === 'vencidas') filters.push({ op: 'lt', column: 'due_date', value: hoy })
    if (estado === 'hoy') filters.push({ op: 'lte', column: 'due_date', value: hoy })
    if (typeof args.desde === 'string') filters.push({ op: 'gte', column: 'due_date', value: args.desde })
    if (typeof args.hasta === 'string') filters.push({ op: 'lte', column: 'due_date', value: args.hasta })

    const [{ rows, total }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_tasks',
        columns: ['id', 'lead_id', 'title', 'due_date', 'due_time', 'completed', 'completed_at', 'assigned_to'],
        filters,
        order: estado === 'hechas' ? [{ column: 'completed_at', ascending: false }] : [{ column: 'due_date', ascending: true }, { column: 'due_time', ascending: true }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
    ])
    const inmo = await inmobiliarias(db, rows.map((t) => t.lead_id))
    return {
      hoy_en_espana: hoy,
      ...paged('tareas', rows.map((t) => ({
        id: t.id,
        titulo: t.title,
        vence: t.due_date ?? null,
        hora_espana: t.due_time ? String(t.due_time).slice(0, 5) : null,
        vencida: !t.completed && !!t.due_date && t.due_date < hoy,
        hecha: t.completed === true,
        hecha_el: t.completed_at ?? null,
        responsable: nombreDe(gente, t.assigned_to),
        lead_id: t.lead_id ?? null,
        inmobiliaria: t.lead_id ? (inmo.get(t.lead_id) ?? null) : null,
      })), total, p),
    }
  },
}

const listCrmMeetings: McpToolDef = {
  name: 'list_crm_meetings',
  title: 'Reuniones y demos',
  description:
    'Las reuniones del CRM (las demos incluidas), de las carteras que el usuario ve. Por defecto, las próximas desde hoy. ' +
    'Las horas van en ISO con zona; las demos se agendan en hora de España.',
  inputSchema: {
    desde: day.optional().describe('Desde ese día (por defecto, hoy en España).'),
    hasta: day.optional().describe('Hasta ese día, inclusive.'),
    responsable: uuid.optional(),
    lead_id: uuid.optional(),
    estado: z.enum(['scheduled', 'cancelled']).optional().describe('scheduled (agendada) o cancelled (cancelada).'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const filters: Filter[] = []
    const desde = typeof args.desde === 'string' ? args.desde : hoyEnEspana()
    if (typeof args.lead_id !== 'string' || typeof args.desde === 'string') filters.push({ op: 'gte', column: 'starts_at', value: desde })
    if (typeof args.hasta === 'string') filters.push({ op: 'lt', column: 'starts_at', value: siguienteDia(args.hasta) })
    if (typeof args.responsable === 'string') filters.push({ op: 'eq', column: 'assigned_to', value: args.responsable })
    if (typeof args.lead_id === 'string') filters.push({ op: 'eq', column: 'lead_id', value: args.lead_id })
    if (typeof args.estado === 'string') filters.push({ op: 'eq', column: 'status', value: args.estado })

    const [{ rows, total }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_meetings',
        columns: ['id', 'lead_id', 'assigned_to', 'starts_at', 'ends_at', 'status', 'title', 'cancel_reason', 'created_by'],
        filters,
        order: [{ column: 'starts_at', ascending: true }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
    ])
    const inmo = await inmobiliarias(db, rows.map((m) => m.lead_id))
    return paged('reuniones', rows.map((m) => ({
      id: m.id,
      titulo: m.title,
      inicio: m.starts_at,
      fin: m.ends_at,
      estado: m.status,
      motivo_cancelacion: str(m.cancel_reason) ?? null,
      responsable: nombreDe(gente, m.assigned_to),
      agendada_por: nombreDe(gente, m.created_by),
      lead_id: m.lead_id ?? null,
      inmobiliaria: m.lead_id ? (inmo.get(m.lead_id) ?? null) : null,
    })), total, p)
  },
}

/** '2026-10-31' → '2026-11-01', para que `hasta` incluya el día entero. */
export function siguienteDia(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ─── clientes y caja (sólo SUPERADMIN: las vistas devuelven vacío a los demás) ──

const SOLO_SUPERADMIN = 'Sólo un SUPERADMIN la ve: a otro rol le devuelve la lista vacía.'

const listOnboardings: McpToolDef = {
  name: 'list_onboardings',
  title: 'Altas de clientes',
  description: `Las altas (onboarding) de clientes nuevos de Propelia: empresa, quién la lleva, si el cliente ya mandó su equipo y qué tareas del alta están hechas. ${SOLO_SUPERADMIN}`,
  inputSchema: {
    estado: z.enum(['en_curso', 'completadas', 'todas']).optional().describe('Por defecto, en curso.'),
    responsable: uuid.optional().describe('Id de quien lleva el alta.'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const estado = typeof args.estado === 'string' ? args.estado : 'en_curso'
    const filters: Filter[] = []
    if (estado === 'en_curso') filters.push({ op: 'is_null', column: 'completed_at' })
    if (estado === 'completadas') filters.push({ op: 'not_null', column: 'completed_at' })
    if (typeof args.responsable === 'string') filters.push({ op: 'eq', column: 'assigned_to', value: args.responsable })
    const [{ rows, total }, gente] = await Promise.all([
      db.select({
        view: 'mcp_onboardings',
        columns: ['id', 'lead_id', 'company_name', 'website', 'assigned_to', 'created_at', 'submitted_at', 'completed_at', 'tareas_hechas'],
        filters,
        order: [{ column: 'created_at', ascending: false }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
    ])
    const inmo = await inmobiliarias(db, rows.map((o) => o.lead_id))
    return paged('altas', rows.map((o) => ({
      id: o.id,
      lead_id: o.lead_id,
      empresa: str(o.company_name) ?? inmo.get(o.lead_id) ?? null,
      web: str(o.website) ?? null,
      lleva: nombreDe(gente, o.assigned_to) ?? 'sin asignar',
      creada: o.created_at,
      equipo_recibido_el: o.submitted_at ?? null,
      completada_el: o.completed_at ?? null,
      tareas_hechas: Array.isArray(o.tareas_hechas) ? o.tareas_hechas : [],
    })), total, p)
  },
}

const listExpenses: McpToolDef = {
  name: 'list_expenses',
  title: 'Caja',
  description:
    `Los gastos de la caja de la empresa (fijos y variables), del más nuevo al más viejo, con el total y cuánto pagó cada uno ` +
    `de lo filtrado. Montos en euros. ${SOLO_SUPERADMIN}`,
  inputSchema: {
    desde: day.optional(),
    hasta: day.optional().describe('Inclusive.'),
    tipo: z.enum(['FIXED', 'VARIABLE']).optional().describe('FIXED (fijo mensual) o VARIABLE.'),
    pagado_por: uuid.optional(),
    buscar: z.string().min(2).max(100).optional().describe('Texto en el concepto.'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const filters: Filter[] = []
    if (typeof args.desde === 'string') filters.push({ op: 'gte', column: 'date', value: args.desde })
    if (typeof args.hasta === 'string') filters.push({ op: 'lte', column: 'date', value: args.hasta })
    if (typeof args.tipo === 'string') filters.push({ op: 'eq', column: 'expense_type', value: args.tipo })
    if (typeof args.pagado_por === 'string') filters.push({ op: 'eq', column: 'paid_by', value: args.pagado_por })
    if (typeof args.buscar === 'string') filters.push({ op: 'ilike', column: 'expense_name', value: args.buscar })
    // Entera, para que el total y el reparto sean de todo lo filtrado y no de la página.
    const [{ rows }, gente] = await Promise.all([
      db.select({
        view: 'mcp_expenses',
        columns: ['id', 'expense_name', 'expense_type', 'amount', 'date', 'period', 'recurrence', 'status', 'notes', 'paid_by'],
        filters,
        order: [{ column: 'date', ascending: false }],
        range: [0, ALL],
      }),
      equipo(db),
    ])
    const monto = (r: Row) => Number(r.amount) || 0
    const porPersona: Record<string, number> = {}
    for (const r of rows) {
      const quien = nombreDe(gente, r.paid_by) ?? 'Sin pagar'
      porPersona[quien] = redondear((porPersona[quien] ?? 0) + monto(r))
    }
    const pagina = rows.slice(p.offset, p.offset + p.limit)
    return {
      total_eur: redondear(rows.reduce((s, r) => s + monto(r), 0)),
      pagado_por_persona_eur: porPersona,
      ...paged('gastos', pagina.map((r) => ({
        id: r.id,
        concepto: r.expense_name,
        tipo: r.expense_type === 'FIXED' ? 'fijo' : 'variable',
        monto_eur: monto(r),
        fecha: r.date ?? null,
        periodo: str(r.period) ?? null,
        recurrencia: str(r.recurrence) ?? null,
        estado: r.status,
        pagado_por: nombreDe(gente, r.paid_by),
        detalle: str(r.notes) ?? null,
      })), rows.length, p),
    }
  },
}

const redondear = (n: number) => Math.round(n * 100) / 100

export const TOOLS: readonly McpToolDef[] = [
  getMe, listTeam,
  listRoadmapTasks, getRoadmapTask, listBacklogGroups,
  listCrmStages, listCrmLeads, getCrmLead, listCrmTasks, listCrmMeetings,
  listOnboardings, listExpenses,
]

/** Filas devueltas, para la auditoría: una ficha cuenta 1 (o 0 si no existe); una lista, su largo. */
export function countResult(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Record<string, unknown>
  if (typeof r.found === 'boolean') return r.found ? 1 : 0
  for (const v of Object.values(r)) if (Array.isArray(v)) return v.length
  return null
}
