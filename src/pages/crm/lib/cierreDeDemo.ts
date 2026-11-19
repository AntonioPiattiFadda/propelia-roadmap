import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { HORA_DE_CONFIRMAR, type TareaDeConfirmacion } from './confirmacionDeDemo'

/* Las tareas para cerrar la venta después de una demo (18/11/2026, por pedido): se crean al agendarla,
   junto con las de confirmar. Cuentan desde el día de la demo en hora de España y llevan hora para
   que suene la alarma. Desde el 19/11/2026 (por pedido) vencen a los 3 y 7 días y son siempre de
   Lorenzo (`RESPONSABLE_DEL_CIERRE`), no de quien agenda: el cierre lo hace él. */

/** Días después de la demo para «Cerrar venta». */
export const DIAS_PARA_CERRAR = 3
/** Días después de la demo para cerrarla con promoción. */
export const DIAS_PARA_PROMOCION = 7
/** Quien cierra las ventas: las dos tareas van siempre a su cuenta. */
export const RESPONSABLE_DEL_CIERRE = 'lorenzopiattifadda@gmail.com'

/** Un `YYYY-MM-DD` corrido `dias`, sin pasar por la zona del navegador. */
function sumarDias(ymd: string, dias: number): string {
  const [a, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

export function tareasDeCierreDeDemo(startsAt: Date | string): TareaDeConfirmacion[] {
  const { ymd } = relojDeEspana(startsAt)
  return [
    { title: 'Cerrar venta', due_date: sumarDias(ymd, DIAS_PARA_CERRAR), due_time: HORA_DE_CONFIRMAR },
    { title: 'Cerrar venta con promoción (descuento)', due_date: sumarDias(ymd, DIAS_PARA_PROMOCION), due_time: HORA_DE_CONFIRMAR },
  ]
}

/** El id de la cuenta activa de `RESPONSABLE_DEL_CIERRE`, o null si no está. */
export function responsableDelCierre(usuarios: { id: string; email: string | null; activo: boolean }[]): string | null {
  return usuarios.find(u => u.activo && u.email?.trim().toLowerCase() === RESPONSABLE_DEL_CIERRE)?.id ?? null
}
