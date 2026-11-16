/* Propelin festeja cada 10 llamadas (16/11/2026, por pedido): sobre la barra «Hacia la próxima
   demo» aparece el robot con un mensaje para seguir. Cuenta las mismas llamadas que la barra
   (desde la última demo agendada hoy). */

export const CADA_LLAMADAS = 10

/** El múltiplo de 10 que se acaba de cruzar, o null. Lo primero que se ve (`antes` undefined) no
 *  es un hito: abrir la pantalla con 30 llamadas no festeja. Bajar tampoco (se agendó una demo). */
export function hitoAlcanzado(antes: number | undefined, ahora: number | undefined): number | null {
  if (antes === undefined || ahora === undefined || ahora <= antes) return null
  const hito = Math.floor(ahora / CADA_LLAMADAS) * CADA_LLAMADAS
  return hito > 0 && hito > antes ? hito : null
}

/** `{n}`: las llamadas del hito; `{faltan}`: las que faltan para la próxima demo. */
export const MENSAJES_DE_PROPELIN = [
  '¡{n} llamadas! Seguí así, que la demo está cada vez más cerca.',
  '¡Vamos! Ya van {n}. Faltan {faltan} para la próxima demo.',
  '{n} llamadas y contando. ¡Este ritmo es de campeón!',
  '¡Qué máquina! {n} llamadas. La próxima puede ser la del sí.',
  'Cada llamada suma. Llevás {n}, ¡no aflojes!',
  '¡{n}! Cada «no» te acerca al próximo «sí».',
  '¡Bien ahí! {n} llamadas. Quedan {faltan} para la demo.',
  'Persistencia pura: {n} llamadas. ¡Seguimos!',
  '¡Otro diez! Ya son {n}. El que insiste, agenda.',
  '{n} llamadas. Respirá, tomá agua y ¡a por la siguiente!',
  '¡Estás on fire! {n} llamadas y la demo a {faltan}.',
  'Diez más al bolsillo: {n}. ¡Así se construye el pipeline!',
]

/** Un mensaje al azar, distinto del `anterior` si se pasa. `azar` es Math.random (inyectable). */
export function mensajeDePropelin(n: number, faltan: number, azar: () => number = Math.random, anterior?: string): string {
  const armar = (i: number) => MENSAJES_DE_PROPELIN[i].replaceAll('{n}', String(n)).replaceAll('{faltan}', String(faltan))
  const total = MENSAJES_DE_PROPELIN.length
  let i = Math.min(total - 1, Math.floor(azar() * total))
  if (anterior !== undefined && armar(i) === anterior) i = (i + 1) % total
  return armar(i)
}
