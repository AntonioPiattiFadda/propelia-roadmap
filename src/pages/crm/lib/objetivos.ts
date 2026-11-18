import { shiftIsoDate, startOfWeekIso, toIsoDate } from '@/lib/calendarDate'
import { bolsasDeLlamada, leerMetaDeActividad } from './actividad'
import { esPendienteAgendar } from './leadFilters'
import { estaVencida } from './tareas'
import type { CrmLeadRow, CrmStage, CrmTask } from '../types'

/* Los números de «Objetivos»: las bolsas de llamadas, los decisores nuevos, los mails de
   presentación y las demos que agendé. Cada uno además dice QUÉ leads son, para que tocar el número
   filtre la lista (`?objetivo=`). Los números cuentan llamadas, mails y demos —tres llamadas al
   mismo lead son tres—; el filtro, leads. */
export const OBJETIVOS = [
  'contestadas', 'decisores', 'decisoresNuevos', 'noRespondidas', 'presentaciones', 'nombresDecisor', 'telefonosDecisor', 'horariosDecisor', 'demos',
] as const
export type Objetivo = typeof OBJETIVOS[number]

/** «Nutrición de la cuenta» (18/11/2026, por pedido): lo que se consiguió de la cuenta además de
 *  hablar. Es un grupo y no un objetivo: suma, pero no filtra (filtra cada uno de los suyos). El
 *  horario en que se encuentra al decisor entró el mismo día, por pedido. */
export const NUTRICION_DE_LA_CUENTA = ['presentaciones', 'nombresDecisor', 'telefonosDecisor', 'horariosDecisor'] as const satisfies readonly Objetivo[]

export function nutricionDeLaCuenta(resumen: Record<Objetivo, number>): number {
  return NUTRICION_DE_LA_CUENTA.reduce((s, k) => s + resumen[k], 0)
}

/** Lo que una llamada o nota (no la demo) dejó apuntado del decisor (18/11/2026): nombre, teléfono y/o horario. */
function decisorConseguido(guardado: string | null): Objetivo[] {
  const m = leerMetaDeActividad(guardado)
  if (m?.tipo !== 'llamada' && m?.tipo !== 'nota') return []
  return [
    ...(m.decisorApuntado?.trim() ? ['nombresDecisor' as const] : []),
    ...(m.telefonoDecisor?.trim() ? ['telefonosDecisor' as const] : []),
    ...(m.horarioDecisor?.trim() ? ['horariosDecisor' as const] : []),
  ]
}

export type ObjetivosDelPeriodo = {
  resumen: Record<Objetivo, number>
  leads: Record<Objetivo, ReadonlySet<string>>
}

/** Un valor desconocido en la URL es «sin filtro»: un enlace roto no deja la lista vacía. */
export function esObjetivo(v: string | null | undefined): v is Objetivo {
  return (OBJETIVOS as readonly string[]).includes(v ?? '')
}

type Llamada = { lead_id: string | null; created_at: string; long_description: string | null }

const nombreComparable = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

/** Una contestada con decisor de la que se sabe con quién se habló (`con`, puede ir vacío). */
function conDecisor(c: Llamada): string[] | null {
  const m = leerMetaDeActividad(c.long_description)
  return m?.tipo === 'llamada' && m.resultado === 'contestada' && m.decisor ? m.con : null
}

/** Decisor nuevo (4/11/2026, por pedido): la contestada con decisor en la que se habló con alguien
 *  que decide y con quien nadie había hablado antes en ese lead, lo haya llamado quien sea. Se
 *  compara por nombre (es lo que guarda la llamada). Sin saber con quién, cuenta solo si el lead
 *  nunca había tenido una llamada con decisor. */
