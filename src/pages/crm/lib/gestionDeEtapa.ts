/* Cómo se gestiona una etapa del funnel (`crm_funnel_stages.management_type`). Los valores son los
   del `check` de la base: si se agrega uno, va en los dos lados. Null = sin clasificar.
   Desde el 20/10/2026 se rotulan «Primer contacto» y «Seguimiento»: cambió el nombre, no el valor. */
export const GESTIONES_DE_ETAPA = [
  { value: 'sin_contactar', label: 'Primer contacto' },
  { value: 'por_tarea', label: 'Seguimiento' },
] as const

export type GestionDeEtapa = (typeof GESTIONES_DE_ETAPA)[number]['value']

/** Lo guardado en la base, leído estricto: lo que no sea un valor conocido es «sin clasificar». */
export function gestionDeEtapa(valor: string | null | undefined): GestionDeEtapa | null {
  return GESTIONES_DE_ETAPA.find(g => g.value === valor)?.value ?? null
}

/** Si en la etapa se puede agendar una tarea (`crm_funnel_stages.allows_tasks`). Espejo del
    trigger `crm_tasks_etapa_permite` de la base, que es la regla de verdad. Sin etapa, sí. */
export function permiteAgendarTarea(etapa: { allows_tasks: boolean } | null | undefined): boolean {
  return etapa?.allows_tasks !== false
}

/** El tilde de un subgrupo en el filtro «Estado»: si ya están todas sus etapas, las saca; si falta
    alguna, las pone todas. Las de otros grupos no se tocan. */
export function alternarGrupo(elegidas: Set<string>, ids: string[]): Set<string> {
  const next = new Set(elegidas)
  const todas = ids.every(id => next.has(id))
  for (const id of ids) {
    if (todas) next.delete(id)
    else next.add(id)
  }
  return next
}

type EtapaAgrupable = { management_type: string | null; is_out_of_funnel: boolean }

/** Los subgrupos del menú de estados: uno por gestión, en el orden de `GESTIONES_DE_ETAPA`, y al
    final «Otros» con las sin clasificar y las fuera del funnel (Descartado). Dentro de cada grupo
    se respeta el orden de entrada; los grupos vacíos no se devuelven. */
export function etapasPorGestion<T extends EtapaAgrupable>(etapas: T[]): { label: string; etapas: T[] }[] {
  const grupos = GESTIONES_DE_ETAPA.map(g => ({
    label: g.label as string,
    etapas: etapas.filter(e => !e.is_out_of_funnel && gestionDeEtapa(e.management_type) === g.value),
  }))
  grupos.push({
    label: 'Otros',
    etapas: [
      ...etapas.filter(e => !e.is_out_of_funnel && gestionDeEtapa(e.management_type) === null),
      ...etapas.filter(e => e.is_out_of_funnel),
    ],
  })
  return grupos.filter(g => g.etapas.length > 0)
}
