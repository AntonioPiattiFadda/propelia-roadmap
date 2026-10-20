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
  /** Prefijo de todo lo de `crm_emails`: el realtime invalida esto. */
  emails: ['crm', 'emails'] as const,
  /** Los emails que no llegaron (campana de la cabecera y cartel del lead). */
  emailsQueNoLlegaron: ['crm', 'emails', 'no-llegaron'] as const,
  /** El estado de un envío recién hecho, por el id de Resend (la pastilla del pie del mail). */
  envio: (resendId: string) => ['crm', 'emails', 'envio', resendId] as const,
  /** Prefijo del contador de llamadas del día. */
  llamadas: ['crm', 'llamadas'] as const,
  /** Las llamadas de `autor` desde el día `desde` (incluido) hasta `hasta` (excluido). */
  llamadasEntre: (autor: string, desde: string, hasta: string) => ['crm', 'llamadas', autor, desde, hasta] as const,
}
