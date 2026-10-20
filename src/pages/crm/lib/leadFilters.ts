import { toIsoDate } from '@/lib/calendarDate'
import type { CrmLeadRow, CrmStage } from '../types'
import type { Objetivo } from './objetivos'
import { etapaDelLead } from './effectiveStage'
import { gestionDeEtapa } from './gestionDeEtapa'
import { paraRecontactar } from './motivosDescarte'

/* Copiado de propelia-frontend (src/pages/leads/lib/leadFilters.ts) sin lo inmobiliario (pisos,
   presupuesto, zonas, cruces, compraventa) y sin `frozenIds`. Acá la lista entera ya está en el
   cliente —la RLS recortó— así que no hay RPC con el que mantenerse en espejo. Tampoco filtra
   por gestión ni por prioridad: se sacaron del front el 10/10/2026 para rediseñarlas. */

/** Última actividad (lo más reciente arriba), estado (lo más avanzado del funnel arriba) o tarea
 *  (por vencimiento de la próxima, lo vencido arriba). */
export const ORDENES_DE_LEADS = ['actividad', 'estado', 'tarea'] as const
export type OrdenLeads = (typeof ORDENES_DE_LEADS)[number]

export type LeadFilterState = {
  q: string
  stageFilter: Set<string>
  overdueOnly: boolean
  /** Solo los leads con alguna tarea pendiente; la lista además se ordena por la próxima. */
  conTareas: boolean
  /** Lo contrario de `conTareas`: solo los que no tienen ninguna tarea pendiente. Se excluyen
   *  (los dos viven en `?tareas=`); lo elige la vista en columnas con «Sin tareas». */
  sinTareas: boolean
  /** Solo los descartados que «podrían calificar» y ya llegaron a su fecha de volver a llamar. */
  paraRecontactar: boolean
  /** Solo los leads en una etapa de «Seguimiento» (`por_tarea`) sin ninguna tarea pendiente:
   *  hay que agendarles la próxima (20/10/2026). */
  pendienteAgendar: boolean
  /** Cómo se ordena la lista (20/10/2026; antes era solo `ordenPorEstado`). Null = el de fábrica:
   *  con «Tareas», por vencimiento; sin, como llega. */
  orden: OrdenLeads | null
  /** Uno de los números de «Objetivos semanales»: solo los leads que entran en él (`ctx.leadsDelObjetivo`). */
  objetivo: Objetivo | null
}

// Función y no constante: una constante con Sets adentro se compartiría y alguien la mutaría.
export function filtrosVacios(): LeadFilterState {
  return {
    q: '', stageFilter: new Set(), overdueOnly: false,
    conTareas: false, sinTareas: false, paraRecontactar: false, pendienteAgendar: false, orden: null,
    objetivo: null,
  }
}

export type LeadFilterContext = {
  overdueLeadIds: ReadonlySet<string>
  leadIdsConTareas: ReadonlySet<string>
  etapas: ReadonlyMap<string, CrmStage>
  /** Un solo «ahora» por pintada: si cada fila leyera su propio Date.now(), dos leads idénticos
   *  podrían caer de lados distintos del día de recontactar. */
  now: number
  /** Los leads del objetivo elegido. Sin llegar todavía (undefined) no pasa ninguno: mostrar
   *  todos mientras carga sería decir que esos son los de hoy. */
  leadsDelObjetivo?: ReadonlySet<string>
}

export type FilterDimension = 'overdue' | 'tareas' | 'stage' | 'recontactar' | 'objetivo' | 'agendar'

/** En una etapa de «Seguimiento» y sin ninguna tarea pendiente: nadie va a volver a llamarlo. */
export function esPendienteAgendar(l: CrmLeadRow, ctx: Pick<LeadFilterContext, 'etapas' | 'leadIdsConTareas'>): boolean {
  const e = etapaDelLead(l, ctx.etapas)
  return !!e && !e.is_out_of_funnel && gestionDeEtapa(e.management_type) === 'por_tarea'
    && !ctx.leadIdsConTareas.has(l.id)
}

export function esDescartado(l: CrmLeadRow, etapas: ReadonlyMap<string, CrmStage>): boolean {
  return etapaDelLead(l, etapas)?.is_out_of_funnel === true
}

