/**
 * El aviso de demo nueva a los SUPERADMIN (20/10/2026, por pedido). La marca es por navegador
 * (`localStorage`): el `created_at` más nuevo que ya se miró. Avisa lo que se agendó después de
 * esa marca y que no agendaste vos (lo tuyo no es novedad tuya). Sin marca —primera vez en este
 * navegador— no avisa nada y la pone: si no, el primer día sonarían todas las demos de la historia.
 * Una demo agendada con la app cerrada avisa al volver a abrirla, porque la marca quedó atrás.
 */
export function demosParaAvisar<T extends { created_at: string; created_by: string | null }>(
  demos: T[], marca: string | null, yo: string | null, ahora: Date,
): { nuevas: T[]; marca: string } {
  const masNueva = demos.reduce((m, d) => (d.created_at > m ? d.created_at : m), '')
  if (!marca) return { nuevas: [], marca: masNueva || ahora.toISOString() }
  const nuevas = demos
    .filter(d => d.created_at > marca && d.created_by !== yo)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { nuevas, marca: masNueva > marca ? masNueva : marca }
}
