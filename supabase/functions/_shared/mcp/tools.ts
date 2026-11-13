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
import { actividadDe, demoVieja, diasEntre, horaEnEspana, hoyEnEspana, TEXTO_DE_DEMO } from './crm.ts'
import {
  esDescartado, esImportante, esParaRecontactar, esPendienteAgendar, ESTADOS_QUE_NO_LLEGARON, type Etapa, estaVencida,
  etapaDe, type Llamada, leadsConDecisor, type NombreDePeriodo, type Objetivo, OBJETIVOS, objetivosDe, type ObjetivosDelPeriodo,
  ordenarImportantes, ordenarPorEstado, ordenarPorProximaTarea, pendientesDePersona, type Periodo, periodoDe, PERIODOS,
  type ProximaTarea, proximaTareaPorLead, seguimientoDelLead, semanasHaciaAtras, sumarDias, sumarResumenes, type Tarea,
  tasaDeDecisor, tocaHoyOVencida,
} from './crmReglas.ts'

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
  // Sólo SUPERADMIN, como /roadmap: lo corta la vista (20261106185846_mcp_crm_flujos).
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

const STAGE_COLUMNS = [
  'id', 'label', 'value', 'position', 'is_out_of_funnel', 'management_type', 'starts_onboarding', 'allows_tasks', 'show_in_dashboard',
] as const

/** `management_type` como lo rotula la configuración del funnel (GESTIONES_DE_ETAPA del front). */
const GESTIONES: Record<string, string> = { sin_contactar: 'Primer contacto', por_tarea: 'Seguimiento' }

async function etapasDelFunnel(db: McpDb): Promise<Map<string, Etapa>> {
  const { rows } = await db.select({ view: 'mcp_crm_stages', columns: STAGE_COLUMNS, range: [0, ALL] })
  return new Map(rows.map((e) => [e.id as string, {
    id: e.id, label: e.label, position: Number(e.position) || 0, is_out_of_funnel: e.is_out_of_funnel === true,
    management_type: e.management_type ?? null, allows_tasks: e.allows_tasks, show_in_dashboard: e.show_in_dashboard,
  }]))
}

/** Las tareas pendientes con lead (las sueltas no marcan a ningún lead), de quien sea o de una persona. */
async function tareasPendientes(db: McpDb, de?: string): Promise<Tarea[]> {
  const filters: Filter[] = [{ op: 'eq', column: 'completed', value: false }]
  if (de) filters.push({ op: 'eq', column: 'assigned_to', value: de })
  const { rows } = await db.select({
    view: 'mcp_crm_tasks', columns: ['lead_id', 'title', 'due_date', 'due_time', 'completed', 'assigned_to'], filters, range: [0, ALL],
  })
  return rows.map((t) => ({ ...t, completed: t.completed === true })) as Tarea[]
}

function proximaTareaSalida(p: ProximaTarea | undefined, gente: Map<string, Persona>) {
  if (!p) return null
  return {
    titulo: p.tarea.title ?? null,
    vence: p.tarea.due_date ?? null,
    hora_espana: p.tarea.due_time ? String(p.tarea.due_time).slice(0, 5) : null,
    responsable: nombreDe(gente, p.tarea.assigned_to),
    pendientes_del_lead: p.pendientes,
  }
}

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
  description:
    'Las etapas del funnel del CRM en orden, con cuántos leads hay en cada una (de las carteras que el usuario puede ver) ' +
    'y su configuración: gestión (Primer contacto / Seguimiento), si deja agendar tareas, si sus leads salen en el ' +
    'Dashboard y si entrar ahí arranca el onboarding.',
  inputSchema: {},
  async run({ db }) {
    const [{ rows: etapas }, { rows: leads }] = await Promise.all([
      db.select({ view: 'mcp_crm_stages', columns: STAGE_COLUMNS, order: [{ column: 'position', ascending: true }], range: [0, ALL] }),
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
        gestion: GESTIONES[e.management_type] ?? null,
        permite_tareas: e.allows_tasks !== false,
        en_el_dashboard: e.show_in_dashboard === true,
        arranca_onboarding: e.starts_onboarding === true,
        leads: cuenta.get(e.id) ?? 0,
      })),
    }
  },
}

/**
 * Los Objetivos de una persona en un período (`useObjetivos` del front): sus llamadas registradas,
 * las reuniones que agendó, los mails «Presentación con vídeo» que salieron y, para saber si un
 * decisor es nuevo, el historial de esos leads de cualquiera. Los días son de España.
 */
async function objetivosDePersona(db: McpDb, persona: string, periodo: Periodo): Promise<ObjetivosDelPeriodo> {
  const desde = inicioDelDiaEnEspana(periodo.desde)
  const hasta = inicioDelDiaEnEspana(periodo.hasta)
  const registros = (rows: Row[]) =>
    rows.filter((c) => typeof c.long_description === 'string' && c.long_description.startsWith('<!--act-->')) as Llamada[]
  const [comentarios, reuniones, emails] = await Promise.all([
    db.select({
      view: 'mcp_crm_comments', columns: ['lead_id', 'created_at', 'long_description'],
      filters: [
        { op: 'eq', column: 'created_by', value: persona }, { op: 'eq', column: 'comment_type', value: 'MANUAL' },
        { op: 'gte', column: 'created_at', value: desde }, { op: 'lt', column: 'created_at', value: hasta },
      ],
      range: [0, ALL],
    }),
    db.select({
      view: 'mcp_crm_meetings', columns: ['lead_id'],
      filters: [{ op: 'eq', column: 'created_by', value: persona }, { op: 'gte', column: 'created_at', value: desde }, { op: 'lt', column: 'created_at', value: hasta }],
      range: [0, ALL],
    }),
    db.select({
      view: 'mcp_crm_emails', columns: ['lead_id', 'status'],
      filters: [
        { op: 'eq', column: 'sent_by', value: persona }, { op: 'eq', column: 'plantilla', value: 'presentacion-video' },
        { op: 'gte', column: 'sent_at', value: desde }, { op: 'lt', column: 'sent_at', value: hasta },
      ],
      range: [0, ALL],
    }),
  ])
  const llamadas = registros(comentarios.rows)
  const conDecisor = leadsConDecisor(llamadas)
  const historial = conDecisor.length === 0 ? [] : registros((await db.select({
    view: 'mcp_crm_comments', columns: ['lead_id', 'created_at', 'long_description'],
    filters: [{ op: 'in', column: 'lead_id', values: conDecisor }, { op: 'eq', column: 'comment_type', value: 'MANUAL' }, { op: 'lt', column: 'created_at', value: hasta }],
    range: [0, ALL],
  })).rows)
  // Los que Resend no llegó a mandar no cuentan; los que rebotaron sí: salieron.
  const presentaciones = emails.rows.filter((e) => e.status !== 'failed' && e.status !== 'suppressed').map((e) => ({ lead_id: e.lead_id ?? null }))
  return objetivosDe(llamadas, reuniones.rows.map((m) => ({ lead_id: m.lead_id ?? null })), { presentaciones, historial })
}

