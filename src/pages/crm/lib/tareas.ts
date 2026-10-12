import type { CrmTask } from '../types'

type TareaVencible = Pick<CrmTask, 'due_date' | 'completed' | 'deleted_at'>

/** Vencida recién cuando el día terminó: la que vence hoy todavía está a tiempo. `due_date` es
 *  un día de calendario y se compara como string contra el `today` LOCAL de quien mira. */
export function estaVencida(t: TareaVencible, today: string): boolean {
  return !t.completed && t.deleted_at == null && t.due_date != null && t.due_date.slice(0, 10) < today
}

/** Los leads con alguna tarea vencida. Las sueltas (sin lead) no marcan a ningún lead. */
export function idsConTareasVencidas(tasks: Array<TareaVencible & Pick<CrmTask, 'lead_id'>>, today: string): Set<string> {
  const ids = new Set<string>()
  for (const t of tasks) if (t.lead_id && estaVencida(t, today)) ids.add(t.lead_id)
  return ids
}

/** Sin fecha al final: no tienen con qué ordenarse contra las que sí la tienen, y ponerlas
 *  primero las haría parecer más urgentes que una de mañana. Se compara el día, no la hora. */
export function porVencimiento(a: Pick<CrmTask, 'due_date'>, b: Pick<CrmTask, 'due_date'>): number {
  return (a.due_date ?? '9999-12-31').slice(0, 10).localeCompare((b.due_date ?? '9999-12-31').slice(0, 10))
}

export type ProximaTarea = { tarea: CrmTask; pendientes: number }

/** La tarea pendiente que vence primero en cada lead, y cuántas pendientes tiene en total. Las
 *  sueltas, las completadas y las borradas no cuentan. */
export function proximaTareaPorLead(tasks: CrmTask[]): Map<string, ProximaTarea> {
  const porLead = new Map<string, ProximaTarea>()
  for (const t of tasks) {
    if (!t.lead_id || t.completed || t.deleted_at != null) continue
    const actual = porLead.get(t.lead_id)
    if (!actual) porLead.set(t.lead_id, { tarea: t, pendientes: 1 })
    else porLead.set(t.lead_id, {
      tarea: porVencimiento(t, actual.tarea) < 0 ? t : actual.tarea,
      pendientes: actual.pendientes + 1,
    })
  }
  return porLead
}

/** Por la próxima tarea de cada lead: lo vencido arriba (lo más viejo primero), después lo que
 *  viene, las sin fecha y al final los leads sin tarea. `sort` es estable: el empate respeta el
 *  orden que traía la lista. */
export function ordenarPorProximaTarea<T extends { id: string }>(
  leads: readonly T[], proximas: ReadonlyMap<string, ProximaTarea>,
): T[] {
  return [...leads].sort((a, b) => {
    const ta = proximas.get(a.id), tb = proximas.get(b.id)
    if (!ta || !tb) return (ta ? 0 : 1) - (tb ? 0 : 1)
    return porVencimiento(ta.tarea, tb.tarea)
  })
}

export type EtapaOrdenable = { position: number; is_out_of_funnel: boolean }

/** Por estado: lo más avanzado del funnel arriba (Meeting booked antes que Intentando contactar),
 *  porque es lo que está más cerca de cerrarse. Los fuera del funnel (Descartado) y los sin etapa
 *  van al final. Dentro de un mismo estado manda la próxima tarea, como el orden por defecto. */
export function ordenarPorEstado<T extends { id: string }>(
  leads: readonly T[], proximas: ReadonlyMap<string, ProximaTarea>, etapaDe: (lead: T) => EtapaOrdenable | null,
): T[] {
  const rango = (l: T) => {
    const e = etapaDe(l)
    // Números finitos: Infinity - Infinity da NaN y rompe el `sort` con dos leads sin etapa.
    if (!e) return 2e9
    return e.is_out_of_funnel ? 1e9 : -e.position
  }
  return ordenarPorProximaTarea(leads, proximas).sort((a, b) => rango(a) - rango(b))
}

export function tareasVencidasPorLead(tasks: CrmTask[], today: string): Map<string, CrmTask[]> {
  const porLead = new Map<string, CrmTask[]>()
  for (const t of tasks) {
    if (!t.lead_id || !estaVencida(t, today)) continue
    porLead.set(t.lead_id, [...(porLead.get(t.lead_id) ?? []), t])
  }
  return porLead
}
