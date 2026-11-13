// Las reglas de las páginas del CRM que el MCP necesita para contestar lo mismo que la pantalla:
// los chips de la lista, el Dashboard y los Objetivos. Son ESPEJO de src/pages/crm/lib/ (los
// archivos de cada una están al lado): si cambia una regla allá, cambia acá. Puro: crmReglas.test.ts.
//
// La diferencia con la app es el «hoy»: la app usa el día local de quien mira y el MCP el de
// España, que es el del equipo (`hoyEnEspana`, como ya hacen list_crm_tasks y las demos).

/* ─── días ─────────────────────────────────────────────────────────────── */

/** 'YYYY-MM-DD' + n días, sin zona (el día es un día de calendario). */
export function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** El lunes de la semana de ese día (`startOfWeekIso` del front). */
export function lunesDe(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  return sumarDias(dia, -((dow + 6) % 7))
}

/** Un tramo de días [desde, hasta) para los Objetivos, como `PeriodoDeObjetivos` del front. */
export interface Periodo {
  desde: string
  hasta: string
  nombre: string
}

export const PERIODOS = ['hoy', 'semana', 'semana_pasada', 'mes'] as const
export type NombreDePeriodo = (typeof PERIODOS)[number]

/** La semana en curso termina mañana y no el lunes que viene (`semanasHaciaAtras` del front). */
export function periodoDe(nombre: NombreDePeriodo, hoy: string): Periodo {
  const manana = sumarDias(hoy, 1)
  if (nombre === 'hoy') return { desde: hoy, hasta: manana, nombre: 'Hoy' }
  if (nombre === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: manana, nombre: 'Este mes' }
  const lunes = lunesDe(hoy)
  if (nombre === 'semana') return { desde: lunes, hasta: manana, nombre: 'Esta semana' }
  return { desde: sumarDias(lunes, -7), hasta: lunes, nombre: 'Semana pasada' }
}

/** `n` semanas de lunes a domingo hacia atrás, la más nueva primera (`semanasHaciaAtras`). */
export function semanasHaciaAtras(hoy: string, n: number): Periodo[] {
  const lunes = lunesDe(hoy)
  const manana = sumarDias(hoy, 1)
  return Array.from({ length: n }, (_, i) => {
    const desde = sumarDias(lunes, -7 * i)
    const siguiente = sumarDias(desde, 7)
    const nombre = i === 0 ? 'Esta semana' : i === 1 ? 'Semana pasada' : `Semana del ${desde}`
    return { desde, hasta: siguiente < manana ? siguiente : manana, nombre }
  })
}

/* ─── la meta de una actividad (`leerMetaDeActividad`, lib/actividad.ts) ── */

const MARCA_ACTIVIDAD = '<!--act-->'
const TIPOS_DE_META = ['nota', 'llamada', 'demo', 'demoHecha']

interface Meta {
  tipo: string
  con: string[]
  resultado?: string
  decisor?: boolean
}

/** Leída estricta, como el front: lo que no tiene la forma conocida no es una actividad. */
function metaDe(guardado: unknown): Meta | null {
  if (typeof guardado !== 'string' || !guardado.startsWith(MARCA_ACTIVIDAD)) return null
  try {
    const m = JSON.parse(guardado.slice(MARCA_ACTIVIDAD.length))
    if (typeof m !== 'object' || m === null) return null
    if (!TIPOS_DE_META.includes(m.tipo)) return null
    if (!Array.isArray(m.con) || !m.con.every((c: unknown) => typeof c === 'string')) return null
    if (m.resultado !== undefined && m.resultado !== 'contestada' && m.resultado !== 'no_respondida') return null
    if (m.decisor !== undefined && typeof m.decisor !== 'boolean') return null
    return { tipo: m.tipo, con: m.con, resultado: m.resultado, decisor: m.decisor }
  } catch {
    return null
  }
}

/* ─── objetivos (lib/objetivos.ts) ─────────────────────────────────────── */

export const OBJETIVOS = ['contestadas', 'decisores', 'decisoresNuevos', 'noRespondidas', 'presentaciones', 'demos'] as const
export type Objetivo = (typeof OBJETIVOS)[number]