const listCrmLeads: McpToolDef = {
  name: 'list_crm_leads',
  title: 'Leads del CRM',
  description:
    'Lista los leads (inmobiliarias) del CRM de las carteras que el usuario puede ver, con los mismos filtros que la lista de /crm. ' +
    'Por defecto sin descartados (salen al buscar, al elegir su etapa, con para_recontactar y con un objetivo). ' +
    '"pendiente_agendar" = en una etapa de Seguimiento sin ninguna tarea pendiente de quien mira; "tareas_hoy" = alguna tarea ' +
    'pendiente para hoy o vencida; "tareas_vencidas" = alguna vencida antes de hoy (hora de España). "objetivo" = los leads de ' +
    'ese número de los Objetivos de esta semana de quien mira. Sin teléfonos ni emails. El detalle de uno sale de get_crm_lead.',
  inputSchema: {
    etapa_id: uuid.optional().describe('Id de una etapa (list_crm_stages).'),
    etapa: z.string().min(2).max(60).optional().describe('Parte del nombre de la etapa, ej. "demo".'),
    responsable: uuid.optional().describe('Id de quien lleva la cartera (list_team o get_me).'),
    importante: z.boolean().optional().describe('Sólo los marcados con estrella.'),
    tipo: z.enum(['LEAD', 'ONBOARDING', 'CLIENT']).optional().describe('LEAD (en venta), ONBOARDING (dándose de alta) o CLIENT.'),
    incluir_descartados: z.boolean().optional(),
    buscar: z.string().min(2).max(100).optional().describe('Texto en el nombre, la ciudad, el barrio, la web o el lote.'),
    canal: z.string().min(2).max(60).optional().describe('Parte del nombre del canal por el que llegó.'),
    lote: z.string().min(2).max(60).optional().describe('Lote de importación, ej. "BCN-S01".'),
    pendiente_agendar: z.boolean().optional().describe('Chip «Pendiente agendar tarea».'),
    tareas_hoy: z.boolean().optional().describe('Chip «Tareas vencidas»: alguna tarea para hoy o vencida.'),
    tareas_vencidas: z.boolean().optional().describe('Subchip «Vencidas»: alguna tarea vencida (la de hoy no).'),
    tareas: z.enum(['con', 'sin']).optional().describe('Con alguna tarea pendiente, o sin ninguna.'),
    para_recontactar: z.boolean().optional().describe('Descartados cuya fecha de volver a llamar ya llegó.'),
    objetivo: z.enum(OBJETIVOS).optional().describe('Los leads de ese número de Objetivos de esta semana.'),
    como: uuid.optional().describe('«Ver como»: de quién son las tareas de pendiente_agendar y los Objetivos. Por defecto, el usuario conectado.'),
    orden: z.enum(['actividad', 'estado', 'tarea']).optional().describe('actividad (lo más tocado arriba, por defecto), estado (lo más avanzado del funnel arriba) o tarea (lo más vencido arriba).'),
    limit,
    offset,
  },
  async run({ db, userId }, args) {
    const p = page(args)
    const hoy = hoyEnEspana()
    const yo = typeof args.como === 'string' ? args.como : userId
    const objetivo = typeof args.objetivo === 'string' ? (args.objetivo as Objetivo) : null
    const orden = typeof args.orden === 'string' ? args.orden : 'actividad'
    const filters: Filter[] = []
    if (typeof args.etapa_id === 'string') filters.push({ op: 'eq', column: 'funnel_stage_id', value: args.etapa_id })
    if (typeof args.etapa === 'string') filters.push({ op: 'ilike', column: 'stage_label', value: args.etapa })
    if (typeof args.responsable === 'string') filters.push({ op: 'eq', column: 'assigned_to', value: args.responsable })
    if (args.importante === true) filters.push({ op: 'eq', column: 'importante', value: true })
    if (typeof args.tipo === 'string') filters.push({ op: 'eq', column: 'lead_type', value: args.tipo })
    if (typeof args.canal === 'string') filters.push({ op: 'ilike', column: 'channel_label', value: args.canal })
    if (typeof args.lote === 'string') filters.push({ op: 'ilike', column: 'import_batch', value: args.lote })
    if (typeof args.buscar === 'string') filters.push({ op: 'ilike', column: 'busqueda', value: args.buscar.toLowerCase() })
    // Como la lista: buscar, elegir la etapa, recontactar y un objetivo levantan el descarte.
    const levantaDescarte = typeof args.etapa_id === 'string' || typeof args.etapa === 'string' || typeof args.buscar === 'string'
      || args.para_recontactar === true || objetivo !== null
    if (args.incluir_descartados !== true && !levantaDescarte) filters.push({ op: 'eq', column: 'descartado', value: false })

    const enMemoria = args.pendiente_agendar === true || args.tareas_hoy === true || args.tareas_vencidas === true
      || typeof args.tareas === 'string' || args.para_recontactar === true || objetivo !== null || orden !== 'actividad'
    const order = [{ column: 'updated_at', ascending: false }]
    if (!enMemoria) {
      const [{ rows, total }, gente] = await Promise.all([
        db.select({ view: 'mcp_crm_leads', columns: LEAD_COLUMNS, filters, order, range: [p.offset, p.offset + p.limit - 1], count: true }),
        equipo(db),
      ])
      return paged('leads', rows.map((r) => leadResumen(r, gente)), total, p)
    }

    // Los chips miran tareas y etapas: se trae la lista entera (la RLS ya recortó) y se filtra
    // acá, como hace la página.
    const [{ rows }, gente, etapas, tareas, delObjetivo] = await Promise.all([
      db.select({ view: 'mcp_crm_leads', columns: LEAD_COLUMNS, filters, order, range: [0, ALL] }),
      equipo(db),
      etapasDelFunnel(db),
      tareasPendientes(db),
      objetivo ? objetivosDePersona(db, yo, periodoDe('semana', hoy)).then((o) => o.leads[objetivo]) : Promise.resolve(null),
    ])
    const proximas = proximaTareaPorLead(tareas)
    const conTareas = new Set(proximas.keys())
    const conTareasDeYo = new Set(tareas.filter((t) => t.assigned_to === yo && t.lead_id).map((t) => t.lead_id!))
    const conVencidas = new Set(tareas.filter((t) => t.lead_id && estaVencida(t, hoy)).map((t) => t.lead_id!))
    const paraHoy = new Set(tareas.filter((t) => t.lead_id && tocaHoyOVencida(t, hoy)).map((t) => t.lead_id!))
    const leads = rows as (Row & { id: string; funnel_stage_id: string | null })[]
    let lista = leads.filter((l) => {
      const descartado = esDescartado(l, etapas)
      return (!delObjetivo || delObjetivo.has(l.id))
        && (args.para_recontactar !== true || esParaRecontactar(l, etapas, hoy))
        && (args.pendiente_agendar !== true || esPendienteAgendar(l, etapas, conTareasDeYo))
        // Como la lista: un descartado con tareas no es trabajo pendiente.
        && (args.tareas_hoy !== true || (paraHoy.has(l.id) && !descartado))
        && (args.tareas_vencidas !== true || (conVencidas.has(l.id) && !descartado))
        && (args.tareas !== 'con' || conTareas.has(l.id))
        && (args.tareas !== 'sin' || !conTareas.has(l.id))
    })
    if (orden === 'estado') lista = ordenarPorEstado(lista, proximas, etapas)
    else if (orden === 'tarea') lista = ordenarPorProximaTarea(lista, proximas)
    const pagina = lista.slice(p.offset, p.offset + p.limit)
    return {
      hoy_en_espana: hoy,
      ...paged('leads', pagina.map((r) => ({
        ...leadResumen(r, gente),
        proxima_tarea: proximaTareaSalida(proximas.get(r.id), gente),
      })), lista.length, p),
    }
  },
}

