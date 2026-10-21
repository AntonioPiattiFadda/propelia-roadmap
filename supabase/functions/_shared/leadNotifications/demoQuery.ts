/**
 * Select de PostgREST para cargar una demo (`crm_meetings`) con todo lo que necesita el aviso.
 * `users!crm_meetings_assigned_to_fkey` (nombre de la constraint): crm_meetings tiene DOS FK a
 * users (assigned_to y created_by); sin el hint PostgREST tira "more than one relationship".
 * Copiado de `visitScheduledQuery` de `propelia-frontend` (21/10/2026).
 */
export const DEMO_SCHEDULED_SELECT = `
  id, status, deleted_at, starts_at, guest_emails,
  lead:crm_leads(deleted_at, client:crm_clients(first_name, company_name, email, deleted_at)),
  agent:users!crm_meetings_assigned_to_fkey(nombre, last_name, email, phone, activo, firma_nombre, firma_cargo, firma_telefono)
`

export type DemoAgentRow = {
  nombre: string
  last_name: string | null
  email: string | null
  phone: string | null
  activo: boolean
  firma_nombre: string | null
  firma_cargo: string | null
  firma_telefono: string | null
}

export type DemoScheduledRow = {
  id: string
  status: string
  deleted_at: string | null
  starts_at: string
  guest_emails: string[]
  /** null = la reunión no es de ningún lead. */
  lead_deleted_at: string | null
  has_lead: boolean
  client: { first_name: string | null; company_name: string | null; email: string | null; deleted_at: string | null } | null
  agent: DemoAgentRow | null
}

// PostgREST devuelve objeto o array según cómo detecta la relación: se aceptan los dos.
// deno-lint-ignore no-explicit-any
const one = (value: any) => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null))

// deno-lint-ignore no-explicit-any
export function normalizeDemoScheduledRow(raw: any): DemoScheduledRow {
  const lead = one(raw.lead)
  return {
    id: raw.id,
    status: raw.status,
    deleted_at: raw.deleted_at ?? null,
    starts_at: raw.starts_at,
    guest_emails: Array.isArray(raw.guest_emails) ? raw.guest_emails : [],
    has_lead: !!lead,
    lead_deleted_at: lead?.deleted_at ?? null,
    client: lead ? one(lead.client) : null,
    agent: one(raw.agent),
  }
}

/** El mismo buzón: sin mayúsculas, y en gmail sin los puntos de la parte local (Gmail los ignora). */
export function sameMailbox(a: string, b: string): boolean {
  const norm = (e: string) => {
    const [local, domain] = e.trim().toLowerCase().split('@')
    if (!domain) return e.trim().toLowerCase()
    return `${domain === 'gmail.com' || domain === 'googlemail.com' ? local.replace(/\./g, '') : local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`
  }
  return norm(a) === norm(b)
}

/**
 * A quién le llega el aviso. En el producto es siempre el email del cliente del lead; acá la demo
 * guarda además el «mail para la invitación» como invitado, y ése es el que eligió quien la agendó:
 * va primero el primer invitado que no sea del equipo (Lorenzo, que va en toda demo, o cualquier
 * compañero). Sin ninguno, el email de la inmobiliaria.
 */
export function demoRecipientEmail(row: Pick<DemoScheduledRow, 'guest_emails' | 'client'>, teamEmails: string[]): string | null {
  const external = row.guest_emails.find(g => !teamEmails.some(t => sameMailbox(g, t)))
  return external ?? row.client?.email ?? null
}