function esDecisorNuevo(c: Llamada, previas: readonly Llamada[]): boolean {
  const con = conDecisor(c)
  if (!con || !c.lead_id) return false
  const antes = previas.filter(p => p.lead_id === c.lead_id && p.created_at < c.created_at).map(conDecisor).filter(x => x !== null)
  if (con.length === 0) return antes.length === 0
  const conocidos = new Set(antes.flat().map(nombreComparable))
  return con.some(n => !conocidos.has(nombreComparable(n)))
}

export function objetivosDe(
  llamadas: readonly Llamada[],
  demos: readonly { lead_id: string | null }[],
  extra: {
    /** Los mails «Presentación con vídeo» que mandé en el período. */
    presentaciones?: readonly { lead_id: string | null }[]
    /** Todas las llamadas (de cualquiera) de los leads con decisor, hasta el fin del período. */
    historial?: readonly Llamada[]
  } = {},
): ObjetivosDelPeriodo {
  const resumen = Object.fromEntries(OBJETIVOS.map(k => [k, 0])) as Record<Objetivo, number>
  const leads = Object.fromEntries(OBJETIVOS.map(k => [k, new Set<string>()])) as Record<Objetivo, Set<string>>
  const sumar = (k: Objetivo, leadId: string | null) => {
    resumen[k]++
    if (leadId) leads[k].add(leadId)
  }
  // Las mías del período también son historial: la segunda llamada de la semana con el mismo
  // decisor ya no es nueva.
  const previas = [...(extra.historial ?? []), ...llamadas]
  for (const c of llamadas) {
    for (const k of bolsasDeLlamada(c.long_description)) sumar(k, c.lead_id)
    if (esDecisorNuevo(c, previas)) sumar('decisoresNuevos', c.lead_id)
    for (const k of decisorConseguido(c.long_description)) sumar(k, c.lead_id)
  }
  for (const m of extra.presentaciones ?? []) sumar('presentaciones', m.lead_id)
  for (const d of demos) sumar('demos', d.lead_id)
  return { resumen, leads }
}

/** Los leads de un período que tienen alguna contestada con decisor: de esos hace falta el historial. */
export function leadsConDecisor(llamadas: readonly Llamada[]): string[] {
  return [...new Set(llamadas.filter(c => c.lead_id && conDecisor(c)).map(c => c.lead_id!))]
}

/** Lo que una persona tiene pendiente AHORA, no en un período: sus tareas vencidas (la de hoy no
 *  cuenta, como el subchip «Vencidas») y los leads de su cartera que están en una etapa de
 *  «Seguimiento» sin una tarea suya pendiente (la regla de «Pendiente agendar tarea»). */
export function pendientesDePersona(
  personaId: string,
  leads: readonly CrmLeadRow[],
  tareas: readonly CrmTask[],
  etapas: ReadonlyMap<string, CrmStage>,
  hoy: string,
): { vencidas: number; sinTarea: number } {
  const suyas = tareas.filter(t => t.assigned_to === personaId)
  const leadIdsConTareasMias = new Set(suyas.filter(t => !t.completed && t.deleted_at == null && t.lead_id).map(t => t.lead_id!))
  return {
    vencidas: suyas.filter(t => estaVencida(t, hoy)).length,
    sinTarea: leads.filter(l => l.assigned_to === personaId && esPendienteAgendar(l, { etapas, leadIdsConTareasMias })).length,
  }
}

/** Un tramo de días para pedir objetivos: [desde, hasta), los dos 'YYYY-MM-DD' locales. */
export type PeriodoDeObjetivos = { desde: string; hasta: string; label: string }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function diaCorto(iso: string, anioDeHoy: string): string {
  const [y, m, d] = iso.split('-')
  const dia = `${Number(d)} ${MESES[Number(m) - 1]}`
  return y === anioDeHoy ? dia : `${dia} ${y.slice(2)}`
}

/** `n` semanas de lunes a domingo hacia atrás, saltando las `saltar` más nuevas; la más nueva
 *  primera. La semana en curso termina mañana y no el lunes que viene: es la misma consulta que el
 *  contador de la cabecera y sale de su caché. */