const MAX_ACTIVIDAD = 40
/** El briefing de una demo trae la historia entera (hoy un lead tiene como mucho ~15). */
const ACTIVIDAD_DEL_BRIEFING = 100

/** Qué es cada `selection_reason` (MOTIVOS_DE_SELECCION del front): con qué ángulo abre el SDR. */
const MOTIVOS_DE_SELECCION: Record<string, string> = {
  inmovilla: 'Usa Inmovilla',
  new: 'Agencia nueva',
  small: 'Agencia pequeña',
}

const FICHA_COLUMNS = [
  ...LEAD_COLUMNS, 'discard_reason', 'website', 'idealista_url', 'google_maps_url', 'agents_count', 'current_crm',
  'idealista_years', 'idealista_listings', 'sdr_advice', 'import_batch', 'selection_reason', 'contactos',
  'created_via', 'batch_activated_on', 'client_notes', 'office_address',
] as const

const MEETING_COLUMNS = [
  'id', 'lead_id', 'assigned_to', 'starts_at', 'ends_at', 'status', 'title', 'cancel_reason', 'created_by', 'created_at',
  'description', 'invitados',
] as const

/**
 * Todo lo que se sabe de un lead, en una pasada: la inmobiliaria, los contactos, las tareas, las
 * reuniones, la actividad, los cambios de etapa y, con `completa`, los emails, las reasignaciones
 * y un resumen con números. Lo usan get_crm_lead y get_demo_briefing.
 */
async function fichaDelLead(db: McpDb, gente: Map<string, Persona>, leadId: string, opts: { actividad: number; completa: boolean }) {
  const porLead: Filter[] = [{ op: 'eq', column: 'lead_id', value: leadId }]
  const { rows } = await db.select({ view: 'mcp_crm_leads', columns: FICHA_COLUMNS, filters: [{ op: 'eq', column: 'id', value: leadId }], range: [0, 0] })
  const r = rows[0]
  if (!r) return null

  const vacio = Promise.resolve({ rows: [] as Row[], total: 0 })
  const [tareas, reuniones, actividad, cambios, etapas, emails, reasignaciones, notasDeDemo] = await Promise.all([
    db.select({ view: 'mcp_crm_tasks', columns: ['title', 'due_date', 'due_time', 'completed', 'completed_at', 'assigned_to'], filters: porLead, order: [{ column: 'due_date', ascending: true }], range: [0, 49] }),
    db.select({ view: 'mcp_crm_meetings', columns: MEETING_COLUMNS, filters: porLead, order: [{ column: 'starts_at', ascending: false }], range: [0, 19] }),
    opts.actividad > 0
      ? db.select({ view: 'mcp_crm_comments', columns: ['comment_type', 'description', 'long_description', 'created_by', 'created_at'], filters: porLead, order: [{ column: 'created_at', ascending: false }], range: [0, opts.actividad - 1] })
      : vacio,
    db.select({ view: 'mcp_crm_stage_history', columns: ['from_stage_id', 'to_stage_id', 'changed_by', 'changed_at'], filters: porLead, order: [{ column: 'changed_at', ascending: false }], range: [0, 29] }),
    db.select({ view: 'mcp_crm_stages', columns: ['id', 'label'], range: [0, ALL] }),
    db.select({ view: 'mcp_crm_emails', columns: ['subject', 'plantilla', 'status', 'sent_at', 'sent_by', 'seen_at'], filters: porLead, order: [{ column: 'sent_at', ascending: false }], range: [0, 29] }),
    opts.completa
      ? db.select({ view: 'mcp_crm_assignment_history', columns: ['from_user_id', 'to_user_id', 'changed_by', 'changed_at'], filters: porLead, order: [{ column: 'changed_at', ascending: false }], range: [0, 19] })
      : vacio,
    db.select({ view: 'mcp_crm_demo_notas', columns: ['texto', 'updated_at'], filters: porLead, range: [0, 0] }),
  ])
  const etapa = new Map(etapas.rows.map((e) => [e.id as string, e.label as string]))
  const nombreEtapa = (id: unknown) => (typeof id === 'string' ? (etapa.get(id) ?? 'una etapa borrada') : null)
  const registros = actividad.rows.map((k) => ({ k, a: actividadDe(k.comment_type, k.long_description) }))

  const ficha: Record<string, unknown> = {
    ...leadResumen(r, gente),
    motivo_descarte: str(r.discard_reason) ?? null,
    como_llego: { canal: r.channel_label ?? null, alta: str(r.created_via) ?? null },
    inmobiliaria_datos: {
      web: str(r.website) ?? null,
      idealista: str(r.idealista_url) ?? null,
      google_maps: str(r.google_maps_url) ?? null,
      direccion_oficina: str(r.office_address) ?? null,
      agentes: r.agents_count ?? null,
      crm_que_usa: str(r.current_crm) ?? null,
      anios_en_idealista: r.idealista_years ?? null,
      anuncios_en_idealista: r.idealista_listings ?? null,
      lote: str(r.import_batch) ?? null,
      lote_activado_el: r.batch_activated_on ?? null,
      motivo_de_seleccion: typeof r.selection_reason === 'string' ? (MOTIVOS_DE_SELECCION[r.selection_reason] ?? r.selection_reason) : null,
      consejo_sdr: str(r.sdr_advice) ?? null,
      notas: str(r.client_notes) ?? null,
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
      id: m.id,
      titulo: m.title,
      inicio: m.starts_at,
      hora_espana: horaEnEspana(m.starts_at),
      estado: m.status,
      motivo_cancelacion: str(m.cancel_reason) ?? null,
      responsable: nombreDe(gente, m.assigned_to),
    })),
    actividad: registros.map(({ k, a }) => ({
      fecha: k.created_at,
      tipo: a.tipo,
      autor: nombreDe(gente, k.created_by),
      con: a.con,
      ...(a.decisor !== undefined ? { decide: a.decisor } : {}),
      ...(a.decisorApuntado ? { decisor_apuntado: a.decisorApuntado } : {}),
      texto: str(k.description) ?? '',
    })),
    cambios_de_etapa: cambios.rows.map((h) => ({
      fecha: h.changed_at,
      de: nombreEtapa(h.from_stage_id),
      a: nombreEtapa(h.to_stage_id),
      por: nombreDe(gente, h.changed_by),
    })),
    correos_enviados: emails.rows.map((e) => ({
      fecha: e.sent_at,
      asunto: e.subject ?? null,
      plantilla: e.plantilla ?? null,
      estado: e.status ?? null,
      no_llego: (ESTADOS_QUE_NO_LLEGARON as readonly string[]).includes(e.status),
      marcado_listo: !!e.seen_at,
      enviado_por: nombreDe(gente, e.sent_by),
    })),
    // El cuadro de la pestaña «Demo» del lead (una sola nota para toda la demo).
    notas_de_la_demo: notasDeDemo.rows[0]
      ? { texto: str(notasDeDemo.rows[0].texto) ?? '', actualizadas: notasDeDemo.rows[0].updated_at ?? null }
      : null,
  }
  if (opts.completa) {
    const ahora = new Date().toISOString()
    const manuales = registros.filter(({ k }) => k.comment_type !== 'SYSTEM')
    const primero = manuales.at(-1)?.k.created_at ?? null
    ficha.reasignaciones = reasignaciones.rows.map((h) => ({
      fecha: h.changed_at,
      de: nombreDe(gente, h.from_user_id),
      a: nombreDe(gente, h.to_user_id),
      por: nombreDe(gente, h.changed_by),
    }))
    ficha.resumen = {
      dias_en_el_crm: diasEntre(r.created_at, ahora),
      primer_contacto_registrado: primero,
      llamadas: manuales.filter(({ a }) => a.tipo === 'llamada').length,
      contactos_fallidos: manuales.filter(({ a }) => a.tipo === 'contacto fallido').length,
      notas: manuales.filter(({ a }) => a.tipo === 'nota').length,
      demos_canceladas: reuniones.rows.filter((m) => m.status === 'cancelled').length,
      decisores_conocidos: (Array.isArray(r.contactos) ? r.contactos : []).filter((c: Row) => c?.decisor === true).map((c: Row) => c.nombre ?? '(sin nombre)'),
    }
  }
  return { ficha, reuniones: reuniones.rows, registros }
}