export interface Llamada {
  lead_id: string | null
  created_at: string
  long_description: string | null
}

export interface ObjetivosDelPeriodo {
  resumen: Record<Objetivo, number>
  leads: Record<Objetivo, Set<string>>
}

/** `bolsasDeLlamada`: la de decisor es también contestada (subconjunto, no tercera bolsa). */
export function bolsasDeLlamada(guardado: unknown): Objetivo[] {
  const m = metaDe(guardado)
  if (m?.tipo !== 'llamada') return []
  if (m.resultado === 'no_respondida') return ['noRespondidas']
  if (m.resultado === 'contestada') return m.decisor ? ['contestadas', 'decisores'] : ['contestadas']
  return []
}

const nombreComparable = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

function conDecisor(c: Llamada): string[] | null {
  const m = metaDe(c.long_description)
  return m?.tipo === 'llamada' && m.resultado === 'contestada' && m.decisor ? m.con : null
}

/** Decisor nuevo: alguien que decide y con quien nadie había hablado antes en ese lead. */
function esDecisorNuevo(c: Llamada, previas: readonly Llamada[]): boolean {
  const con = conDecisor(c)
  if (!con || !c.lead_id) return false
  const antes = previas.filter((p) => p.lead_id === c.lead_id && p.created_at < c.created_at).map(conDecisor).filter((x) => x !== null)
  if (con.length === 0) return antes.length === 0
  const conocidos = new Set(antes.flat().map(nombreComparable))
  return con.some((n) => !conocidos.has(nombreComparable(n)))
}

export function objetivosDe(
  llamadas: readonly Llamada[],
  demos: readonly { lead_id: string | null }[],
  extra: { presentaciones?: readonly { lead_id: string | null }[]; historial?: readonly Llamada[] } = {},
): ObjetivosDelPeriodo {
  const resumen = Object.fromEntries(OBJETIVOS.map((k) => [k, 0])) as Record<Objetivo, number>
  const leads = Object.fromEntries(OBJETIVOS.map((k) => [k, new Set<string>()])) as Record<Objetivo, Set<string>>
  const sumar = (k: Objetivo, leadId: string | null) => {
    resumen[k]++
    if (leadId) leads[k].add(leadId)
  }
  const previas = [...(extra.historial ?? []), ...llamadas]
  for (const c of llamadas) {
    for (const k of bolsasDeLlamada(c.long_description)) sumar(k, c.lead_id)
    if (esDecisorNuevo(c, previas)) sumar('decisoresNuevos', c.lead_id)
  }
  for (const m of extra.presentaciones ?? []) sumar('presentaciones', m.lead_id)
  for (const d of demos) sumar('demos', d.lead_id)
  return { resumen, leads }
}

export function leadsConDecisor(llamadas: readonly Llamada[]): string[] {
  return [...new Set(llamadas.filter((c) => c.lead_id && conDecisor(c)).map((c) => c.lead_id!))]
}

/** «Decisor por contactado»: inmobiliarias y no llamadas; con varias personas, una vez cada una. */
export function tasaDeDecisor(periodos: readonly Pick<ObjetivosDelPeriodo, 'leads'>[]): { contestadas: number; con_decisor: number; tasa: number | null } {
  const contestadas = new Set(periodos.flatMap((p) => [...p.leads.contestadas]))
  const decisores = new Set(periodos.flatMap((p) => [...p.leads.decisores]))
  return {
    contestadas: contestadas.size,
    con_decisor: decisores.size,
    tasa: contestadas.size ? Math.round((decisores.size / contestadas.size) * 1000) / 1000 : null,
  }
}

export function sumarResumenes(resumenes: readonly Record<Objetivo, number>[]): Record<Objetivo, number> {
  const total = Object.fromEntries(OBJETIVOS.map((k) => [k, 0])) as Record<Objetivo, number>
  for (const r of resumenes) for (const k of OBJETIVOS) total[k] += r[k]
  return total
}

