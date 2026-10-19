/* Reactivar a un miembro dado de baja, sin Supabase adentro: quien llama, validar, cambiar la
   contraseña si se pidió y recién ahí `activo = true`. Es la vuelta de `crm_dar_de_baja_miembro`
   pero solo en `users`: lo que la baja le pasó al sucesor (leads, tareas, reuniones, roadmap) se
   queda donde está, y los permisos de `crm_data_access` se dan de nuevo desde Visibilidad. La
   cuenta de auth nunca se tocó con la baja, así que sin contraseña nueva entra con la de siempre.
   La I/O entra por `ReactivarMiembroDb` para testearla. */

export type ReactivarMiembroInput = { userId: string; password?: string | null }

export type ReactivarMiembroDb = {
  quienLlama(id: string): Promise<{ rol: string; activo: boolean } | null>
  miembro(id: string): Promise<{ activo: boolean } | null>
  cambiarPassword(id: string, password: string): Promise<{ error?: string }>
  activar(id: string): Promise<{ error?: string }>
}

export type ReactivarMiembroResult = { ok: true } | { ok: false; status: number; error: string }

const falla = (status: number, error: string): ReactivarMiembroResult => ({ ok: false, status, error })

export async function reactivarMiembro(callerId: string, input: ReactivarMiembroInput, db: ReactivarMiembroDb): Promise<ReactivarMiembroResult> {
  // La misma regla que `es_superadmin()`: rol y fila activa.
  const yo = await db.quienLlama(callerId)
  if (!yo || !yo.activo || yo.rol !== 'SUPERADMIN') return falla(403, 'No autorizado')

  if (!input.userId) return falla(400, 'Falta a quién reactivar')
  // Vacío es «dejarle la que tenía», no una contraseña en blanco.
  const password = input.password ?? ''
  if (password && password.length < 6) return falla(400, 'La contraseña tiene que tener al menos 6 caracteres')

  const fila = await db.miembro(input.userId)
  if (!fila) return falla(404, 'No existe ese miembro')
  if (fila.activo) return falla(400, 'Esa persona ya está activa')

  // La contraseña antes: si falla, la cuenta queda como estaba y no entra con una vieja que
  // quien la reactivó creía cambiada.
  if (password) {
    const r = await db.cambiarPassword(input.userId, password)
    if (r.error) return falla(400, `No se pudo cambiar la contraseña: ${r.error}`)
  }
  const r = await db.activar(input.userId)
  if (r.error) return falla(500, `No se pudo reactivar: ${r.error}`)
  return { ok: true }
}