const getCrmLead: McpToolDef = {
  name: 'get_crm_lead',
  title: 'Lead del CRM',
  description:
    'Un lead entero: la inmobiliaria (web, Idealista, agentes, CRM que usa, consejo del SDR), sus contactos (nombre, rol, si ' +
    'decide y notas; sin teléfonos ni emails), tareas, reuniones/demos, la actividad registrada (llamadas, notas, sistema), los ' +
    'cambios de etapa, los correos enviados (con si llegaron) y las notas de la pestaña Demo. Para preparar una demo, mejor ' +
    'get_demo_briefing.',
  inputSchema: {
    lead_id: uuid,
    actividad: z.number().int().min(0).max(MAX_ACTIVIDAD).optional().describe(`Cuántas actividades, de la más nueva (por defecto 20, tope ${MAX_ACTIVIDAD}).`),
  },
  async run({ db }, args) {
    const gente = await equipo(db)
    const res = await fichaDelLead(db, gente, String(args.lead_id), {
      actividad: typeof args.actividad === 'number' ? args.actividad : 20,
      completa: false,
    })
    return res ? { found: true, ...res.ficha } : { found: false }
  },
}

// ─── demos ──────────────────────────────────────────────────────────────────

interface RegistroDeDemo {
  con: string[]
  decisorApuntado?: string
  texto: string
  autor: unknown
  fecha: unknown
}

/** El registro que dejó cada demo al agendarse, por id de reunión (meta `reunion`). */
function registrosPorReunion(comentarios: Row[]): Map<string, RegistroDeDemo> {
  const porReunion = new Map<string, RegistroDeDemo>()
  for (const k of comentarios) {
    const a = actividadDe(k.comment_type, k.long_description)
    if (a.tipo !== 'demo agendada' || !a.reunion) continue
    porReunion.set(a.reunion, { con: a.con, decisorApuntado: a.decisorApuntado, texto: str(k.description) ?? '', autor: k.created_by, fecha: k.created_at })
  }
  return porReunion
}

/**
 * Lo que la tabla de Demos muestra de cada una (`datosDeLaDemo` del front): desde el 22/10/2026
 * sale del registro de actividad; las de antes lo traen en `description`. Nunca el email.
 */
function demoResumen(m: Row, registro: RegistroDeDemo | undefined, gente: Map<string, Persona>) {
  const vieja = registro ? null : demoVieja(m.description)
  return {
    id: m.id,
    titulo: m.title,
    inicio: m.starts_at,
    fin: m.ends_at,
    hora_espana: horaEnEspana(m.starts_at),
    estado: m.status,
    motivo_cancelacion: str(m.cancel_reason) ?? null,
    responsable: nombreDe(gente, m.assigned_to),
    agendada_por: nombreDe(gente, registro?.autor ?? m.created_by),
    agendada_el: m.created_at,
    asistentes: registro ? registro.con : (vieja?.asistentes ?? []),
    decisor_apuntado: registro?.decisorApuntado ?? null,
    notas: registro ? (registro.texto !== TEXTO_DE_DEMO ? registro.texto : '') : (vieja?.notas ?? ''),
    invitados_al_calendario: Number(m.invitados) || 0,
  }
}

