import { assert, assertEquals } from 'jsr:@std/assert@1'
import type { McpDb, Row, ViewQuery } from './db.ts'
import { MCP_RELATIONS } from './relations.ts'
import { siguienteDia, TOOLS, type ToolContext } from './tools.ts'
import { sanitizeOutput } from './sanitize.ts'

const EQUIPO: Row[] = [
  { id: 'u1', nombre: 'Lorenzo', last_name: 'Piatti', rol: 'SUPERADMIN', activo: true },
  { id: 'u2', nombre: 'Ana', last_name: null, rol: 'SDR', activo: true },
  { id: 'u3', nombre: 'Luis', last_name: null, rol: 'SDR', activo: false },
]

function base(rowsByView: Record<string, Row[]> = {}) {
  const queries: ViewQuery[] = []
  const db: McpDb = {
    select(query) {
      queries.push(query)
      const rows = query.view === 'mcp_team' ? EQUIPO : (rowsByView[query.view] ?? [])
      return Promise.resolve({ rows, total: rows.length })
    },
    rpc: () => Promise.resolve({ nombre: 'Lorenzo', rol: 'SUPERADMIN' }),
  }
  const ctx: ToolContext = { db, userId: 'u1' }
  return { ctx, queries, de: (view: string) => queries.find((q) => q.view === view)! }
}

const tool = (name: string) => TOOLS.find((t) => t.name === name)!
const run = (name: string, ctx: ToolContext, args: Record<string, unknown> = {}) => tool(name).run(ctx, args)

Deno.test('toda tool lee sólo vistas de la lista blanca y su salida pasa el sanitizador sin sacar nada', async () => {
  const filas: Record<string, Row[]> = {
    mcp_roadmap_tareas: [{ id: 'T-1', tarea: 'Login', estado: 'En curso', prioridad: 'critica', pend: ['u2'], backlog: false, expl: 'x', subtareas: [], chat: [] }],
    mcp_crm_leads: [{ id: 'l1', company_name: 'Inmo Sol', assigned_to: 'u2', funnel_stage_id: 's1', contactos: [{ nombre: 'Pedro', rol: 'Gerente', decisor: true }] }],
    mcp_crm_stages: [{ id: 's1', label: 'Contactado', value: 'CUSTOM', position: 1 }],
    mcp_expenses: [{ id: 'e1', expense_name: 'Claude', expense_type: 'FIXED', amount: '55', paid_by: 'u1', notes: 'mes' }],
  }
  for (const t of TOOLS) {
    const { ctx, queries } = base(filas)
    const args = t.name === 'get_roadmap_task' ? { id: 'T-1' } : t.name === 'get_crm_lead' ? { lead_id: 'l1' } : {}
    const out = await t.run(ctx, args)
    for (const q of queries) assert((MCP_RELATIONS as readonly string[]).includes(q.view), `${t.name} lee ${q.view}`)
    for (const q of queries) assert(!q.columns.includes('*'), t.name)
    assertEquals(sanitizeOutput(out).removed, [], t.name)
  }
})

Deno.test('list_roadmap_tasks: por defecto el tablero sin terminadas; responsable por pend', async () => {
  const { ctx, de } = base({ mcp_roadmap_tareas: [{ id: 'T-1', tarea: 'Login', estado: 'Revision', prioridad: 'urgente', pend: ['u2', 'u9'], backlog: false }] })
  const out = (await run('list_roadmap_tasks', ctx, { responsable: '00000000-0000-0000-0000-000000000002' })) as Record<string, any>
  const filtros = de('mcp_roadmap_tareas').filters!
  assertEquals(filtros[0], { op: 'eq', column: 'backlog', value: false })
  assert(filtros.some((f) => f.op === 'in' && f.column === 'estado' && !f.values.includes('Hecho')))
  assert(filtros.some((f) => f.op === 'contains' && f.column === 'pend'))
  assertEquals(out.tareas[0].estado, 'En revisión')
  assertEquals(out.tareas[0].prioridad, 'Urgente')
  assertEquals(out.tareas[0].responsables, ['Ana', 'Alguien que ya no está'])
})

Deno.test('list_roadmap_tasks: en el backlog no hay prioridad y el grupo va con su nombre', async () => {
  const { ctx } = base({
    mcp_roadmap_tareas: [{ id: 'T-2', tarea: 'X', estado: 'Pendiente', prioridad: 'semanal', pend: ['u1'], backlog: true, sprint: 3 }],
    mcp_roadmap_grupos: [{ numero: 3, nombre: 'Onboarding' }],
  })
  const out = (await run('list_roadmap_tasks', ctx, { en_backlog: true })) as Record<string, any>
  assertEquals(out.tareas[0].prioridad, null)
  assertEquals(out.tareas[0].grupo, { numero: 3, nombre: 'Onboarding' })
})

