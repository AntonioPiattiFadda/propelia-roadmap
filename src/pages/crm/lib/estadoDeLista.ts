export type EstadoLista = 'cargando' | 'error' | 'sin-leads' | 'sin-resultados' | 'ok'

/**
 * Qué dibuja la lista. `total` es cuántos leads hay en las carteras elegidas, `undefined` si la
 * consulta nunca trajo nada. El orden importa y es el de `accesoDe()`: primero los datos —si ya
 * los tenemos, un refresco que falla no los tapa—, después cargando y error, y recién con la
 * consulta terminada y vacía es «no hay leads». Un corte de red no puede decirle a nadie que su
 * cartera está vacía.
 */
export function estadoDeLista(e: { cargando: boolean; error: unknown; total: number | undefined; visibles: number }): EstadoLista {
  if (e.total !== undefined && e.total > 0) return e.visibles > 0 ? 'ok' : 'sin-resultados'
  if (e.total === undefined) return e.error && !e.cargando ? 'error' : 'cargando'
  return 'sin-leads'
}
