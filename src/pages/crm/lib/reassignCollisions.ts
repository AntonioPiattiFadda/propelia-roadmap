import type { CrmLead } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/lib/reassignCollisions.ts). Allá la casilla es
   (cliente, tipo, agente); acá el único es `crm_leads_client_assignee_active_uidx
   (client_id, assigned_to)`: el mismo cliente puede tener un lead por comercial, pero no dos del
   mismo. Esto es un AVISO, no la autoridad: entre que se pinta y se confirma, el destino puede
   crear el lead que falta. Quien decide es la base. */

export interface LeadSlot {
  clientId: string
}

export interface ReassignCandidate extends LeadSlot {
  id: string
  /** Ya formateado por la página: es lo que se lista en el cartel. */
  clientName: string
  assignedTo: string
}

export const findReassignCollisions = (candidates: ReassignCandidate[], targetSlots: LeadSlot[]): ReassignCandidate[] => {
  if (targetSlots.length === 0) return []
  const taken = new Set(targetSlots.map(s => s.clientId))
  return candidates.filter(c => taken.has(c.clientId))
}

/** Las casillas ocupadas del destino, sacadas de la lista que ya está en memoria: quien puede
 *  reasignar ahí tiene write, o sea que ve todos los leads de esa cartera. */
export function slotsDeCartera(leads: Pick<CrmLead, 'client_id' | 'assigned_to' | 'deleted_at'>[], userId: string): LeadSlot[] {
  return leads.filter(l => l.assigned_to === userId && l.deleted_at == null).map(l => ({ clientId: l.client_id }))
}

/**
 * Qué se manda y qué no. Se mandan SOLO los que no chocan: mandar uno que choca haría fallar
 * ese update, y cada choque sería un error en vez de un aviso. Dos del mismo cliente en el mismo
 * lote también chocan entre sí: el primero ocupa la casilla del segundo.
 */
export function particionarReasignacion(
  candidates: ReassignCandidate[], targetId: string, targetSlots: LeadSlot[],
): { mover: ReassignCandidate[]; chocan: ReassignCandidate[]; yaEran: ReassignCandidate[] } {
  const ocupadas = new Set(targetSlots.map(s => s.clientId))
  const mover: ReassignCandidate[] = [], chocan: ReassignCandidate[] = [], yaEran: ReassignCandidate[] = []
  for (const c of candidates) {
    // Antes que las casillas: el lead que ya es del destino ocupa su propia casilla.
    if (c.assignedTo === targetId) { yaEran.push(c); continue }
    if (ocupadas.has(c.clientId)) { chocan.push(c); continue }
    ocupadas.add(c.clientId)
    mover.push(c)
  }
  return { mover, chocan, yaEran }
}