const listDemos: McpToolDef = {
  name: 'list_demos',
  title: 'Demos',
  description:
    'Las demos de Propelia agendadas con inmobiliarias (de las carteras que el usuario ve). Por defecto las próximas, la más ' +
    'cercana primero, con la hora en España, la inmobiliaria, su etapa, quién asiste, el decisor apuntado y las notas de quien la ' +
    'agendó. Para preparar una, get_demo_briefing con su id.',
  inputSchema: {
    cuando: z.enum(['proximas', 'pasadas', 'todas']).optional().describe('Por defecto, proximas (agendadas que todavía no terminaron).'),
    desde: day.optional().describe('Desde ese día (hora de España, inclusive).'),
    hasta: day.optional().describe('Hasta ese día, inclusive.'),
    responsable: uuid.optional().describe('Id de quien lleva el lead (list_team o get_me).'),
    incluir_canceladas: z.boolean().optional().describe('En pasadas/todas, también las canceladas (por defecto no).'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const cuando = typeof args.cuando === 'string' ? args.cuando : 'proximas'
    const ahora = new Date().toISOString()
    const filters: Filter[] = [{ op: 'not_null', column: 'lead_id' }]
    if (cuando === 'proximas') {
      filters.push({ op: 'eq', column: 'status', value: 'scheduled' }, { op: 'gte', column: 'ends_at', value: ahora })
    } else {
      if (cuando === 'pasadas') filters.push({ op: 'lt', column: 'starts_at', value: ahora })
      if (args.incluir_canceladas !== true) filters.push({ op: 'eq', column: 'status', value: 'scheduled' })
    }
    if (typeof args.desde === 'string') filters.push({ op: 'gte', column: 'starts_at', value: inicioDelDiaEnEspana(args.desde) })
    if (typeof args.hasta === 'string') filters.push({ op: 'lt', column: 'starts_at', value: inicioDelDiaEnEspana(siguienteDia(args.hasta)) })
    if (typeof args.responsable === 'string') filters.push({ op: 'eq', column: 'assigned_to', value: args.responsable })

    const [{ rows, total }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_meetings',
        columns: MEETING_COLUMNS,
        filters,
        order: [{ column: 'starts_at', ascending: cuando === 'proximas' }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
    ])
    const leadIds = [...new Set(rows.map((m) => m.lead_id as string))]
    const [leads, comentarios] = leadIds.length
      ? await Promise.all([
        db.select({ view: 'mcp_crm_leads', columns: ['id', 'company_name', 'city', 'stage_label', 'importante', 'agents_count', 'current_crm'], filters: [{ op: 'in', column: 'id', values: leadIds }], range: [0, ALL] }),
        db.select({ view: 'mcp_crm_comments', columns: ['comment_type', 'description', 'long_description', 'created_by', 'created_at'], filters: [{ op: 'in', column: 'lead_id', values: leadIds }, { op: 'eq', column: 'es_registro_de_demo', value: true }], range: [0, ALL] }),
      ])
      : [{ rows: [] as Row[] }, { rows: [] as Row[] }]
    const lead = new Map(leads.rows.map((l) => [l.id as string, l]))
    const registros = registrosPorReunion(comentarios.rows)

    return paged('demos', rows.map((m) => {
      const l = lead.get(m.lead_id)
      return {
        ...demoResumen(m, registros.get(m.id), gente),
        lead: {
          id: m.lead_id,
          inmobiliaria: str(l?.company_name) ?? '(sin nombre)',
          ciudad: str(l?.city) ?? null,
          etapa: l?.stage_label ?? null,
          importante: l?.importante === true,
          agentes: l?.agents_count ?? null,
          crm_que_usa: str(l?.current_crm) ?? null,
        },
      }
    }), total, p)
  },
}

const getDemoBriefing: McpToolDef = {
  name: 'get_demo_briefing',
  title: 'Briefing de una demo',
  description:
    'Todo para preparar una demo: la demo (cuándo en hora de España, quién asiste, decisor apuntado, notas de quien la agendó) y ' +
    'el lead entero — datos de la inmobiliaria (web, Idealista, Google Maps, oficina, agentes, CRM que usa, consejo del SDR), ' +
    'contactos con su rol, si deciden y notas, toda la actividad (llamadas, notas, intentos fallidos), cambios de etapa, ' +
    'reasignaciones, emails enviados, otras reuniones, tareas y un resumen con números. Con demo_id, esa demo; con lead_id, la ' +
    'próxima agendada de ese lead (o la última). Para completar el contexto se puede mirar la web o el Idealista de la agencia.',
  inputSchema: {
    demo_id: uuid.optional().describe('Id de la demo (list_demos).'),
    lead_id: uuid.optional().describe('Id del lead, si no se tiene el de la demo.'),
  },
  async run({ db }, args) {
    if (typeof args.demo_id !== 'string' && typeof args.lead_id !== 'string') {
      return { found: false, error: 'Falta demo_id o lead_id.' }
    }
    const gente = await equipo(db)
    let leadId = typeof args.lead_id === 'string' ? args.lead_id : null
    if (typeof args.demo_id === 'string') {
      const { rows } = await db.select({ view: 'mcp_crm_meetings', columns: ['id', 'lead_id'], filters: [{ op: 'eq', column: 'id', value: args.demo_id }], range: [0, 0] })
      if (!rows[0]?.lead_id) return { found: false }
      leadId = rows[0].lead_id
    }
    const res = await fichaDelLead(db, gente, leadId!, { actividad: ACTIVIDAD_DEL_BRIEFING, completa: true })
    if (!res) return { found: false }

    // La demo: la pedida; si no, la próxima agendada del lead; si no, la última.
    const ahora = Date.now()
    const demo = typeof args.demo_id === 'string'
      ? res.reuniones.find((m) => m.id === args.demo_id)
      : ([...res.reuniones].reverse().find((m) => m.status === 'scheduled' && Date.parse(m.ends_at) > ahora) ?? res.reuniones[0])
    const registros = registrosPorReunion(res.registros.map(({ k }) => k))
    return {
      found: true,
      demo: demo
        ? { ...demoResumen(demo, registros.get(demo.id), gente), dias_hasta_la_demo: diasEntre(new Date().toISOString(), demo.starts_at) }
        : null,
      lead: res.ficha,
    }
  },
}

/** Medianoche de España de ese día, en ISO con zona, para comparar contra un timestamptz. */
export function inicioDelDiaEnEspana(dia: string): string {
  // El desfase de Madrid ese día (+01:00 o +02:00): se mira al mediodía UTC, lejos del cambio de hora.
  const mediodia = new Date(`${dia}T12:00:00Z`)
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
    .formatToParts(mediodia).find((x) => x.type === 'timeZoneName')?.value ?? 'GMT+01:00'
  const desfase = nombre.replace('GMT', '') || '+00:00'
  return `${dia}T00:00:00${desfase}`
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
    const desde = inicioDelDiaEnEspana(typeof args.desde === 'string' ? args.desde : hoyEnEspana())
    if (typeof args.lead_id !== 'string' || typeof args.desde === 'string') filters.push({ op: 'gte', column: 'starts_at', value: desde })
    if (typeof args.hasta === 'string') filters.push({ op: 'lt', column: 'starts_at', value: inicioDelDiaEnEspana(siguienteDia(args.hasta)) })
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

/** Prefijo del tilde «Probé» de cada cuenta (`tareaCuentaProbada` del front): uno por miembro. */
const CUENTA_PROBADA = 'contacto.probada.'

/**
 * Las tareas hechas de un alta. Los tildes «Probé» llevan el id del miembro y son uno por persona:
 * listados, son ids larguísimos que no dicen nada (lo notó Claude al probarlo, 31/10/2026). Van
 * contados aparte.
 */
export function tareasDelAlta(ids: unknown): { tareas_hechas: string[]; cuentas_probadas: number } {
  const lista = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []
  return {
    tareas_hechas: lista.filter((id) => !id.startsWith(CUENTA_PROBADA)),
    cuentas_probadas: lista.filter((id) => id.startsWith(CUENTA_PROBADA)).length,
  }
}

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
      ...tareasDelAlta(o.tareas_hechas),
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

// ─── CRM: el Dashboard, los Objetivos y la campana ─────────────────────────

/** El día de España de un instante: cómo se agrupa la agenda. */
const diaEnEspana = (iso: string) => hoyEnEspana(new Date(iso))

const getCrmDashboard: McpToolDef = {
  name: 'get_crm_dashboard',
  title: 'Dashboard del CRM',
  description:
    'Lo que ve un SUPERADMIN al entrar a /crm: los leads importantes (con estrella o en una etapa marcada «Dashboard») de todas ' +
    'las carteras, con sus decisores, la etapa, el seguimiento según TU próxima tarea (sin tarea, vencida, hoy, al día; un lead ' +
    'con tareas sólo de otros es «sin tarea») y esa tarea; y la agenda de reuniones del CRM de hoy y los 6 días siguientes, en ' +
    'hora de España. No trae los eventos de Google Calendar. Sólo para SUPERADMIN: un SDR ve la lista (list_crm_leads).',
  inputSchema: {
    orden: z.enum(['estado', 'tarea']).optional().describe('estado (por defecto: etapas anteriores del funnel arriba, descartados al final) o tarea (la más próxima arriba).'),
    agenda: z.enum(['mias', 'todas']).optional().describe('mias (por defecto: las que llevás vos) o todas las del equipo que ves.'),
  },
  async run({ db, userId }, args) {
    const me = (await db.rpc('mcp_whoami', {})) as Row | null
    if (me?.rol !== 'SUPERADMIN') return { disponible: false, motivo: 'El Dashboard del CRM es sólo para SUPERADMIN.' }
    const hoy = hoyEnEspana()
    const orden = args.orden === 'tarea' ? 'tarea' : 'estado'
    const meetingFilters: Filter[] = [
      { op: 'gte', column: 'starts_at', value: inicioDelDiaEnEspana(hoy) },
      { op: 'lt', column: 'starts_at', value: inicioDelDiaEnEspana(sumarDias(hoy, 7)) },
    ]
    if (args.agenda !== 'todas') meetingFilters.push({ op: 'eq', column: 'assigned_to', value: userId })
    const [{ rows }, gente, etapas, mias, reuniones] = await Promise.all([
      db.select({ view: 'mcp_crm_leads', columns: [...LEAD_COLUMNS, 'contactos'], range: [0, ALL] }),
      equipo(db),
      etapasDelFunnel(db),
      tareasPendientes(db, userId),
      db.select({
        view: 'mcp_crm_meetings', columns: ['id', 'lead_id', 'assigned_to', 'starts_at', 'ends_at', 'status', 'title'],
        filters: meetingFilters, order: [{ column: 'starts_at', ascending: true }], range: [0, ALL],
      }),
    ])
    const leads = rows as (Row & { id: string; funnel_stage_id: string | null })[]
    const nombre = (l: Row) => str(l.company_name) ?? '(sin nombre)'
    const proximas = proximaTareaPorLead(mias)
    const importantes = ordenarImportantes(leads.filter((l) => esImportante(l, etapas)), proximas, etapas, orden, nombre)
    const porId = new Map(leads.map((l) => [l.id, l]))

    const agenda = new Map<string, Row[]>()
    for (const m of reuniones.rows) {
      if (m.status === 'cancelled') continue
      const dia = diaEnEspana(m.starts_at)
      agenda.set(dia, [...(agenda.get(dia) ?? []), m])
    }
    return {
      hoy_en_espana: hoy,
      importantes: importantes.map((l) => {
        const descartado = esDescartado(l, etapas)
        return {
          lead_id: l.id,
          inmobiliaria: nombre(l),
          decisores: (Array.isArray(l.contactos) ? l.contactos : []).filter((c: Row) => c?.decisor === true).map((c: Row) => c.nombre ?? '(sin nombre)'),
          etapa: etapaDe(l, etapas)?.label ?? l.stage_label ?? null,
          con_estrella: l.importante === true,
          seguimiento: seguimientoDelLead(proximas.get(l.id), descartado, hoy),
          tu_proxima_tarea: proximaTareaSalida(proximas.get(l.id), gente),
          responsable: nombreDe(gente, l.assigned_to),
        }
      }),
      agenda: [...agenda.entries()].map(([dia, rs]) => ({
        dia,
        reuniones: rs.map((m) => ({
          id: m.id,
          hora_espana: horaEnEspana(m.starts_at),
          titulo: m.title,
          estado: m.status,
          inmobiliaria: m.lead_id ? (porId.get(m.lead_id) ? nombre(porId.get(m.lead_id)!) : null) : null,
          lead_id: m.lead_id ?? null,
          responsable: nombreDe(gente, m.assigned_to),
        })),
      })),
    }
  },
}

/** Los números de un período con las claves de la salida. */
function numerosDeObjetivos(r: Record<Objetivo, number>) {
  return {
    contestadas: r.contestadas,
    con_decisor: r.decisores,
    decisores_nuevos: r.decisoresNuevos,
    no_respondidas: r.noRespondidas,
    presentaciones_con_video: r.presentaciones,
    demos_agendadas: r.demos,
  }
}

/** Qué es cada número (los textos de `COLUMNAS` en ContadorDeLlamadas.tsx, cortos). */
const QUE_ES_CADA_OBJETIVO = {
  contestadas: 'Llamadas registradas como contestadas (cuenta llamadas, no leads).',
  con_decisor: 'Contestadas en las que quien atendió decide. Son también contestadas.',
  decisores_nuevos: 'Contestadas con un decisor con quien nadie del equipo había hablado antes en ese lead (por nombre).',
  no_respondidas: 'Llamadas registradas como no respondidas.',
  presentaciones_con_video: 'Mails «Presentación con vídeo» enviados, sin los que Resend no llegó a mandar.',
  demos_agendadas: 'Reuniones que esa persona agendó en el período (cuenta cuándo se agendaron, no para cuándo son).',
  decisor_por_contactado: 'De las inmobiliarias que contestaron, qué parte tuvo una llamada con decisor (cuenta inmobiliarias).',
  pendiente_ahora: 'Hoy, no en el período: tareas suyas vencidas (la de hoy no) y leads de su cartera en Seguimiento sin tarea suya.',
}

const getCrmGoals: McpToolDef = {
  name: 'get_crm_goals',
  title: 'Objetivos semanales',
  description:
    'Los «Objetivos» del CRM, como el contador de la cabecera y su diálogo: llamadas contestadas, con decisor, decisores ' +
    'nuevos, no respondidas, mails de presentación, demos agendadas y la tasa «decisor por contactado», por persona y período ' +
    '(hora de España). Con varias personas suma un total. También dice qué tiene pendiente ahora cada una. Por defecto, esta ' +
    'semana (desde el lunes) del usuario conectado. Los números de otro salen de lo que el usuario puede ver, como «Ver como».',
  inputSchema: {
    periodo: z.enum(PERIODOS).optional().describe('hoy, semana (por defecto), semana_pasada o mes.'),
    desde: day.optional().describe('En vez de periodo: desde ese día (inclusive).'),
    hasta: day.optional().describe('Con desde: hasta ese día (inclusive; por defecto hoy).'),
    semanas: z.number().int().min(1).max(12).optional().describe('En vez de periodo: una fila por semana, de esta hacia atrás.'),
    personas: z.array(uuid).min(1).max(10).optional().describe('Ids (list_team). Por defecto, el usuario conectado.'),
  },
  async run({ db, userId }, args) {
    const hoy = hoyEnEspana()
    const personas = Array.isArray(args.personas) && args.personas.length ? (args.personas as string[]) : [userId]
    const periodos: Periodo[] = typeof args.semanas === 'number'
      ? semanasHaciaAtras(hoy, args.semanas)
      : typeof args.desde === 'string'
      ? [{ desde: args.desde, hasta: sumarDias(typeof args.hasta === 'string' ? args.hasta : hoy, 1), nombre: `${args.desde} a ${typeof args.hasta === 'string' ? args.hasta : hoy}` }]
      : [periodoDe((typeof args.periodo === 'string' ? args.periodo : 'semana') as NombreDePeriodo, hoy)]
    if (periodos.length * personas.length > 24) {
      return { error: 'Demasiadas combinaciones: pedí como mucho 24 (semanas × personas).' }
    }
    const [gente, etapas, { rows: leads }, tareas, resultados] = await Promise.all([
      equipo(db),
      etapasDelFunnel(db),
      db.select({ view: 'mcp_crm_leads', columns: ['id', 'assigned_to', 'funnel_stage_id', 'descartado'], range: [0, ALL] }),
      tareasPendientes(db),
      Promise.all(periodos.map((per) => Promise.all(personas.map((id) => objetivosDePersona(db, id, per))))),
    ])
    return {
      hoy_en_espana: hoy,
      que_es_cada_numero: QUE_ES_CADA_OBJETIVO,
      periodos: periodos.map((per, i) => ({
        periodo: per.nombre,
        desde: per.desde,
        hasta_inclusive: sumarDias(per.hasta, -1),
        personas: personas.map((id, j) => ({
          id,
          nombre: nombreDe(gente, id),
          ...numerosDeObjetivos(resultados[i][j].resumen),
          decisor_por_contactado: tasaDeDecisor([resultados[i][j]]),
        })),
        ...(personas.length > 1
          ? {
            total: {
              ...numerosDeObjetivos(sumarResumenes(resultados[i].map((o) => o.resumen))),
              decisor_por_contactado: tasaDeDecisor(resultados[i]),
            },
          }
          : {}),
      })),
      pendiente_ahora: personas.map((id) => ({
        id,
        nombre: nombreDe(gente, id),
        ...pendientesDePersona(id, leads as (Row & { id: string; funnel_stage_id: string | null })[], tareas, etapas, hoy),
      })),
    }
  },
}

const ROTULOS_DE_EMAIL: Record<string, string> = {
  bounced: 'Rebotó',
  failed: 'No se pudo enviar',
  suppressed: 'No se envió',
  complained: 'Lo marcaron como spam',
}

const listCrmEmailProblems: McpToolDef = {
  name: 'list_crm_email_problems',
  title: 'Emails que no llegaron',
  description:
    'La campana del CRM: los emails que no llegaron (rebotó, no se pudo enviar, no se envió, lo marcaron como spam). Por ' +
    'defecto, los que mandó el usuario conectado y nadie marcó «Listo». Sin las direcciones.',
  inputSchema: {
    de_todos: z.boolean().optional().describe('También los que mandaron otros, de los leads que el usuario ve.'),
    incluir_listos: z.boolean().optional().describe('También los ya marcados «Listo».'),
    lead_id: uuid.optional().describe('Los de un lead (el cartel debajo de «Mensajes»), de quien sea.'),
    limit,
    offset,
  },
  async run({ db, userId }, args) {
    const p = page(args)
    const filters: Filter[] = [{ op: 'in', column: 'status', values: [...ESTADOS_QUE_NO_LLEGARON] }]
    if (typeof args.lead_id === 'string') filters.push({ op: 'eq', column: 'lead_id', value: args.lead_id })
    else if (args.de_todos !== true) filters.push({ op: 'eq', column: 'sent_by', value: userId })
    if (args.incluir_listos !== true) filters.push({ op: 'is_null', column: 'seen_at' })
    const [{ rows, total }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_emails',
        columns: ['id', 'lead_id', 'sent_by', 'subject', 'plantilla', 'status', 'status_at', 'sent_at', 'seen_at', 'seen_by'],
        filters,
        order: [{ column: 'sent_at', ascending: false }],
        range: [p.offset, p.offset + p.limit - 1],
        count: true,
      }),
      equipo(db),
    ])
    const inmo = await inmobiliarias(db, rows.map((e) => e.lead_id))
    return paged('envios', rows.map((e) => ({
      id: e.id,
      enviado: e.sent_at ?? null,
      asunto: e.subject ?? null,
      plantilla: e.plantilla ?? null,
      estado: ROTULOS_DE_EMAIL[e.status] ?? e.status,
      estado_desde: e.status_at ?? null,
      enviado_por: nombreDe(gente, e.sent_by),
      lead_id: e.lead_id ?? null,
      inmobiliaria: e.lead_id ? (inmo.get(e.lead_id) ?? null) : null,
      listo: e.seen_at ? { el: e.seen_at, por: nombreDe(gente, e.seen_by) } : null,
    })), total, p)
  },
}

