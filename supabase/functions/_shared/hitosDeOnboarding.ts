/* Los hitos que ve el cliente en crm.propelia.es/onboarding (6/11/2026, por pedido): la página de
   propelia-frontend lee su avance de acá, por `onboarding-progreso`. Un solo archivo para las dos
   puntas, como `plantillasEmail.ts`: la edge function calcula con esto y /clientes lo muestra.

   Un hito está hecho si se cumplen sus tareas del alta (`tareas`, claves de
   `client_onboarding_tasks` = `<paso>.<tarea>` de src/pages/clientes/lib/pasos.ts) o si alguien lo
   tildó a mano en /clientes (`hito.<id>`, misma tabla, sin migración: como `contacto.probada.<miembro>`).
   Los que no tienen tareas (IA, migración, bot) son solo a mano. «Google» además lo da por hecho el
   producto cuando todo el equipo conectó el calendario: eso no se sabe acá. */

export const HITOS = [
  { id: 'equipo', titulo: 'Equipo y cuenta demo', bloque: 'prueba', tareas: ['contacto.importar-usuarios', 'cartera-leads.importar'] },
  { id: 'google', titulo: 'Conexión con Google', bloque: 'prueba', tareas: [], calendario: true },
  { id: 'idealista', titulo: 'Leads de Idealista', bloque: 'prueba', tareas: ['cartera-leads.mails-idealista', 'cartera-leads.lead-prueba'] },
  { id: 'portales', titulo: 'Integración Idealista + Fotocasa', bloque: 'prueba', tareas: ['portales.idealista', 'portales.fotocasa'] },
  { id: 'ia', titulo: 'IA conectada', bloque: 'prueba', tareas: [] },
  { id: 'migracion', titulo: 'Migración: bases de datos y leads', bloque: 'despues', tareas: [] },
  { id: 'bot', titulo: 'Bot de llamadas y WhatsApp', bloque: 'despues', tareas: [] },
] as const satisfies readonly { id: string; titulo: string; bloque: 'prueba' | 'despues'; tareas: readonly string[]; calendario?: boolean }[]

export type Hito = (typeof HITOS)[number]
export type HitoId = Hito['id']

/** La clave del tilde a mano del hito en `client_onboarding_tasks`. */
export const tareaDeHito = (id: HitoId) => `hito.${id}`

/** Hecho por las tareas del alta (sin tareas, nunca). */
export const hechoPorTareas = (h: Hito, hechas: ReadonlySet<string>) =>
  h.tareas.length > 0 && h.tareas.every(t => hechas.has(t))

/** Lo que manda `onboarding-progreso`: hecho por tareas o a mano. «google» es solo el tilde a mano;
 *  el producto le suma el calendario del equipo. */
export function estadoDeHitos(hechas: ReadonlySet<string>): Record<HitoId, boolean> {
  return Object.fromEntries(
    HITOS.map(h => [h.id, hechas.has(tareaDeHito(h.id)) || hechoPorTareas(h, hechas)]),
  ) as Record<HitoId, boolean>
}

/** La regla del calendario, la misma que usa la página del producto: alguien en el equipo y todos conectados. */
export const calendarioListo = (equipo: readonly { calendar_connected?: boolean }[]) =>
  equipo.length > 0 && equipo.every(a => a.calendar_connected === true)
