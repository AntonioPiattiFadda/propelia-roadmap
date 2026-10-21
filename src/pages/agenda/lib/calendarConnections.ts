/**
 * ¿El usuario tiene algún calendario conectado? Agnóstico de proveedor a propósito: hoy sólo
 * existe Google, pero cuando se sume Microsoft (otra fila en `calendar_connections`) cuenta
 * igual sin tocar a quien pregunta.
 */
export function hasActiveCalendar(connections: { provider: string; status: string }[]): boolean {
  return connections.some((c) => c.status === 'active')
}