/* ─── tareas (lib/tareas.ts) ───────────────────────────────────────────── */

export interface Tarea {
  lead_id: string | null
  due_date: string | null
  completed: boolean
  assigned_to: string | null
  [k: string]: unknown
}

/** Vencida recién cuando el día terminó: la de hoy todavía está a tiempo. */
export const estaVencida = (t: Tarea, hoy: string) => !t.completed && t.due_date != null && t.due_date.slice(0, 10) < hoy

/** Para hoy o vencida: a diferencia de `estaVencida`, la de hoy entra. */
export const tocaHoyOVencida = (t: Tarea, hoy: string) => !t.completed && t.due_date != null && t.due_date.slice(0, 10) <= hoy

const porVencimiento = (a: Tarea, b: Tarea) =>
  (a.due_date ?? '9999-12-31').slice(0, 10).localeCompare((b.due_date ?? '9999-12-31').slice(0, 10))

export interface ProximaTarea {
  tarea: Tarea
  pendientes: number
}

/** La pendiente que vence primero en cada lead y cuántas pendientes tiene. Sin lead no cuenta. */
export function proximaTareaPorLead(tareas: readonly Tarea[]): Map<string, ProximaTarea> {
  const porLead = new Map<string, ProximaTarea>()
  for (const t of tareas) {
    if (!t.lead_id || t.completed) continue
    const actual = porLead.get(t.lead_id)
    if (!actual) porLead.set(t.lead_id, { tarea: t, pendientes: 1 })
    else porLead.set(t.lead_id, { tarea: porVencimiento(t, actual.tarea) < 0 ? t : actual.tarea, pendientes: actual.pendientes + 1 })
  }
  return porLead
}

/* ─── etapas y leads (lib/leadFilters.ts, lib/resumen.ts) ──────────────── */

export interface Etapa {
  id: string
  label: string
  position: number
  is_out_of_funnel: boolean
  management_type: string | null
  allows_tasks?: boolean | null
  show_in_dashboard?: boolean | null
}

export interface LeadFila {
  id: string
  funnel_stage_id: string | null
  descartado?: boolean
  [k: string]: unknown
}

export const etapaDe = (l: LeadFila, etapas: ReadonlyMap<string, Etapa>) =>
  (l.funnel_stage_id ? etapas.get(l.funnel_stage_id) : undefined) ?? null

/** Descartado = en una etapa fuera del funnel. Sin la etapa a mano (borrada), lo que dice la vista. */
export const esDescartado = (l: LeadFila, etapas: ReadonlyMap<string, Etapa>) =>
  etapaDe(l, etapas)?.is_out_of_funnel ?? l.descartado === true

/** En una etapa de «Seguimiento» que deja agendar tareas y sin ninguna tarea pendiente de `yo`. */
export function esPendienteAgendar(l: LeadFila, etapas: ReadonlyMap<string, Etapa>, leadsConTareasDeYo: ReadonlySet<string>): boolean {
  const e = etapaDe(l, etapas)
  return !!e && !e.is_out_of_funnel && e.management_type === 'por_tarea' && e.allows_tasks !== false && !leadsConTareasDeYo.has(l.id)
}

export const esParaRecontactar = (l: LeadFila & { recontact_at?: unknown }, etapas: ReadonlyMap<string, Etapa>, hoy: string) =>
  esDescartado(l, etapas) && typeof l.recontact_at === 'string' && l.recontact_at.slice(0, 10) <= hoy

/** Importante: con estrella o en una etapa marcada «Dashboard: Sí» (`leadsImportantes`). */
export const esImportante = (l: LeadFila & { importante?: unknown }, etapas: ReadonlyMap<string, Etapa>) =>
  l.importante === true || etapaDe(l, etapas)?.show_in_dashboard === true

export type Seguimiento = 'sin tarea' | 'vencida' | 'hoy' | 'al día' | 'descartado'

