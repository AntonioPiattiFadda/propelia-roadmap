import { shiftIsoDate } from '@/lib/calendarDate'
import { toLocalYmd } from '@/lib/time'
import type { GoogleAgendaItem } from '@/pages/agenda/lib/googleAgenda'
import type { CrmLeadRow, CrmMeeting, CrmStage } from '../types'
import { nombreDelLead } from './clientData'
import { etapaDelLead } from './effectiveStage'
import { esDescartado } from './leadFilters'
import { COMO_PARAM, LEAD_FILTER_PARAMS_WITH_QUERY, LEAD_PARAM, OWNERS_PARAM, VISTA_PARAM } from './leadFilterParams'
import type { ProximaTarea } from './tareas'

/* El resumen del CRM (23/10/2026, por pedido): lo primero que ve un SUPERADMIN al entrar a /crm.
   Los leads marcados como importantes (de todas las carteras) y la agenda de los próximos días. Un SDR no lo ve nunca: sigue entrando a la
   lista, como siempre. */

/** `?resumen=1` el resumen, `?resumen=0` la lista. Ausente, decide `muestraResumen`. */
export const RESUMEN_PARAM = 'resumen'

export type QuienMiraResumen = { esSuperadmin: boolean; como: boolean }

/** Lo que dice «vine a la lista»: un enlace con lead, filtros, vista o carteras (Equipo, una alarma). */
const PARAMS_DE_LA_LISTA = [...LEAD_FILTER_PARAMS_WITH_QUERY, LEAD_PARAM, VISTA_PARAM, OWNERS_PARAM, COMO_PARAM]

/**
 * Si se dibuja el resumen en vez de la lista. Solo un SUPERADMIN y nunca con «Ver como» (se mira
 * el CRM de otro, que no tiene resumen). El parámetro explícito gana; sin él, /crm pelado es el
 * resumen y un enlace que trae algo de la lista es la lista.
 */
export function muestraResumen(params: URLSearchParams, quien: QuienMiraResumen): boolean {
  if (!quien.esSuperadmin || quien.como) return false
  const explicito = params.get(RESUMEN_PARAM)
  if (explicito === '1') return true
  if (explicito === '0') return false
  return !PARAMS_DE_LA_LISTA.some(k => params.has(k))
}

export function escribirResumen(params: URLSearchParams, resumen: boolean): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set(RESUMEN_PARAM, resumen ? '1' : '0')
  return next
}

/**
 * Para un SUPERADMIN, lo que decidió `muestraResumen` queda escrito en la URL (`?resumen=1|0`). Si
 * no, la vista dependería de lo que se toca adentro: abrir un lead desde el resumen (`?lead=`) lo
 * mandaría a la lista, y «Limpiar filtros» en una lista a la que se llegó por un enlace (`?hoy=1`)
 * lo dejaría en /crm pelado, que es el resumen. null = no hay nada que fijar (ya está, es un SDR o
 * es «Ver como»).
 */
export function fijarResumenEnLaUrl(params: URLSearchParams, quien: QuienMiraResumen): URLSearchParams | null {
  if (!quien.esSuperadmin || quien.como || params.has(RESUMEN_PARAM)) return null
  return escribirResumen(params, muestraResumen(params, quien))
}

/**
 * Los importantes: los de la estrella y los de las etapas con «Dashboard: Sí» (23/10/2026, por
 * pedido: son la misma caja, no dos). Sin las columnas en la base (undefined) no hay ninguno. Primero los que tienen la tarea más próxima (lo vencido arriba), después los sin
 * tarea, y los descartados al final; a igualdad, por nombre.
 */
export function leadsImportantes(
  leads: readonly CrmLeadRow[], proximas: ReadonlyMap<string, ProximaTarea>, etapas: ReadonlyMap<string, CrmStage>,
): CrmLeadRow[] {
  const rango = (l: CrmLeadRow) => (esDescartado(l, etapas) ? 2 : proximas.has(l.id) ? 0 : 1)
  const vence = (l: CrmLeadRow) => proximas.get(l.id)?.tarea.due_date ?? '9999-12-31'
  return leads
    .filter(l => l.deleted_at == null && (l.importante === true || enElDashboard(etapaDelLead(l, etapas))))
    .sort((a, b) => rango(a) - rango(b) || vence(a).localeCompare(vence(b))
      || nombreDelLead(a.client).localeCompare(nombreDelLead(b.client), 'es', { sensitivity: 'base' }))
}

