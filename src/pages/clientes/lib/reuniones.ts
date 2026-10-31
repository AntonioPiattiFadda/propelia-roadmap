import type { Tables } from '@/types/database.types'

/* Las capacitaciones del alta (31/10/2026, por pedido): reuniones del CRM del lead marcadas con la
   tarea que cumplen (`crm_meetings.onboarding_task`). Ver `Tarea.reunion` en `pasos.ts`. */

type Reunion = Pick<Tables<'crm_meetings'>, 'onboarding_task' | 'status' | 'deleted_at' | 'starts_at' | 'ends_at'>

/** La reunión de la tarea: la última que no se borró ni se canceló. `cancelada` dice si hubo alguna
 *  cancelada, para no preguntar «¿se hizo?» por una que no va a pasar. */
export function reunionDeLaTarea<R extends Reunion>(reuniones: readonly R[], clave: string): { activa: R | null; cancelada: boolean } {
  const suyas = reuniones.filter(r => r.onboarding_task === clave && !r.deleted_at)
  const activa = suyas
    .filter(r => r.status !== 'cancelled')
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0] ?? null
  return { activa, cancelada: suyas.some(r => r.status === 'cancelled') }
}

/** Si va debajo el «¿Se hizo la reunión?». Pide la tarea tildada (agendada) y que la reunión ya haya
 *  terminado; tildada sin reunión en el sistema (se agendó por fuera) pregunta enseguida, salvo que la
 *  que había se haya cancelado: ahí toca volver a agendar. */
export function preguntaSiSeHizo(agendada: boolean, r: { activa: Reunion | null; cancelada: boolean }, ahora: Date): boolean {
  if (!agendada) return false
  if (r.activa) return new Date(r.activa.ends_at) <= ahora
  return !r.cancelada
}
