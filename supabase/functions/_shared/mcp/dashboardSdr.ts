// El «Dashboard SDR» del CRM (src/pages/crm/lib/dashboardSdr.ts) para el conector. ESPEJO: las
// secciones Meta, Una demo, Períodos, Métricas y Second Chance son copia de allá; si cambia una
// regla allá, cambia acá (dashboardSdr.test.ts). Dos diferencias a propósito: el mes y el día se
// cuentan en hora de España (la app usa la zona de quien mira, y el equipo de Venezuela vería otro
// mes en los bordes) y no están lo que es de pantalla (filtros de la tabla, CSV, textos para copiar).
// Armar las demos también es de acá: las vistas `mcp_*` traen el lead y el registro por separado.

import { hoyEnEspana } from './crm.ts'
import { sumarDias } from './crmReglas.ts'

/** El registro de actividad de la demo (lo que importa acá: quién asiste). */
export type RegistroDeLaDemo = { con: string[] }

// ---------- Meta (fila `crm-meta-sdr` de `roadmap_notas`) ----------
export const ID_META_SDR = 'crm-meta-sdr'
export const META_POR_DEFECTO = 15

/** Se lee a la defensiva: vacío, roto o un número que no sirve es la de fábrica. */
export function leerMetaSdr(texto: string | null | undefined): number {
  try {
    const v: unknown = JSON.parse(texto ?? '')
    const n = typeof v === 'object' && v !== null ? (v as Record<string, unknown>).demosRealizadasPorMes : undefined
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : META_POR_DEFECTO
  } catch { return META_POR_DEFECTO }
}

export const escribirMetaSdr = (n: number) => JSON.stringify({ demosRealizadasPorMes: n })

// ---------- Una demo ----------
export type EstadoDeDemo = 'realizada' | 'cancelada' | 'agendada' | 'sinMarcar'

export const ROTULO_DE_ESTADO: Record<EstadoDeDemo, string> = {
  realizada: 'Realizada', cancelada: 'Cancelada', agendada: 'Agendada', sinMarcar: 'Sin marcar',
}

export function estadoDeDemo(r: { status: string; starts_at: string }, ahora: Date): EstadoDeDemo {
  if (r.status === 'completed') return 'realizada'
  if (r.status === 'cancelled') return 'cancelada'
  return Date.parse(r.starts_at) > ahora.getTime() ? 'agendada' : 'sinMarcar'
}

export type TareaDeConfirmar = { lead_id: string | null; title: string; due_date: string | null; completed: boolean }

/** El prefijo de las tareas que crea `tareasDeConfirmacionDeDemo`. */
export const PREFIJO_CONFIRMAR = 'Confirmar la demo'

/**
 * La demo se confirmó si, en su lead, se completó una de las tareas que nacen con ella
 * (`tareasDeConfirmacionDeDemo`): «… de hoy …» el día de la demo o «… de mañana …» el día anterior,
 * los dos en hora de España.
 */
export function demoConfirmada(r: { lead_id: string | null; starts_at: string }, tareas: readonly TareaDeConfirmar[]): boolean {
  if (!r.lead_id) return false
  const dia = hoyEnEspana(new Date(r.starts_at))
  const anterior = sumarDias(dia, -1)
  return tareas.some(t => t.completed && t.lead_id === r.lead_id && (
    (t.title.startsWith(`${PREFIJO_CONFIRMAR} de hoy`) && t.due_date === dia)
    || (t.title.startsWith(`${PREFIJO_CONFIRMAR} de mañana`) && t.due_date === anterior)
  ))
}

/** «Contratado»: el lead está en una etapa que arranca el onboarding, o ya es onboarding o cliente. */
export function esContratado(
  lead: { funnel_stage_id: string | null; lead_type?: string | null } | null,
  etapas: ReadonlyMap<string, { starts_onboarding?: boolean }>,
): boolean {
  if (!lead) return false
  if (lead.lead_type === 'ONBOARDING' || lead.lead_type === 'CLIENT') return true
  return !!(lead.funnel_stage_id && etapas.get(lead.funnel_stage_id)?.starts_onboarding)
}

const DIA_MS = 86_400_000

/** Días enteros entre que se agendó y la demo; nunca negativo. */
export const antelacionEnDias = (agendadaEl: string, empiezaEl: string) =>
  Math.max(0, Math.floor((Date.parse(empiezaEl) - Date.parse(agendadaEl)) / DIA_MS))

/** 'YYYY-MM' del instante en hora de España (la app usa la zona de quien mira: ver la cabecera). */
export function mesEnEspana(iso: string): string {
  const d = new Date(iso)
  // Una fecha rota no tira abajo el tablero entero: no cae en ningún mes.
  return Number.isNaN(d.getTime()) ? '' : hoyEnEspana(d).slice(0, 7)
}

/** Lunes a viernes que quedan en el mes de `hoy`, hoy incluido. */
export function diasHabilesRestantes(hoy: string): number {
  let n = 0
  for (let dia = hoy; dia.slice(0, 7) === hoy.slice(0, 7); dia = sumarDias(dia, 1)) {
    const [y, m, d] = dia.split('-').map(Number)
    const semana = new Date(y, m - 1, d, 12).getDay()
    if (semana !== 0 && semana !== 6) n++
  }
  return n
}

