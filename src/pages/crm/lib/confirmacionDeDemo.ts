import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { momentoDeLaTarea } from './alarmas'

/* Las tareas para confirmar una demo (4/11/2026, por pedido): que el cliente no falte. Al agendarla
   se le crean a quien agenda, con hora, así suena la alarma (`useAlarmasDeTareas`). Todo en hora de
   España: la demo se agenda en hora de allá y `crm_tasks.due_time` también lo es. */

/** A qué hora se confirma, en España. */
export const HORA_DE_CONFIRMAR = '10:00'
/** Una demo que arranca antes de esto (en minutos, hora de España) se confirma además el día
 *  anterior: a la mañana no da tiempo a confirmarla el mismo día. */
const ANTES_DE_LAS_11_30 = 11 * 60 + 30

export type TareaDeConfirmacion = { title: string; due_date: string; due_time: string }

/** El día anterior a un `YYYY-MM-DD`, sin pasar por la zona del navegador. */
function diaAnterior(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** Siempre una el día de la demo a las 10:00 (aunque esas 10:00 ya hayan pasado); si la demo
 *  arranca antes de las 11:30, otra el día anterior a las 10:00, salvo que ese momento ya haya
 *  pasado. La del día anterior va primero. */
export function tareasDeConfirmacionDeDemo(startsAt: Date | string, ahora: Date): TareaDeConfirmacion[] {
  const { ymd, hora, minutos } = relojDeEspana(startsAt)
  const tareas: TareaDeConfirmacion[] = []
  if (minutos < ANTES_DE_LAS_11_30) {
    const ayer = diaAnterior(ymd)
    const momento = momentoDeLaTarea(ayer, HORA_DE_CONFIRMAR)
    if (momento && momento.getTime() > ahora.getTime()) {
      tareas.push({ title: `Confirmar la demo de mañana a las ${hora}`, due_date: ayer, due_time: HORA_DE_CONFIRMAR })
    }
  }
  tareas.push({ title: `Confirmar la demo de hoy a las ${hora}`, due_date: ymd, due_time: HORA_DE_CONFIRMAR })
  return tareas
}