export function semanasHaciaAtras(hoy: string, n: number, saltar = 0): PeriodoDeObjetivos[] {
  const lunes = startOfWeekIso(hoy)
  const manana = shiftIsoDate(hoy, 1)
  return Array.from({ length: n }, (_, i) => {
    const atras = saltar + i
    const desde = shiftIsoDate(lunes, -7 * atras)
    const siguiente = shiftIsoDate(desde, 7)
    const label = atras === 0 ? 'Esta semana'
      : atras === 1 ? 'Semana pasada'
      : `${diaCorto(desde, hoy.slice(0, 4))} – ${diaCorto(shiftIsoDate(desde, 6), hoy.slice(0, 4))}`
    return { desde, hasta: siguiente < manana ? siguiente : manana, label }
  })
}

const DIAS_DE_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** `n` días hacia atrás, saltando los `saltar` más nuevos; el más nuevo primero. Cada uno va de
 *  su medianoche a la siguiente (16/11/2026: el diálogo compara varios días). */
export function diasHaciaAtras(hoy: string, n: number, saltar = 0): PeriodoDeObjetivos[] {
  return Array.from({ length: n }, (_, i) => {
    const atras = saltar + i
    const desde = shiftIsoDate(hoy, -atras)
    const [y, m, d] = desde.split('-').map(Number)
    const label = atras === 0 ? 'Hoy' : atras === 1 ? 'Ayer'
      : `${DIAS_DE_SEMANA[new Date(y, m - 1, d).getDay()]} ${diaCorto(desde, hoy.slice(0, 4))}`
    return { desde, hasta: shiftIsoDate(desde, 1), label }
  })
}

/** El día que muestra «Objetivos de hoy» (18/11/2026, por pedido: las flechas del contador van a
 *  días anteriores, `?objetivosDia=`). Sin pedir, uno roto o uno del futuro es hoy. */
export function diaDeObjetivos(pedido: string | null | undefined, hoy: string): string {
  if (!pedido || !/^\d{4}-\d{2}-\d{2}$/.test(pedido)) return hoy
  // Un 31 de febrero no existe: correrlo cero días lo devuelve en marzo.
  if (shiftIsoDate(pedido, 0) !== pedido) return hoy
  return pedido > hoy ? hoy : pedido
}

/** El título del contador para `dia`: «Objetivos de hoy», «… de ayer» o «… del lun 16/11». */
export function tituloDeObjetivos(dia: string, hoy: string): string {
  if (dia === hoy) return 'Objetivos de hoy'
  if (dia === shiftIsoDate(hoy, -1)) return 'Objetivos de ayer'
  const [y, m, d] = dia.split('-').map(Number)
  return `Objetivos del ${DIAS_DE_SEMANA[new Date(y, m - 1, d).getDay()]} ${d}/${m}`
}

/** `n` meses hacia atrás, saltando los `saltar` más nuevos; el más nuevo primero. El mes en curso
 *  termina mañana, como la semana en curso. */
