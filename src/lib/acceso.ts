export type Acceso = 'cargando' | 'error' | 'sin-acceso' | 'ok'

type EstadoYo = {
  cargando: boolean
  error: unknown
  fila: { activo: boolean } | null | undefined
}

/* La misma regla que `es_usuario()` en la base: fila activa en `users` o no pasás. Así la
   pantalla y la RLS dicen lo mismo; sin esto, alguien sin fila vería un tablero vacío sin
   saber por qué.

   El orden importa. Primero la fila: si ya la tenemos, un refresco que falla o que está en
   curso no te saca — un corte de red no puede taparte la pantalla con «sin acceso» (el
   tablero vanilla tuvo ese bug). Después, cargando y error, y recién con la consulta
   terminada sin fila es «sin acceso» de verdad: la RLS no devuelve la fila de un inactivo
   ni la de quien no tiene fila. */
export function accesoDe({ cargando, error, fila }: EstadoYo): Acceso {
  if (fila) return fila.activo ? 'ok' : 'sin-acceso'
  if (cargando) return 'cargando'
  if (error) return 'error'
  return 'sin-acceso'
}
