import { calendarDeadline } from './calendarDeadline'

/* Copiado de propelia-frontend (src/pages/leads/lib/gestionStatus.ts) sin los cruces con
   propiedades: allá un cambio de etapa del sistema sobre un cruce reabre el lead
   (`reopenedBySystem`); acá no hay cruces y `crm_gestion_refresh()` tampoco lo calcula. */

export type ManagementAction = 'MANUAL' | 'POSTPONED'

export type ManagementEvent = { id: string; effective_at: string; created_at: string; action: ManagementAction }

export type GestionStatus = {
  label: 'Gestionado' | 'Pendiente'
  variant: 'green' | 'red'
  postponed: boolean
  referenceDate: string
  hasEvents: boolean
}

/** Las tres claves del filtro de gestión. Pospuesto va aparte aunque se pinte verde: es lo que
 *  la spec llama «postergada», y mezclarla con «al día» escondería los leads que alguien pateó. */
export type GestionKey = 'pendiente' | 'gestionado' | 'pospuesto'

/**
 * La mitad determinística: desde qué fecha corre el reloj. Es EXACTAMENTE lo que precalcula la
 * base en `crm_leads.gestion_*`; lo que queda afuera (comparar contra el vencimiento) depende del
 * huso de quien mira y por eso no puede vivir en una columna.
 */
export type GestionReference = {
  referenceDate: string
  /** El evento que ganó es un POSTPONED. Si además su fecha es futura, el lead está pospuesto. */
  postponedCandidate: boolean
  hasEvents: boolean
}

export function resolveGestionReference(events: ManagementEvent[] | null, leadCreatedAt: string): GestionReference {
  // Date.parse y no localeCompare: Postgres devuelve `+00:00` y el front escribe `Z`, y como
  // strings no se ordenan igual. El desempate por created_at es el mismo de la base.
  const last = (events ?? []).slice().sort((a, b) =>
    Date.parse(b.effective_at) - Date.parse(a.effective_at) || Date.parse(b.created_at) - Date.parse(a.created_at))[0]
  // Sin ningún evento el lead queda Pendiente: alguien tiene que hacer la primera gestión.
  if (!last) return { referenceDate: leadCreatedAt, postponedCandidate: false, hasEvents: false }
  return { referenceDate: last.effective_at, postponedCandidate: last.action === 'POSTPONED', hasEvents: true }
}

export function gestionDesdeReferencia(
  ref: GestionReference,
  toleranceHours: number | null | undefined,
  now: number = Date.now(),
): GestionStatus {
  const { referenceDate, postponedCandidate, hasEvents } = ref
  const refMs = Date.parse(referenceDate)
  const postponed = postponedCandidate && refMs > now
  // Tiempo de gestión «Nunca»: sin reloj no se puede vencer. Un estado real y no null, así la
  // celda, el filtro y los contadores dicen lo mismo.
  if (!toleranceHours) return { label: 'Gestionado', variant: 'green', postponed, referenceDate, hasEvents }
  if (!hasEvents) return { label: 'Pendiente', variant: 'red', postponed: false, referenceDate, hasEvents: false }
  const vigente = now < calendarDeadline(refMs, toleranceHours)
  return {
    label: vigente ? 'Gestionado' : 'Pendiente',
    variant: vigente ? 'green' : 'red',
    postponed,
    referenceDate,
    hasEvents: true,
  }
}

export function getGestionStatus(
  events: ManagementEvent[] | null,
  toleranceHours: number | null | undefined,
  leadCreatedAt: string,
  now: number = Date.now(),
): GestionStatus {
  return gestionDesdeReferencia(resolveGestionReference(events, leadCreatedAt), toleranceHours, now)
}

/** Lo mínimo de un lead para saber su gestión sin pedir sus eventos. */
export type LeadGestion = {
  created_at: string
  gestion_reference_at: string | null
  gestion_postponed: boolean
  gestion_has_events: boolean
}

/**
 * La gestión de un lead desde las columnas que ya escribe la base. Es lo que usa la lista: con
 * esto no hace falta traer los eventos de todos los leads para pintar una columna.
 * `gestion_reference_at` en null es un lead que el trigger todavía no tocó: vale created_at, lo
 * mismo que haría `crm_gestion_refresh()`.
 */
export function gestionDeLead(lead: LeadGestion, toleranceHours: number | null | undefined, now: number = Date.now()): GestionStatus {
  return gestionDesdeReferencia(
    {
      referenceDate: lead.gestion_reference_at ?? lead.created_at,
      postponedCandidate: lead.gestion_postponed,
      hasEvents: lead.gestion_has_events,
    },
    toleranceHours,
    now,
  )
}

export function claveDeGestion(status: GestionStatus): GestionKey {
  if (status.postponed) return 'pospuesto'
  return status.variant === 'red' ? 'pendiente' : 'gestionado'
}

/**
 * Lo que va a escribir `crm_gestion_refresh()` cuando llegue el evento, aplicado ya en pantalla.
 * Gana el de mayor effective_at; en empate gana el nuevo (la base desempata por created_at, y el
 * nuevo es el más reciente). Por eso una gestión de hoy no pisa una postergación a futuro.
 */
export function aplicarGestionOptimista<T extends LeadGestion>(
  lead: T,
  evento: { action: ManagementAction; effective_at: string },
): T {
  if (lead.gestion_has_events && lead.gestion_reference_at
      && Date.parse(lead.gestion_reference_at) > Date.parse(evento.effective_at)) {
    return lead
  }
  return {
    ...lead,
    gestion_reference_at: evento.effective_at,
    gestion_postponed: evento.action === 'POSTPONED',
    gestion_has_events: true,
  }
}
