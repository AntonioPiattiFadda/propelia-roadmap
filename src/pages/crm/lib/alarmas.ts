import type { CrmTask } from '../types'

/* La alarma de una tarea con hora (17/10/2026, por pedido): «Llamar a Marc el lunes a las 10:30»
   suena a las 10:25. Suena solo mientras el CRM esté abierto en alguna pestaña (ver
   `useAlarmasDeTareas`): sin push ni service worker ni cron. Todo lo que decide CUÁNDO vive acá,
   puro; el hook solo mira el reloj y avisa. */

/** Cuánto antes de la hora suena. */
export const MINUTOS_DE_AVISO = 5

/** Hasta cuánto DESPUÉS de la hora de la tarea todavía vale avisar. Pasado eso la alarma ya no
 *  sirve: abrir el CRM a la tarde no tiene que hacer sonar de golpe las de la mañana. Una hora
 *  cubre lo que sí pasa — la pestaña dormida en segundo plano, la compu que vuelve de suspender,
 *  entrar a las 10:40 a una llamada de las 10:30 que todavía se puede hacer. */
export const MINUTOS_DE_VIGENCIA = 60

/** Cuánto se recuerda que una alarma ya sonó. Pasada la vigencia no vuelve a sonar igual: esto
 *  es solo para que la lista guardada no crezca para siempre. */
const DIAS_DE_MEMORIA = 2

export type TareaConAlarma = Pick<CrmTask, 'id' | 'due_date' | 'completed' | 'deleted_at'> & {
  /** `undefined` mientras la migración `crm_tasks_due_time` no esté corrida: la lectura es `*`. */
  due_time?: string | null
}

const HORA = /^(\d{2}):(\d{2})/

/** 'HH:MM' de la columna `time` ('10:30:00') o del `<input type="time">` ('10:30'). */
export function horaCorta(dueTime: string | null | undefined): string | null {
  const m = dueTime ? HORA.exec(dueTime) : null
  return m ? `${m[1]}:${m[2]}` : null
}

/* La hora de una tarea es SIEMPRE hora de España (17/10/2026, por pedido): las inmobiliarias están
   allá y la llamada se hace en su horario. Al lado se muestra la de Venezuela, donde trabaja parte
   del equipo. La columna `due_time` no cambia (un `time` sin zona): lo que cambió es qué zona se
   lee ahí, así que la alarma suena a la hora correcta esté quien esté donde esté. */
export const ZONA_ESPANA = 'Europe/Madrid'
export const ZONA_VENEZUELA = 'America/Caracas'

