/* Lo que la base contesta, dicho en castellano. El error crudo de Postgres no le sirve a nadie
   y a veces miente («violates row-level security» se lee como un bug y es un permiso). */

export const SIN_PERMISO = 'No tenés permiso sobre esa cartera.'

// Las claves de crm_create_lead_with_client (supabase/schema.sql) y la de `unaFila()` del servicio.
const CLAVES: Record<string, string> = {
  crm_sin_acceso: 'Tu cuenta no tiene acceso al CRM.',
  crm_sin_permiso_cartera: SIN_PERMISO,
  crm_falta_contacto: 'Falta teléfono o email.',
  crm_responsable_inactivo: 'Ese responsable ya no está activo.',
  crm_canal_invalido: 'Ese canal ya no existe. Recargá la página.',
  crm_etapa_invalida: 'Esa etapa ya no existe. Recargá la página.',
  crm_lead_duplicado: 'Ese cliente ya tiene un lead con ese responsable.',
  crm_sin_fila: SIN_PERMISO,
}

export function mensajeDeError(error: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  const e = (error ?? {}) as { message?: unknown; code?: unknown }
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  for (const [clave, texto] of Object.entries(CLAVES)) if (message.includes(clave)) return texto
  if (code === '42501' || /row-level security/i.test(message)) return SIN_PERMISO
  if (code === '23505') {
    if (message.includes('crm_clients_phone')) return 'Ya hay otro cliente con ese teléfono.'
    if (message.includes('crm_clients_email')) return 'Ya hay otro cliente con ese email.'
    return 'Ese responsable ya tiene un lead de ese cliente.'
  }
  if (error instanceof TypeError || /Failed to fetch|NetworkError|fetch failed/i.test(message)) {
    return 'No hay conexión. Probá de nuevo.'
  }
  return porDefecto
}
