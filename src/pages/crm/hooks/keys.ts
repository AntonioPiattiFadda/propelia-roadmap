/* Todas las keys del CRM bajo ['crm', …]: el realtime y las mutaciones invalidan por prefijo, y
   Equipo comparte la cache con el CRM (mismas keys = una sola request). */
export const CRM_KEYS = {
  leads: ['crm', 'leads'] as const,
  catalogos: ['crm', 'catalogos'] as const,
  usuarios: ['crm', 'usuarios'] as const,
  accesos: ['crm', 'accesos'] as const,
  tareasPendientes: ['crm', 'tareas-pendientes'] as const,
  /** Prefijo de todos los detalles abiertos. */
  detalles: ['crm', 'lead'] as const,
  detalle: (leadId: string) => ['crm', 'lead', leadId] as const,
  reuniones: (desde: string) => ['crm', 'reuniones', desde] as const,
}
