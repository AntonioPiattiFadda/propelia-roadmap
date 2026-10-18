/* Cómo se gestiona una etapa del funnel (`crm_funnel_stages.management_type`). Los valores son los
   del `check` de la base: si se agrega uno, va en los dos lados. Null = sin clasificar. */
export const GESTIONES_DE_ETAPA = [
  { value: 'sin_contactar', label: 'Gestión sin contactar' },
  { value: 'por_tarea', label: 'Gestión por tarea' },
] as const

export type GestionDeEtapa = (typeof GESTIONES_DE_ETAPA)[number]['value']

/** Lo guardado en la base, leído estricto: lo que no sea un valor conocido es «sin clasificar». */
export function gestionDeEtapa(valor: string | null | undefined): GestionDeEtapa | null {
  return GESTIONES_DE_ETAPA.find(g => g.value === valor)?.value ?? null
}