export type DemoDelSdr = {
  id: string; leadId: string | null; inmobiliaria: string
  /** Quién asiste (del registro) o, sin registro, el contacto del cliente. */
  contacto: string; con: string[]
  /** Cuántos asisten: los nombres del registro; sin saberlo, 1. */
  asistentes: number
  agendadaEl: string; empiezaEl: string
  estado: EstadoDeDemo; motivoCancelacion: string | null
  confirmada: boolean; contratado: boolean; antelacion: number
}

/** Llamadas (contestadas + no respondidas) y decisores de un mes (`llamadasPorMes` del front). */
export type LlamadasDelMes = { llamadas: number; decisores: number }

// ---------- Períodos ----------
export type PeriodoSdr = { meses: string[]; label: string }

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function sumarMeses(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export const nombreDelMes = (ym: string) => `${MESES_LARGOS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

/** `n` meses desde `ym` hacia atrás, el más nuevo primero. */
export const mesesHaciaAtras = (ym: string, n: number) => Array.from({ length: n }, (_, i) => sumarMeses(ym, -i))

export const periodoDeMes = (ym: string): PeriodoSdr => ({ meses: [ym], label: nombreDelMes(ym) })

/** El trimestre calendario que contiene a `ym`. */
export function trimestreDe(ym: string): PeriodoSdr {
  const q = Math.floor((Number(ym.slice(5, 7)) - 1) / 3)
  const primero = `${ym.slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}`
  return { meses: [0, 1, 2].map(i => sumarMeses(primero, i)), label: `T${q + 1} ${ym.slice(0, 4)}` }
}

export const ultimos12Meses = (ym: string): PeriodoSdr => ({ meses: mesesHaciaAtras(ym, 12).reverse(), label: 'Últimos 12 meses' })

// ---------- Métricas ----------
const tasa = (a: number, b: number) => (b > 0 ? a / b : null)

/** Cuando no hay demos resueltas con qué medir la asistencia, el forecast supone esta. */
export const TASA_DE_FABRICA = 0.6

export type Cruce = { demos: number; realizadas: number; tasa: number | null }

function cruce(demos: readonly DemoDelSdr[]): Cruce {
  const realizadas = demos.filter(d => d.estado === 'realizada').length
  return { demos: demos.length, realizadas, tasa: tasa(realizadas, demos.length) }
}

export type FilaDelDesglose = {
  mes: string; llamadas: number; decisores: number; pasoDeFiltro: number | null
  demos: number; efectividadDePitch: number | null; asistencia: number | null; realizadas: number; contratados: number
}

export type Forecast = {
  tasa: number; tasaEstimada: boolean; pipeline: number; brecha: number
  demosNecesarias: number; llamadasRestantes: number | null; ritmoDiario: number | null; diasHabiles: number
}

export type MetricasSdr = {
  demos: DemoDelSdr[]
  meta: { objetivo: number; realizadas: number; porcentaje: number; porEncima: number }
  asistencia: { realizadas: number; resueltas: number; tasa: number | null }
  embudo: {
    llamadas: number; decisores: number; demos: number
    pasoDeFiltro: number | null; efectividadDePitch: number | null; llamadasPorDemo: number | null
  }
  dosOMas: { demos: number; total: number; tasa: number | null }
  sinConfirmar: number
  forecast: Forecast | null
  prescripciones: string[]
  matrices: {
    confirmacion: { con: Cruce; sin: Cruce }
    antelacion: (Cruce & { rango: string })[]
    asistentes: (Cruce & { rango: string })[]
  }
  desglose: FilaDelDesglose[]
}

const resuelta = (d: DemoDelSdr) => d.estado !== 'agendada'
const pct = (x: number) => `${Math.round(x * 100)} %`

/**
 * Todo lo del período. Una demo es del mes en que se agendó (`created_at`), como «Demos agendadas»
 * de Objetivos. Resueltas son las que ya no están por venir: realizadas, canceladas y sin marcar.
 * El forecast sale solo para el mes en curso.
 */
export function metricasDelPeriodo(input: {
  meses: readonly string[]
  demos: readonly DemoDelSdr[]
  llamadas: ReadonlyMap<string, LlamadasDelMes>
  metaMensual: number
  mesActual: string
  diasHabiles: number
}): MetricasSdr {
  const { meses, llamadas, metaMensual, mesActual, diasHabiles } = input
  const delPeriodo = input.demos.filter(d => meses.includes(mesEnEspana(d.agendadaEl)))
  const resueltas = delPeriodo.filter(resuelta)
  const realizadas = delPeriodo.filter(d => d.estado === 'realizada').length
  const objetivo = metaMensual * meses.length

  let nLlamadas = 0
  let nDecisores = 0
  for (const mes of meses) {
    nLlamadas += llamadas.get(mes)?.llamadas ?? 0
    nDecisores += llamadas.get(mes)?.decisores ?? 0
  }
  const embudo = {
    llamadas: nLlamadas, decisores: nDecisores, demos: delPeriodo.length,
    pasoDeFiltro: tasa(nDecisores, nLlamadas),
    efectividadDePitch: tasa(delPeriodo.length, nDecisores),
    llamadasPorDemo: tasa(nLlamadas, delPeriodo.length),
  }
  const conDos = delPeriodo.filter(d => d.asistentes >= 2).length
  const dosOMas = { demos: conDos, total: delPeriodo.length, tasa: tasa(conDos, delPeriodo.length) }
  const sinConfirmar = delPeriodo.filter(d => d.estado === 'agendada' && !d.confirmada).length

  let forecast: Forecast | null = null
  if (meses.length === 1 && meses[0] === mesActual) {
    const real = tasa(realizadas, resueltas.length)
    const tasaEstimada = !real
    const t = real || TASA_DE_FABRICA
    const futuras = delPeriodo.filter(d => d.estado === 'agendada').length
    const pipeline = futuras * t
    const brecha = Math.max(0, objetivo - realizadas - pipeline)
    // El épsilon es por el redondeo de coma flotante: 2.4 / 0.6 no tiene que dar 5.
    const demosNecesarias = Math.max(0, Math.ceil(brecha / t - 1e-9))
    const llamadasRestantes = embudo.llamadasPorDemo === null ? null : Math.ceil(demosNecesarias * embudo.llamadasPorDemo - 1e-9)
    forecast = {
      tasa: t, tasaEstimada, pipeline, brecha, demosNecesarias, llamadasRestantes, diasHabiles,
      ritmoDiario: llamadasRestantes === null ? null : Math.ceil(llamadasRestantes / Math.max(1, diasHabiles)),
    }
  }

  const prescripciones: string[] = []
  if (sinConfirmar > 0) {
    prescripciones.push(sinConfirmar === 1
      ? 'Confirmá 1 demo agendada que todavía no se confirmó.'
      : `Confirmá ${sinConfirmar} demos agendadas que todavía no se confirmaron.`)
  }
  if (embudo.pasoDeFiltro !== null && embudo.pasoDeFiltro < 0.15) {
    prescripciones.push(`Solo el ${pct(embudo.pasoDeFiltro)} de las llamadas llega a un decisor: trabajá la apertura para pasar el filtro.`)
  }
  if (dosOMas.tasa !== null && dosOMas.tasa < 0.5) {
    prescripciones.push(`Solo el ${pct(dosOMas.tasa)} de las demos tiene 2 o más asistentes: pedí que se sume el decisor o el dueño.`)
  }
  if (prescripciones.length === 0) prescripciones.push('Todo en ritmo.')

  const desglose = [...meses].sort().map((mes): FilaDelDesglose => {
    const demosDelMes = delPeriodo.filter(d => mesEnEspana(d.agendadaEl) === mes)
    const l = llamadas.get(mes) ?? { llamadas: 0, decisores: 0 }
    const r = cruce(demosDelMes.filter(resuelta))
    return {
      mes, llamadas: l.llamadas, decisores: l.decisores, pasoDeFiltro: tasa(l.decisores, l.llamadas),
      demos: demosDelMes.length, efectividadDePitch: tasa(demosDelMes.length, l.decisores),
      asistencia: r.tasa, realizadas: r.realizadas,
      contratados: new Set(demosDelMes.filter(d => d.contratado).map(d => d.leadId ?? d.id)).size,
    }
  })

  return {
    demos: delPeriodo,
    meta: { objetivo, realizadas, porcentaje: objetivo > 0 ? realizadas / objetivo : 0, porEncima: Math.max(0, realizadas - objetivo) },
    asistencia: { realizadas, resueltas: resueltas.length, tasa: tasa(realizadas, resueltas.length) },
    embudo, dosOMas, sinConfirmar, forecast, prescripciones,
    matrices: {
      confirmacion: { con: cruce(resueltas.filter(d => d.confirmada)), sin: cruce(resueltas.filter(d => !d.confirmada)) },
      antelacion: [
        { rango: '0–4 días', ...cruce(resueltas.filter(d => d.antelacion <= 4)) },
        { rango: '5–7 días', ...cruce(resueltas.filter(d => d.antelacion >= 5 && d.antelacion <= 7)) },
        { rango: '8+ días', ...cruce(resueltas.filter(d => d.antelacion >= 8)) },
      ],
      asistentes: [
        { rango: '1 asistente', ...cruce(resueltas.filter(d => d.asistentes < 2)) },
        { rango: '2+ asistentes', ...cruce(resueltas.filter(d => d.asistentes >= 2)) },
      ],
    },
    desglose,
  }
}

/** «Second Chance»: las que se cayeron (canceladas) o quedaron sin marcar, la más nueva primero. */
export const segundaOportunidad = (demos: readonly DemoDelSdr[]) =>
  demos.filter(d => d.estado === 'cancelada' || d.estado === 'sinMarcar')
    .sort((a, b) => Date.parse(b.empiezaEl) - Date.parse(a.empiezaEl))