/** La columna «Seguimiento» del Dashboard, con TU próxima tarea (`seguimientoDelLead`). */
export function seguimientoDelLead(proxima: ProximaTarea | undefined, descartado: boolean, hoy: string): Seguimiento {
  if (descartado) return 'descartado'
  if (!proxima) return 'sin tarea'
  if (estaVencida(proxima.tarea, hoy)) return 'vencida'
  return tocaHoyOVencida(proxima.tarea, hoy) ? 'hoy' : 'al día'
}

/** Por la próxima tarea: lo vencido arriba, después lo que viene y al final los sin tarea. Estable. */
export function ordenarPorProximaTarea<T extends { id: string }>(leads: readonly T[], proximas: ReadonlyMap<string, ProximaTarea>): T[] {
  return [...leads].sort((a, b) => {
    const ta = proximas.get(a.id), tb = proximas.get(b.id)
    if (!ta || !tb) return (ta ? 0 : 1) - (tb ? 0 : 1)
    return porVencimiento(ta.tarea, tb.tarea)
  })
}

/** Por estado de la lista: lo más avanzado del funnel arriba, fuera del funnel y sin etapa al final. */
export function ordenarPorEstado<T extends LeadFila>(leads: readonly T[], proximas: ReadonlyMap<string, ProximaTarea>, etapas: ReadonlyMap<string, Etapa>): T[] {
  const rango = (l: T) => {
    const e = etapaDe(l, etapas)
    if (!e) return 2e9
    return e.is_out_of_funnel ? 1e9 : -e.position
  }
  return ordenarPorProximaTarea(leads, proximas).sort((a, b) => rango(a) - rango(b))
}

/**
 * El orden de los importantes del Dashboard (`leadsImportantes`). Por estado: las etapas
 * anteriores del funnel arriba, sin etapa después y descartados al final; adentro, por tarea.
 * Por tarea: los que tienen la más próxima primero, después sin tarea, descartados al final.
 * A igualdad, por nombre.
 */
export function ordenarImportantes<T extends LeadFila>(
  leads: readonly T[], proximas: ReadonlyMap<string, ProximaTarea>, etapas: ReadonlyMap<string, Etapa>,
  orden: 'estado' | 'tarea', nombre: (l: T) => string,
): T[] {
  const rango = (l: T) => (esDescartado(l, etapas) ? 2 : proximas.has(l.id) ? 0 : 1)
  const vence = (l: T) => proximas.get(l.id)?.tarea.due_date ?? '9999-12-31'
  const tramo = (l: T) => (esDescartado(l, etapas) ? 2 : etapaDe(l, etapas) ? 0 : 1)
  const paso = (l: T) => etapaDe(l, etapas)?.position ?? 0
  const porEstado = (a: T, b: T) => (orden === 'estado' ? tramo(a) - tramo(b) || paso(a) - paso(b) : 0)
  return [...leads].sort((a, b) => porEstado(a, b) || rango(a) - rango(b) || vence(a).localeCompare(vence(b))
    || nombre(a).localeCompare(nombre(b), 'es', { sensitivity: 'base' }))
}

/** «Pendiente ahora» de una persona: sus tareas vencidas (la de hoy no) y los leads de su cartera
 *  en «Seguimiento» sin una tarea suya (`pendientesDePersona`). */
export function pendientesDePersona(
  personaId: string, leads: readonly (LeadFila & { assigned_to?: unknown })[], tareas: readonly Tarea[],
  etapas: ReadonlyMap<string, Etapa>, hoy: string,
): { tareas_vencidas: number; leads_sin_tarea: number } {
  const suyas = tareas.filter((t) => t.assigned_to === personaId)
  const conTareaSuya = new Set(suyas.filter((t) => !t.completed && t.lead_id).map((t) => t.lead_id!))
  return {
    tareas_vencidas: suyas.filter((t) => estaVencida(t, hoy)).length,
    leads_sin_tarea: leads.filter((l) => l.assigned_to === personaId && esPendienteAgendar(l, etapas, conTareaSuya)).length,
  }
}

/** Estados de un email que no llegó (`ESTADOS_QUE_NO_LLEGARON`, lib/emails.ts). */
export const ESTADOS_QUE_NO_LLEGARON = ['bounced', 'failed', 'suppressed', 'complained'] as const
