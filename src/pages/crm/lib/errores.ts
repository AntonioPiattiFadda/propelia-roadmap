/* Lo que la base contesta, dicho en castellano. El error crudo de Postgres no le sirve a nadie
   y a veces miente («violates row-level security» se lee como un bug y es un permiso). */

export const SIN_PERMISO = 'No tenés permiso sobre esa cartera.'

/* Una columna que el front ya conoce y la base todavía no (PGRST204 la contesta PostgREST desde su
   caché de esquema; 42703 es Postgres). Pasa con los datos de la inmobiliaria mientras no se corra
   su `alter table` de supabase/schema.sql: no es un error de quien escribe. */
export const FALTA_MIGRACION = 'Falta correr la migración de la base para guardar este dato.'

// Las claves de crm_create_lead_with_client (supabase/schema.sql) y la de `unaFila()` del servicio.
const CLAVES: Record<string, string> = {
  crm_sin_acceso: 'Tu cuenta no tiene acceso al CRM.',
  crm_sin_permiso_cartera: SIN_PERMISO,
  crm_falta_contacto: 'Falta teléfono o email.',
  crm_responsable_inactivo: 'Ese responsable ya no está activo.',
  crm_canal_invalido: 'Ese canal ya no existe. Recargá la página.',
  crm_etapa_invalida: 'Ese estado ya no existe. Recargá la página.',
  crm_lead_duplicado: 'Ese cliente ya tiene un lead: una inmobiliaria no se repite.',
  crm_sin_fila: SIN_PERMISO,
  // Las de crm_importar_lote.
  crm_lote_vacio: 'El archivo no tiene filas para importar.',
  crm_lote_grande: 'El archivo tiene demasiadas filas: partilo en lotes más chicos.',
  // Las de crm_dar_de_baja_miembro.
  crm_baja_solo_superadmin: 'Solo un superadmin puede dar de baja a alguien.',
  crm_baja_propia: 'No podés darte de baja a vos mismo.',
  crm_baja_ya_inactivo: 'Esa persona ya estaba dada de baja.',
  crm_baja_sucesor_invalido: 'Elegí a otra persona para quedarse con lo suyo.',
  crm_baja_falta_sucesor: 'Tiene cosas en curso: elegí quién se queda con ellas.',
}

export function mensajeDeError(error: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  const e = (error ?? {}) as { message?: unknown; code?: unknown }
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  for (const [clave, texto] of Object.entries(CLAVES)) if (message.includes(clave)) return texto
  if (code === 'PGRST204' || code === '42703') return FALTA_MIGRACION
  if (code === '42501' || /row-level security/i.test(message)) return SIN_PERMISO
  if (code === '23505') {
    if (message.includes('crm_clients_phone')) return 'Ya hay otro cliente con ese teléfono.'
    if (message.includes('crm_clients_email')) return 'Ya hay otro cliente con ese email.'
    if (message.includes('crm_clients_idealista_url')) return 'Ya hay otra inmobiliaria con esa ficha de Idealista.'
    return 'Ese cliente ya tiene un lead: una inmobiliaria no se repite.'
  }
  if (error instanceof TypeError || /Failed to fetch|NetworkError|fetch failed/i.test(message)) {
    return 'No hay conexión. Probá de nuevo.'
  }
  return porDefecto
}
