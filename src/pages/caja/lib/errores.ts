/* Lo que la base contesta, dicho en castellano (mismo molde que crm/lib/errores.ts: el código y
   el nombre de la restricción vienen en `code` y `message` del error de PostgREST). */

export const SIN_PERMISO = 'No tenés permiso para hacer eso.'

export function mensajeDeError(error: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  const e = (error ?? {}) as { message?: unknown; code?: unknown }
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  if (code === '23505' || message.includes('duplicate key')) {
    if (message.includes('expense_presets_name_key')) return 'Ya existe una etiqueta con ese nombre.'
    if (message.includes('expenses_preset_period_key')) return 'Ese mes ya está pagado.'
  }
  // 23514 es check_violation; se mira el nombre para no tapar otro check con este texto.
  if (message.includes('expenses_fixed_paid_check')) {
    return 'Un gasto fijo se carga siempre como pagado: lo pendiente es el mes que todavía no tiene su gasto.'
  }
  if (message.includes('expenses_paid_by_check') || message === 'caja_sin_pagador') return 'Elegí quién lo pagó.'
  if (message === 'caja_sin_fila' || code === '42501' || /row-level security/i.test(message)) return SIN_PERMISO
  if (error instanceof TypeError || /Failed to fetch|NetworkError|fetch failed/i.test(message)) {
    return 'No hay conexión. Probá de nuevo.'
  }
  return porDefecto
}