/** Descartado y con `recontact_at` cumplido, en la zona de quien mira (el día sale de `ctx.now`). */
export function esParaRecontactar(l: CrmLeadRow, ctx: Pick<LeadFilterContext, 'etapas' | 'now'>): boolean {
  return paraRecontactar(l, esDescartado(l, ctx.etapas), toIsoDate(new Date(ctx.now)))
}

const soloDigitos = (s: string) => s.replace(/\D/g, '')
// Solo se busca por teléfono si lo tipeado tiene forma de teléfono. «inmo 6» no es un teléfono,
// y compararlo por sus dígitos traería a todo el que tenga un 6.
const PARECE_TELEFONO = /^[\d\s+()-]+$/

function matchesSearch(l: CrmLeadRow, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (!query) return true
  const c = l.client
  const texto = [c?.company_name, c?.first_name, c?.last_name, c?.email].filter(Boolean).join(' ').toLowerCase()
  if (texto.includes(query)) return true
  if (!PARECE_TELEFONO.test(query)) return false
  const digitos = soloDigitos(query)
  // Sin este corte, '' está incluido en cualquier string y un teléfono vacío igualaría todo.
  if (!digitos) return false
  return [c?.phone, c?.alternative_phone_1, c?.alternative_phone_2]
    .some(tel => !!tel && soloDigitos(tel).includes(digitos))
}

/**
 * Todos los criterios. `skip` apaga uno para contar «cuántos quedarían si prendo este», que es
 * lo que muestran los chips.
 */
export function filterLeads(
  leads: CrmLeadRow[],
  filters: LeadFilterState,
  ctx: LeadFilterContext,
  skip: FilterDimension[] = [],
): CrmLeadRow[] {
  const s = new Set(skip)
  /* Buscar es preguntar por UN lead: «¿dónde está éste?». Si la respuesta es «quedó descartado»,
     esconderlo deja la duda de si existe. La búsqueda levanta el descarte; el resto de los
     filtros sigue acotando. */
  const buscando = filters.q.trim().length > 0
  const recontactar = filters.paraRecontactar && !s.has('recontactar')
  // Un objetivo es preguntar «¿a quiénes llamé hoy?»: el que descarté en esa llamada también va.
  const objetivo = filters.objetivo && !s.has('objetivo') ? filters.objetivo : null
  return leads.filter(l => {
    const etapaId = l.funnel_stage_id
    const etapaElegida = etapaId != null && filters.stageFilter.has(etapaId)
    return matchesSearch(l, filters.q)
      // Elegir la etapa Descartado en «Estado» es pedir verlos: es la única forma, no hay chip aparte.
      // «Para recontactar» es pedir ver esos descartados: el filtro de abajo deja solo a ellos.
      && (buscando || recontactar || !!objetivo || etapaElegida || !esDescartado(l, ctx.etapas))
      && (!objetivo || !!ctx.leadsDelObjetivo?.has(l.id))
      && (!recontactar || esParaRecontactar(l, ctx))
      && (s.has('stage') || filters.stageFilter.size === 0 || etapaElegida)
      // Un descartado con tareas vencidas no es trabajo pendiente (mismo criterio que el producto).
      && (s.has('overdue') || !filters.overdueOnly || (ctx.overdueLeadIds.has(l.id) && !esDescartado(l, ctx.etapas)))
      // Acá el descarte lo sigue decidiendo su propio filtro: «Tareas» no es pedir verlos.
      && (s.has('tareas') || !filters.conTareas || ctx.leadIdsConTareas.has(l.id))
      && (s.has('tareas') || !filters.sinTareas || !ctx.leadIdsConTareas.has(l.id))
      && (s.has('agendar') || !filters.pendienteAgendar || esPendienteAgendar(l, ctx))
  })
}

/** La cartera va aparte de los filtros: es de quién son los leads, no qué leads son. */
export function leadsDeCarteras(leads: CrmLeadRow[], ids: readonly string[]): CrmLeadRow[] {
  const set = new Set(ids)
  return leads.filter(l => set.has(l.assigned_to))
}