// ─── CRM: la actividad por fecha y persona (13/11/2026, por pedido) ────────

/** Tope de días por consulta: un trimestre. Más que eso es un informe, no una pregunta. */
const MAX_DIAS_DE_ACTIVIDAD = 92

/** Los tipos de actividad como se cuentan en el resumen (y se filtran con `tipos`). */
const TIPOS_DE_ACTIVIDAD = ['llamada_contestada', 'contacto_fallido', 'llamada', 'demo_agendada', 'notas_de_la_demo', 'nota', 'sistema'] as const
type TipoDeActividad = (typeof TIPOS_DE_ACTIVIDAD)[number]

/** De la actividad leída (`actividadDe`) al tipo del resumen. `llamada` sola es una vieja sin resultado. */
function tipoDeActividad(a: ReturnType<typeof actividadDe>): TipoDeActividad {
  if (a.tipo === 'llamada') return a.resultado === 'contestada' ? 'llamada_contestada' : 'llamada'
  if (a.tipo === 'contacto fallido') return 'contacto_fallido'
  if (a.tipo === 'demo agendada') return 'demo_agendada'
  if (a.tipo === 'notas de la demo') return 'notas_de_la_demo'
  if (a.tipo === 'sistema') return 'sistema'
  return 'nota'
}

type ConteoDeActividad = Record<TipoDeActividad, number> & { con_decisor: number; total: number }

