/* Avisos en el lead para la SDR (19/11/2026, por pedido): «te olvidaste de cargar el decisor».
   Los deja el conector MCP (`add_crm_lead_notice` → RPC `mcp_crm_avisar_lead`, tabla
   `crm_lead_avisos`) y se ven en rojo arriba del lead, en la campana y en un toast, hasta que
   alguien los marca «Listo». Reglas puras: el servicio trae los pendientes que la RLS deja ver. */

export interface AvisoDelLead {
  id: string
  lead_id: string
  texto: string
  /** A quién le suena: siempre alguien (la RPC pone el responsable del lead si no se elige). */
  para: string
  created_by: string
  created_at: string
  resuelto_at: string | null
  resuelto_por: string | null
  lead: { client: { company_name: string | null } | null } | null
}

const masNuevoPrimero = (a: AvisoDelLead, b: AvisoDelLead) => b.created_at.localeCompare(a.created_at)

/** Los pendientes de un lead, el más nuevo arriba. Los ve cualquiera que abra el lead. */
export function avisosPendientesDelLead(avisos: readonly AvisoDelLead[], leadId: string): AvisoDelLead[] {
  return avisos.filter(a => a.lead_id === leadId && !a.resuelto_at).sort(masNuevoPrimero)
}

/** Los pendientes dirigidos a `yo`: la campana y el toast. */
export function avisosPendientesPara(avisos: readonly AvisoDelLead[], yo: string | null): AvisoDelLead[] {
  if (!yo) return []
  return avisos.filter(a => a.para === yo && !a.resuelto_at).sort(masNuevoPrimero)
}

/** Lo marca «Listo» quien escribe el lead o su destinatario (la misma regla que la policy). */
export function puedeMarcarAviso(aviso: AvisoDelLead, yo: string | null, escribeElLead: boolean): boolean {
  return escribeElLead || (!!yo && aviso.para === yo)
}