Deno.test('get_roadmap_task: explicación, pasos, avisos para todos y conversación con nombres', async () => {
  const expl = '<!--b-->' + JSON.stringify([{ k: 'hdr', avisos: [{ texto: 'ojo', autor: 'u2', ts: 0, visto: false }] }, { k: 'text', txt: 'hola' }])
  const { ctx } = base({
    mcp_roadmap_tareas: [{
      id: 'T-1', tarea: 'Login', estado: 'Pendiente', pend: ['u1'], backlog: false, expl,
      subtareas: [{ id: 's', titulo: 'Probar', estado: 'Hecho', resp: 'u2' }],
      chat: [{ autor: 'u1', ts: '2026-10-01T10:00:00Z', texto: 'arranco' }],
    }],
  })
  const out = (await run('get_roadmap_task', ctx, { id: 'T-1' })) as Record<string, any>
  assertEquals(out.explicacion, 'hola')
  assertEquals(out.pasos, [{ paso: 'Probar', estado: 'Terminada', responsable: 'Ana' }])
  assertEquals(out.avisos[0].para, 'todo el equipo')
  assertEquals(out.avisos[0].autor, 'Ana')
  assertEquals(out.conversacion[0].autor, 'Lorenzo Piatti')
  const { ctx: vacio } = base()
  assertEquals(await run('get_roadmap_task', vacio, { id: 'nada' }), { found: false })
})

Deno.test('list_crm_leads: sin descartados por defecto, salvo que se pida una etapa', async () => {
  const a = base()
  await run('list_crm_leads', a.ctx, {})
  assert(a.de('mcp_crm_leads').filters!.some((f) => f.op === 'eq' && f.column === 'descartado' && f.value === false))
  const b = base()
  await run('list_crm_leads', b.ctx, { etapa: 'descart' })
  assert(!b.de('mcp_crm_leads').filters!.some((f) => f.column === 'descartado'))
})

Deno.test('list_crm_tasks: por defecto las pendientes del usuario conectado', async () => {
  const { ctx, de } = base({ mcp_crm_tasks: [{ id: 't', lead_id: 'l1', title: 'Llamar', due_date: '2000-01-01', completed: false, assigned_to: 'u1' }], mcp_crm_leads: [{ id: 'l1', company_name: 'Inmo Sol' }] })
  const out = (await run('list_crm_tasks', ctx)) as Record<string, any>
  const f = de('mcp_crm_tasks').filters!
  assert(f.some((x) => x.op === 'eq' && x.column === 'assigned_to' && x.value === 'u1'))
  assert(f.some((x) => x.op === 'eq' && x.column === 'completed' && x.value === false))
  assertEquals(out.tareas[0].vencida, true)
  assertEquals(out.tareas[0].inmobiliaria, 'Inmo Sol')
})

Deno.test('get_crm_lead: contactos sin teléfonos y actividad con tipo, sin el teléfono de la meta', async () => {
  const { ctx } = base({
    mcp_crm_leads: [{ id: 'l1', company_name: 'Inmo Sol', assigned_to: 'u2', contactos: [{ nombre: 'Pedro', rol: null, decisor: true }] }],
    mcp_crm_comments: [{ comment_type: 'MANUAL', description: 'Atendió', long_description: '<!--act-->{"tipo":"llamada","con":["Pedro"],"telefono":{"numero":"+34600"}}', created_by: 'u2', created_at: 'x' }],
  })
  const out = (await run('get_crm_lead', ctx, { lead_id: 'l1' })) as Record<string, any>
  assertEquals(out.contactos, [{ nombre: 'Pedro', rol: null, decisor: true }])
  assertEquals(out.actividad[0], { fecha: 'x', tipo: 'llamada', autor: 'Ana', con: ['Pedro'], texto: 'Atendió' })
  assert(!JSON.stringify(out).includes('+34600'))
})

Deno.test('list_expenses: total y reparto de todo lo filtrado, no de la página', async () => {
  const { ctx } = base({
    mcp_expenses: [
      { id: 'a', expense_name: 'A', expense_type: 'FIXED', amount: '10.10', paid_by: 'u1' },
      { id: 'b', expense_name: 'B', expense_type: 'VARIABLE', amount: '5', paid_by: 'u2' },
      { id: 'c', expense_name: 'C', expense_type: 'VARIABLE', amount: '2.2', paid_by: null },
    ],
  })
  const out = (await run('list_expenses', ctx, { limit: 1 })) as Record<string, any>
  assertEquals(out.total_eur, 17.3)
  assertEquals(out.pagado_por_persona_eur, { 'Lorenzo Piatti': 10.1, Ana: 5, 'Sin pagar': 2.2 })
  assertEquals(out.gastos.length, 1)
  assertEquals(out.has_more, true)
})

Deno.test('siguienteDia: cruza el mes', () => {
  assertEquals(siguienteDia('2026-10-31'), '2026-11-01')
})