const conteoVacio = (): ConteoDeActividad =>
  ({ ...Object.fromEntries(TIPOS_DE_ACTIVIDAD.map((t) => [t, 0])), con_decisor: 0, total: 0 }) as ConteoDeActividad

const listCrmActivity: McpToolDef = {
  name: 'list_crm_activity',
  title: 'Actividad por fecha y persona',
  description:
    'La actividad registrada en el CRM entre dos días (hora de España), de una o varias personas o de todo el equipo que el ' +
    'usuario ve: llamadas contestadas (y cuántas con decisor), contactos fallidos (no respondió), demos agendadas, notas ' +
    'tomadas en la demo y notas. Devuelve un resumen por persona y por día y el detalle de cada actividad (cuándo, quién, ' +
    'inmobiliaria, con quién habló y el texto). Es lo mismo que el registro de actividad de cada lead, junto. Cuenta lo ' +
    'registrado (comentarios), no las reuniones: para demos realizadas o canceladas, list_demos. Por defecto, hoy.',
  inputSchema: {
    desde: day.optional().describe('Desde ese día, inclusive (por defecto hoy en España).'),
    hasta: day.optional().describe(`Hasta ese día, inclusive (por defecto, el mismo que desde). Hasta ${MAX_DIAS_DE_ACTIVIDAD} días.`),
    personas: z.array(uuid).min(1).max(20).optional().describe('Ids de quienes registraron (list_team). Por defecto, todos.'),
    solo_sdr: z.boolean().optional().describe('Sólo la actividad de quienes tienen rol SDR.'),
    tipos: z.array(z.enum(TIPOS_DE_ACTIVIDAD)).min(1).optional().describe('Sólo esos tipos. Por defecto todos menos sistema.'),
    lead_id: uuid.optional(),
    detalle: z.boolean().optional().describe('false: sólo el resumen, sin la lista de actividades (por defecto true).'),
    limit,
    offset,
  },
  async run({ db }, args) {
    const p = page(args)
    const desde = typeof args.desde === 'string' ? args.desde : hoyEnEspana()
    const hasta = typeof args.hasta === 'string' ? args.hasta : desde
    if (hasta < desde) return { error: '«hasta» es anterior a «desde».' }
    if (sumarDias(desde, MAX_DIAS_DE_ACTIVIDAD) <= hasta) {
      return { error: `Como mucho ${MAX_DIAS_DE_ACTIVIDAD} días por consulta: partilo en tramos.` }
    }
    const tipos = new Set<TipoDeActividad>(
      Array.isArray(args.tipos) ? (args.tipos as TipoDeActividad[]) : TIPOS_DE_ACTIVIDAD.filter((t) => t !== 'sistema'),
    )
    const filters: Filter[] = [
      { op: 'gte', column: 'created_at', value: inicioDelDiaEnEspana(desde) },
      { op: 'lt', column: 'created_at', value: inicioDelDiaEnEspana(sumarDias(hasta, 1)) },
    ]
    if (!tipos.has('sistema')) filters.push({ op: 'eq', column: 'comment_type', value: 'MANUAL' })
    if (Array.isArray(args.personas)) filters.push({ op: 'in', column: 'created_by', values: args.personas as string[] })
    if (typeof args.lead_id === 'string') filters.push({ op: 'eq', column: 'lead_id', value: args.lead_id })

    const [{ rows }, gente] = await Promise.all([
      db.select({
        view: 'mcp_crm_comments',
        columns: ['id', 'lead_id', 'comment_type', 'description', 'long_description', 'created_by', 'created_at'],
        filters,
        order: [{ column: 'created_at', ascending: true }],
        range: [0, ALL],
      }),
      equipo(db),
    ])
    const actividades = rows
      .map((k) => ({ k, a: actividadDe(k.comment_type, k.long_description) }))
      .map((x) => ({ ...x, tipo: tipoDeActividad(x.a), dia: diaEnEspana(x.k.created_at) }))
      .filter((x) => tipos.has(x.tipo))
      .filter((x) => args.solo_sdr !== true || gente.get(x.k.created_by)?.rol === 'SDR')
      .sort((a, b) => String(a.k.created_at).localeCompare(String(b.k.created_at)))

    // Resumen: por persona y, adentro, por día; los días sin nada no van.
    const porPersona = new Map<string, { total: ConteoDeActividad; dias: Map<string, ConteoDeActividad> }>()
    for (const x of actividades) {
      const quien = typeof x.k.created_by === 'string' ? x.k.created_by : 'sin-autor'
      const fila = porPersona.get(quien) ?? { total: conteoVacio(), dias: new Map() }
      const delDia = fila.dias.get(x.dia) ?? conteoVacio()
      for (const c of [fila.total, delDia]) {
        c[x.tipo]++
        c.total++
        if (x.tipo === 'llamada_contestada' && x.a.decisor === true) c.con_decisor++
      }
      fila.dias.set(x.dia, delDia)
      porPersona.set(quien, fila)
    }
    const inmo = args.detalle === false ? new Map<string, string>() : await inmobiliarias(db, actividades.map((x) => x.k.lead_id))
    // El detalle va del más nuevo al más viejo, como la actividad del lead.
    const detalle = [...actividades].reverse()
    const pagina = detalle.slice(p.offset, p.offset + p.limit)
    return {
      desde,
      hasta,
      zona: 'Europe/Madrid',
      // Si llega al tope, faltan actividades: hay que acortar el tramo.
      truncado: rows.length > ALL,
      que_cuenta: {
        llamada_contestada: 'Llamada registrada como contestada. con_decisor = de esas, en las que atendió alguien que decide.',
        contacto_fallido: 'Llamada registrada como «No respondió» (en la app, «Contacto fallido»).',
        llamada: 'Llamada vieja, de antes de que se registrara el resultado.',
        demo_agendada: 'El registro que deja agendar una demo (fecha = cuándo se agendó, no cuándo es).',
        notas_de_la_demo: 'Lo anotado durante la demo, en la pestaña «Demo» del lead.',
        nota: 'Nota escrita a mano en el lead.',
      },
      resumen: [...porPersona.entries()].map(([id, f]) => ({
        persona: id === 'sin-autor' ? 'Sin autor' : nombreDe(gente, id),
        id: id === 'sin-autor' ? null : id,
        rol: gente.get(id)?.rol ?? null,
        total: f.total,
        por_dia: [...f.dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, c]) => ({ dia, ...c })),
      })).sort((a, b) => b.total.total - a.total.total),
      ...(args.detalle === false ? {} : paged('actividades', pagina.map(({ k, a, tipo, dia }) => ({
        fecha: k.created_at,
        dia,
        hora_espana: horaEnEspana(k.created_at),
        persona: nombreDe(gente, k.created_by),
        tipo,
        ...(tipo === 'llamada_contestada' && a.decisor !== undefined ? { decide: a.decisor } : {}),
        con: a.con,
        ...(a.decisorApuntado ? { decisor_apuntado: a.decisorApuntado } : {}),
        lead_id: k.lead_id ?? null,
        inmobiliaria: k.lead_id ? (inmo.get(k.lead_id) ?? null) : null,
        texto: str(k.description) ?? '',
      })), detalle.length, p)),
    }
  },
}

const redondear = (n: number) => Math.round(n * 100) / 100

export const TOOLS: readonly McpToolDef[] = [
  getMe, listTeam,
  listRoadmapTasks, getRoadmapTask, listBacklogGroups,
  listCrmStages, listCrmLeads, getCrmLead, listCrmTasks, listCrmMeetings, listDemos, getDemoBriefing,
  getCrmDashboard, getCrmGoals, listCrmEmailProblems, listCrmActivity,
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