export function mesesHaciaAtras(hoy: string, n: number, saltar = 0): PeriodoDeObjetivos[] {
  const [y0, m0] = hoy.split('-').map(Number)
  const iso = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`
  const manana = shiftIsoDate(hoy, 1)
  return Array.from({ length: n }, (_, i) => {
    const atras = saltar + i
    const total = y0 * 12 + (m0 - 1) - atras
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    const siguiente = iso(Math.floor((total + 1) / 12), ((total + 1) % 12) + 1)
    const label = atras === 0 ? 'Este mes'
      : `${MESES_LARGOS[m - 1]}${y === y0 ? '' : ` ${String(y).slice(2)}`}`
    return { desde: iso(y, m), hasta: siguiente < manana ? siguiente : manana, label }
  })
}

/** El total de varias personas en un mismo período. */
export function sumarResumenes(resumenes: readonly Record<Objetivo, number>[]): Record<Objetivo, number> {
  const total = Object.fromEntries(OBJETIVOS.map(k => [k, 0])) as Record<Objetivo, number>
  for (const r of resumenes) for (const k of OBJETIVOS) total[k] += r[k]
  return total
}

/**
 * Decisores por contactado (5/11/2026, por pedido): de las inmobiliarias que contestaron una
 * llamada en el período, en cuántas se habló con alguien que decide. Cuenta inmobiliarias y no
 * llamadas (dos llamadas al mismo lead son una), y con varias personas la misma inmobiliaria
 * cuenta una vez. Sin contestadas no hay tasa.
 */
export function tasaDeDecisor(periodos: readonly Pick<ObjetivosDelPeriodo, 'leads'>[]): { contestadas: number; conDecisor: number; tasa: number | null } {
  const contestadas = new Set(periodos.flatMap(p => [...p.leads.contestadas]))
  const conDecisor = new Set(periodos.flatMap(p => [...p.leads.decisores]))
  return { contestadas: contestadas.size, conDecisor: conDecisor.size, tasa: contestadas.size ? conDecisor.size / contestadas.size : null }
}

/** Estadísticamente, cada tantas llamadas contestadas sale una demo agendada (16/11/2026; 70 y
 *  solo contestadas desde el 17/11/2026, por pedido). */
export const LLAMADAS_POR_DEMO = 70

export type TonoDeProgreso = 'rojo' | 'amarillo' | 'verde'

export type HaciaLaProximaDemo = {
  contestadas: number
  /** Cuándo se agendó la última demo (`created_at`); null si nunca agendó una. */
  desde: string | null
  /** Las contestadas acumuladas, por día local, del más viejo al más nuevo. */
  porDia: { dia: string; n: number }[]
}

/**
 * Las llamadas contestadas hechas después de la última demo agendada (`ultima`, su `created_at`):
 * agendar una demo vuelve el contador «Hacia la próxima demo» a cero (16/11/2026, por pedido).
 * Sin demo, cuentan todas. Desde el 17/11/2026 (por pedido) la no respondida no suma, y se
 * reparten por día para mostrar de cuándo son.
 */
export function llamadasDesdeLaUltimaDemo(llamadas: readonly Llamada[], ultima: string | null): HaciaLaProximaDemo {
  const porDia = new Map<string, number>()
  for (const c of llamadas) {
    if (ultima !== null && new Date(c.created_at) <= new Date(ultima)) continue
    if (!bolsasDeLlamada(c.long_description).includes('contestadas')) continue
    const dia = toIsoDate(new Date(c.created_at))
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }
  const dias = [...porDia].map(([dia, n]) => ({ dia, n })).sort((a, b) => a.dia.localeCompare(b.dia))
  return { contestadas: dias.reduce((s, d) => s + d.n, 0), desde: ultima, porDia: dias }
}

/**
 * Cuánto falta para la próxima demo «estadística» (16/11/2026, por pedido), a partir de las
 * llamadas desde la última demo. Rojo sutil hasta la mitad, amarillo después y verde en el último
 * tramo (desde el 90 %). Pasado `LLAMADAS_POR_DEMO` sin demo la barra se queda llena y cuenta las
 * de más: vuelve a cero solo cuando se agenda una.
 */
export function progresoHaciaDemo(llamadas: number): { enCiclo: number; faltan: number; deMas: number; fraccion: number; tono: TonoDeProgreso } {
  const n = Math.max(0, Math.floor(llamadas))
  const enCiclo = Math.min(n, LLAMADAS_POR_DEMO)
  const fraccion = enCiclo / LLAMADAS_POR_DEMO
  const tono: TonoDeProgreso = fraccion >= 0.9 ? 'verde' : fraccion >= 0.5 ? 'amarillo' : 'rojo'
  return { enCiclo, faltan: LLAMADAS_POR_DEMO - enCiclo, deMas: n - enCiclo, fraccion, tono }
}
