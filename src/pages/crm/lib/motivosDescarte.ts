/* Los motivos por los que se descarta un lead. `crm_leads.discard_reason` guarda el CÓDIGO; los
   descartes de antes de este catálogo guardan texto libre, y ese texto se sigue mostrando tal cual.
   Son dos grupos: lo que no va a calificar nunca y lo que hoy no califica pero puede hacerlo más
   adelante. A estos últimos se los vuelve a llamar: el descarte les pone `recontact_at` a seis meses
   y la lista los vuelve a mostrar cuando llega el día («Para recontactar»). */

export type GrupoDescarte = 'no_califica' | 'podria_calificar'

export const GRUPOS_DE_DESCARTE: readonly { id: GrupoDescarte; label: string; detalle: string | null }[] = [
  { id: 'no_califica', label: 'No califica ni calificará', detalle: null },
  { id: 'podria_calificar', label: 'No califica, pero podría calificar', detalle: 'Volvemos a llamarlo en 6 meses.' },
]

export const MOTIVOS_DE_DESCARTE = [
  { code: 'not_real_estate', label: 'No es inmobiliaria / rubro equivocado', grupo: 'no_califica' },
  { code: 'closed', label: 'Cerró o dejó de operar', grupo: 'no_califica' },
  { code: 'do_not_contact', label: 'Pidió que no lo contactemos más', grupo: 'no_califica' },
  { code: 'invalid_contact', label: 'Datos de contacto inválidos', grupo: 'no_califica' },
  { code: 'too_small', label: 'Muy chica hoy (poco volumen)', grupo: 'podria_calificar' },
  { code: 'has_tool', label: 'Ya tiene una herramienta y está conforme', grupo: 'podria_calificar' },
  { code: 'no_budget', label: 'Sin presupuesto ahora', grupo: 'podria_calificar' },
  { code: 'bad_timing', label: 'No es el momento (reestructuración, temporada)', grupo: 'podria_calificar' },
] as const satisfies readonly { code: string; label: string; grupo: GrupoDescarte }[]

export type MotivoDescarte = (typeof MOTIVOS_DE_DESCARTE)[number]['code']

const MESES_HASTA_RECONTACTO = 6

const motivoDe = (code: string | null | undefined) => MOTIVOS_DE_DESCARTE.find(m => m.code === code?.trim())

/** Lo que se muestra de un `discard_reason`: la etiqueta del código, o el texto libre viejo tal cual. */
export function etiquetaDeMotivo(stored: string | null | undefined): string | null {
  const limpio = stored?.trim()
  if (!limpio) return null
  return motivoDe(limpio)?.label ?? limpio
}

/** El grupo de un código. Un texto libre viejo no tiene grupo. */
export function grupoDeMotivo(stored: string | null | undefined) {
  const m = motivoDe(stored)
  return m ? GRUPOS_DE_DESCARTE.find(g => g.id === m.grupo) ?? null : null
}

/** `hoy` + 6 meses, como 'YYYY-MM-DD'. Si el día no existe en el mes de llegada (31/8 → febrero),
 *  cae en el último del mes en vez de desbordar al siguiente. Sin `new Date(str)`: ver calendarDate. */
export function fechaDeRecontacto(hoy: string): string {
  const [y, m, d] = hoy.slice(0, 10).split('-').map(Number)
  const total = (m - 1) + MESES_HASTA_RECONTACTO
  const anio = y + Math.floor(total / 12)
  const mes = total % 12 // 0-based
  const ultimo = new Date(anio, mes + 1, 0).getDate()
  const dia = Math.min(d, ultimo)
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Qué `recontact_at` lleva un descarte con este motivo: fecha solo si podría calificar. */
export function recontactoDeMotivo(code: string, hoy: string): string | null {
  return grupoDeMotivo(code)?.id === 'podria_calificar' ? fechaDeRecontacto(hoy) : null
}

/** Descartado y con la fecha de volver a llamar cumplida (hoy incluido). Las fechas se comparan
 *  como string: 'YYYY-MM-DD' ordena igual que el calendario. */
export function paraRecontactar(lead: { recontact_at: string | null }, descartado: boolean, hoy: string): boolean {
  return descartado && !!lead.recontact_at && lead.recontact_at.slice(0, 10) <= hoy
}

/** 'YYYY-MM-DD' como 'DD/MM/AAAA'. */
export function fmtFechaCompleta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