function partesEnZona(instante: number, zona: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instante)).map(x => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

/** Minutos que la zona le lleva a UTC en ese instante (cambia con el horario de verano). */
function desfaseMin(instante: number, zona: string): number {
  const { fecha, hora } = partesEnZona(instante, zona)
  const [y, mo, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  return Math.round((Date.UTC(y, mo - 1, d, h, mi) - Math.floor(instante / 60_000) * 60_000) / 60_000)
}

/** El instante de un día + hora de reloj en España. */
function instanteEnEspana(dueDate: string, hora: string): number | null {
  const [y, mo, d] = dueDate.slice(0, 10).split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const comoUtc = Date.UTC(y, mo - 1, d, h, mi)
  if (Number.isNaN(comoUtc)) return null
  // Dos pasadas: el desfase de la primera puede ser el del otro lado del cambio de hora.
  const primero = comoUtc - desfaseMin(comoUtc, ZONA_ESPANA) * 60_000
  return comoUtc - desfaseMin(primero, ZONA_ESPANA) * 60_000
}

/** Qué hora es en Venezuela a esa hora de España, y si cae otro día (−1 = el día anterior). */
export function horaEnVenezuela(dueDate: string | null | undefined, dueTime: string | null | undefined): { hora: string; dias: number } | null {
  const hora = horaCorta(dueTime)
  const instante = dueDate && hora ? instanteEnEspana(dueDate, hora) : null
  if (instante == null) return null
  const ve = partesEnZona(instante, ZONA_VENEZUELA)
  const dias = Math.round((Date.parse(ve.fecha) - Date.parse(dueDate!.slice(0, 10))) / 86_400_000)
  return { hora: ve.hora, dias }
}

/** «04:30 VE», y «20:00 VE (día anterior)» si cae otro día. */
export function textoVenezuela(ve: { hora: string; dias: number }): string {
  const dia = ve.dias < 0 ? ' (día anterior)' : ve.dias > 0 ? ' (día siguiente)' : ''
  return `${ve.hora} VE${dia}`
}

export type OpcionDeHora = { value: string; venezuela: string; dias: number }

/** Primera y última hora del desplegable, en España (17/10/2026, por pedido). */
const PRIMERA_HORA = 7
const ULTIMA_HORA = 23

/** Las horas del desplegable, como en Google Calendar: de 15 en 15, de 07:00 a 23:00 de España,
 *  cada una con su hora en Venezuela. Va por día porque el desfase cambia con el horario de verano
 *  de España. */
export function opcionesDeHora(dueDate: string): OpcionDeHora[] {
  return Array.from({ length: (ULTIMA_HORA - PRIMERA_HORA) * 4 + 1 }, (_, i) => {
    const value = `${String(PRIMERA_HORA + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`
    const ve = horaEnVenezuela(dueDate, value)!
    return { value, venezuela: ve.hora, dias: ve.dias }
  })
}

/** Las del desplegable más la escrita a mano, si no está entre ellas, en su lugar por orden: así el
 *  desplegable la muestra elegida. */
export function opcionesConLaEscrita(dueDate: string, escrita: string | null | undefined): OpcionDeHora[] {
  const opciones = opcionesDeHora(dueDate)
  const hora = horaCorta(escrita)
  const ve = hora ? horaEnVenezuela(dueDate, hora) : null
  if (!hora || !ve || opciones.some(o => o.value === hora)) return opciones
  return [...opciones, { value: hora, venezuela: ve.hora, dias: ve.dias }].sort((a, b) => a.value.localeCompare(b.value))
}

/** «Hoy» → «Hoy 10:30 (04:30 VE)». Sin hora, el rótulo del día tal cual. */
export function rotuloConHora(rotuloDelDia: string, dueDate: string | null | undefined, dueTime: string | null | undefined): string {
  const hora = horaCorta(dueTime)
  if (!hora) return rotuloDelDia
  const ve = horaEnVenezuela(dueDate, hora)
  return ve ? `${rotuloDelDia} ${hora} (${textoVenezuela(ve)})` : `${rotuloDelDia} ${hora}`
}

/** El instante de la tarea: día + hora de reloj en España, sea cual sea la zona del navegador.
 *  Nunca `new Date('…')`, que leería UTC. */
export function momentoDeLaTarea(dueDate: string | null | undefined, dueTime: string | null | undefined): Date | null {
  const hora = horaCorta(dueTime)
  if (!dueDate || !hora) return null
  const instante = instanteEnEspana(dueDate, hora)
  return instante == null ? null : new Date(instante)
}

/** La marca de «ya sonó». Lleva el día y la hora además del id: reagendar la tarea es otra
 *  alarma, y tiene que volver a sonar. */
export function claveDeAlarma(t: Pick<TareaConAlarma, 'id' | 'due_date' | 'due_time'>): string {
  return `${t.id}@${(t.due_date ?? '').slice(0, 10)}T${horaCorta(t.due_time) ?? ''}`
}

/** Las que tienen que sonar ahora: pendientes, con hora, ya dentro de los 5 minutos previos (o
 *  pasadas, si el tic llegó tarde) pero no más viejas que la vigencia, y que no sonaron. En orden
 *  de hora. */
export function alarmasParaDisparar<T extends TareaConAlarma>(tareas: readonly T[], ahora: Date, yaAvisadas: ReadonlySet<string>): T[] {
  const ms = ahora.getTime()
  return tareas
    .map(t => ({ t, momento: t.completed || t.deleted_at != null ? null : momentoDeLaTarea(t.due_date, t.due_time) }))
    .filter((x): x is { t: T; momento: Date } => x.momento != null
      && ms >= x.momento.getTime() - MINUTOS_DE_AVISO * 60_000
      && ms <= x.momento.getTime() + MINUTOS_DE_VIGENCIA * 60_000
      && !yaAvisadas.has(claveDeAlarma(x.t)))
    .sort((x, y) => x.momento.getTime() - y.momento.getTime())
    .map(x => x.t)
}

/** Lo guardado sin las marcas de hace más de dos días ni las que no se entienden. */
export function podarAvisadas(claves: readonly string[], ahora: Date): string[] {
  const corte = ahora.getTime() - DIAS_DE_MEMORIA * 24 * 60 * 60_000
  return claves.filter(c => {
    const m = /@(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(c)
    const momento = m ? momentoDeLaTarea(m[1], m[2]) : null
    return momento != null && momento.getTime() >= corte
  })
}
