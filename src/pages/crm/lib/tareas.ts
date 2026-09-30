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

export function tareasVencidasPorLead(tasks: CrmTask[], today: string): Map<string, CrmTask[]> {
  const porLead = new Map<string, CrmTask[]>()
  for (const t of tasks) {
    if (!t.lead_id || !estaVencida(t, today)) continue
    porLead.set(t.lead_id, [...(porLead.get(t.lead_id) ?? []), t])
  }
  return porLead
}
