import type { CrmLeadRow, CrmTask } from '../types'

/* Cómo un aviso de realtime cambia lo que ya está en la cache, sin volver a pedirlo (24/11/2026).
   Hasta ese día cada cambio en `crm_comments`, `crm_leads` o `crm_clients` —de cualquiera— hacía
   que cada pantalla abierta re-trajera la lista entera (~950 leads con su cliente y su último
   registro): ~2.400 veces por día, 3,2 s de media en la base, hasta el corte de 8 s. Ahora el
   aviso se aplica sobre la fila que ya está, y solo lo que no se puede deducir pide recargar.

   `RECARGAR` = no alcanza con el aviso: hay que volver a pedir (lo junta y lo demora el hook).
   Devolver la misma referencia = el aviso no cambia nada de esta lista. */

export const RECARGAR = 'recargar' as const
export type Resultado<T> = T | typeof RECARGAR

/** Lo que trae `postgres_changes`. `new` está vacío en un DELETE y `old` solo trae la clave
 *  primaria (la réplica no es FULL). Un UPDATE no trae las columnas largas que no cambiaron
 *  (TOAST): por eso se FUSIONA sobre la fila de la cache, nunca se la reemplaza. */
export type AvisoRealtime = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const instante = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/** El lead (o el autor) del que habla el aviso: del registro nuevo o, en un DELETE, del viejo. */
export function campoDelAviso(a: AvisoRealtime, campo: string): string | null {
  return texto(a.new?.[campo]) ?? texto(a.old?.[campo])
}

/** «Última actividad» de la lista: el comentario MANUAL más nuevo sin borrar (ver `getLeads`). */
export function leadsConComentario(leads: CrmLeadRow[], a: AvisoRealtime): Resultado<CrmLeadRow[]> {
  if (a.eventType === 'DELETE') return RECARGAR // no pasa (es soft delete), y no se sabe de qué lead era
  const c = a.new
  if (c.comment_type !== 'MANUAL') return leads
  const leadId = texto(c.lead_id)
  const creado = texto(c.created_at)
  if (!leadId || !creado) return RECARGAR
  const i = leads.findIndex(l => l.id === leadId)
  if (i < 0) return leads // un lead que no está en la lista: ya llegará por su propio aviso
  const actual = leads[i].ultima_actividad_at ?? null

  if (c.deleted_at) {
    // Se borró. Si era el último, cuál pasa a ser el último lo sabe solo la base.
    return instante(actual) === instante(creado) ? RECARGAR : leads
  }
  if (actual && instante(actual) >= instante(creado)) return leads
  const copia = leads.slice()
  copia[i] = { ...leads[i], ultima_actividad_at: creado }
  return copia
}

/** Un lead nuevo, cambiado o borrado. Un INSERT recarga: el aviso no trae el cliente embebido. */
export function leadsConLead(leads: CrmLeadRow[], a: AvisoRealtime): Resultado<CrmLeadRow[]> {
  if (a.eventType !== 'UPDATE') return RECARGAR
  const id = texto(a.new.id)
  if (!id) return RECARGAR // un registro que no entró en el aviso (demasiado grande)
  const i = leads.findIndex(l => l.id === id)
  if (a.new.deleted_at) return i < 0 ? leads : leads.filter(l => l.id !== id)
  // No estaba: se lo pasaron a una cartera que veo o lo restauraron. Falta su cliente.
  if (i < 0) return RECARGAR
  const copia = leads.slice()
  // `client` y `ultima_actividad_at` no son columnas: el aviso no los trae y se conservan.
  copia[i] = { ...leads[i], ...(a.new as Partial<CrmLeadRow>) }
  return copia
}

/** Un cliente cambiado se cambia en todos los leads que cuelgan de él. */
export function leadsConCliente(leads: CrmLeadRow[], a: AvisoRealtime): Resultado<CrmLeadRow[]> {
  if (a.eventType === 'INSERT') return leads // sin lead todavía: lo trae el aviso del lead
  if (a.eventType === 'DELETE') return RECARGAR
  const id = texto(a.new.id)
  if (!id) return RECARGAR
  if (!leads.some(l => l.client?.id === id)) return leads
  return leads.map(l => (l.client?.id === id ? { ...l, client: { ...l.client, ...(a.new as Partial<NonNullable<CrmLeadRow['client']>>) } } : l))
}

/** Las tareas pendientes (`getTareasPendientes`): sin completar y sin borrar. */
export function tareasConTarea(tareas: CrmTask[], a: AvisoRealtime): Resultado<CrmTask[]> {
  if (a.eventType === 'DELETE') {
    const id = texto(a.old?.id)
    if (!id) return RECARGAR
    return tareas.some(t => t.id === id) ? tareas.filter(t => t.id !== id) : tareas
  }
  const id = texto(a.new.id)
  if (!id) return RECARGAR
  const i = tareas.findIndex(t => t.id === id)
  const fila = (i < 0 ? a.new : { ...tareas[i], ...a.new }) as CrmTask
  const pendiente = !fila.completed && !fila.deleted_at
  if (i < 0) {
    if (!pendiente) return tareas
    // Una tarea que no conocíamos llega entera solo en el INSERT; en un UPDATE pueden faltarle columnas.
    return a.eventType === 'INSERT' ? [...tareas, fila] : RECARGAR
  }
  if (!pendiente) return tareas.filter(t => t.id !== id)
  const copia = tareas.slice()
  copia[i] = fila
  return copia
}

/** ¿Esta key de `['crm','llamadas',…]` es del contador de `autor`? (`llamadasEntre`, `haciaLaProximaDemo`). */
export function esLlamadaDe(queryKey: readonly unknown[], autor: string): boolean {
  if (queryKey[0] !== 'crm' || queryKey[1] !== 'llamadas') return false
  return queryKey[2] === 'hacia-demo' ? queryKey[3] === autor : queryKey[2] === autor
}