/** Si la etapa se ve en el Dashboard (`crm_funnel_stages.show_in_dashboard`). Sin la columna en la
 *  base (undefined) no se ve ninguna; una borrada tampoco, que ya no se puede desmarcar. */
function enElDashboard(e: CrmStage | null | undefined): e is CrmStage {
  return e?.show_in_dashboard === true && e.deleted_at == null
}

export function hayEtapasEnElDashboard(etapas: Iterable<CrmStage>): boolean {
  return [...etapas].some(enElDashboard)
}

export type DiaDeAgenda<T> = { dia: string; reuniones: T[] }

/**
 * Las reuniones de `dias` días desde `hoy` (incluido), por día local de quien mira y en orden.
 * Solo los días con algo. Las canceladas y las borradas no van; las hechas sí, que siguen siendo
 * de ese día.
 */
export function reunionesPorDia<T extends Pick<CrmMeeting, 'starts_at' | 'status' | 'deleted_at'>>(
  reuniones: readonly T[], hoy: string, dias: number,
): DiaDeAgenda<T>[] {
  const hasta = shiftIsoDate(hoy, dias)
  const porDia = new Map<string, T[]>()
  const vivas = reuniones
    .filter(r => r.deleted_at == null && r.status !== 'cancelled')
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  for (const r of vivas) {
    const dia = toLocalYmd(new Date(r.starts_at))
    if (dia < hoy || dia >= hasta) continue
    porDia.set(dia, [...(porDia.get(dia) ?? []), r])
  }
  return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, rs]) => ({ dia, reuniones: rs }))
}

/**
 * Las reuniones de «Mías» en la agenda del Dashboard: las que tengo de responsable y las de otro
 * que están en mi Google (26/10/2026: una demo que agendó una compañera y me invitó). Sin lo
 * segundo, esa demo no salía en ningún lado: no es mía por `assigned_to` y `eventosDeGoogleSueltos`
 * la saca de mi Google por ser ya una reunión del CRM.
 */
export function reunionesMias<T extends Pick<CrmMeeting, 'assigned_to' | 'external_event_id'>>(
  reuniones: readonly T[], google: readonly Pick<GoogleAgendaItem, 'id'>[], myId: string | null,
): T[] {
  const enMiGoogle = new Set(google.map(e => e.id))
  return reuniones.filter(r => r.assigned_to === myId || (r.external_event_id != null && enMiGoogle.has(r.external_event_id)))
}

/**
 * Los ids de Google de lo que me invitaron y todavía no acepté (26/10/2026, por pedido): el Dashboard
 * lo muestra igual, con «Pendiente aceptar». Vale para el evento suelto (`id`) y para la reunión del
 * CRM (`external_event_id`), que en el Google del invitado lleva el mismo id.
 */
export function invitacionesSinAceptar(google: readonly GoogleAgendaItem[]): Set<string> {
  return new Set(google.filter(e => e.sinAceptar).map(e => e.id))
}

/** Un evento del Google de quien mira, con la forma que entiende `reunionesPorDia`. */
export type EventoDeGoogle = Pick<CrmMeeting, 'id' | 'title' | 'starts_at' | 'status' | 'deleted_at'> & {
  deGoogle: true
  todoElDia: boolean
}

/**
 * Lo de tu Google que no es una reunión del CRM, para la agenda del Dashboard (23/10/2026, por
 * pedido: «todo lo agendado en Calendar»). Se sacan los que ya son una reunión, de cualquiera y
 * cancelada incluida (como `buildAgendaEvents` de la Agenda): si no, salen dos veces. El de todo
 * el día viene como `YYYY-MM-DD`, que `new Date` leería en UTC y en Venezuela caería el día
 * anterior: se pasa a la medianoche local, que además lo pone primero en su día.
 */
export function eventosDeGoogleSueltos(
  google: readonly GoogleAgendaItem[], reuniones: readonly Pick<CrmMeeting, 'external_event_id'>[],
): EventoDeGoogle[] {
  const yaSonReunion = new Set(reuniones.map(r => r.external_event_id).filter((id): id is string => id != null))
  return google.filter(e => !yaSonReunion.has(e.id)).map(e => ({
    id: e.id,
    title: e.summary,
    starts_at: e.isAllDay ? new Date(`${e.start.slice(0, 10)}T00:00:00`).toISOString() : e.start,
    status: 'scheduled',
    deleted_at: null,
    deGoogle: true,
    todoElDia: e.isAllDay,
  }))
}
