// Copiado tal cual de propelia-frontend (src/pages/leads/lib/calendarDeadline.ts).
// Math.ceil redondea la tolerancia hacia arriba a días completos (720h = 30 días exactos, pero
// cualquier resto suma un día). Reconstruimos la fecha por componentes (getFullYear/getMonth/getDate)
// en vez de sumar milisegundos crudos para que el propio motor de Date resuelva el corrimiento de
// mes/DST. "Local" es el timezone del proceso que corre el código — el navegador del viewer en
// producción, el TZ fijado en tests — así que el mismo lead puede mostrar "Gestionado" o "Pendiente"
// a viewers en distintos timezones cerca de un límite de medianoche.
export function calendarDeadline(referenceMs: number, toleranceHours: number): number {
  const toleranceDays = Math.ceil(toleranceHours / 24)
  const ref = new Date(referenceMs)
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + toleranceDays).getTime()
}
