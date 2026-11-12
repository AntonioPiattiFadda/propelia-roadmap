import { shiftIsoDate } from '@/lib/calendarDate'
import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { bolsasDeLlamada } from './actividad'
import { ZONA_ESPANA } from './alarmas'
import type { RegistroDeLaDemo } from './reuniones'

/* El «Dashboard SDR» (11/11/2026, por pedido): el rendimiento de quien agenda demos, armado SOLO
   con lo que está en la base. Llamadas y decisores salen de la actividad registrada (como
   Objetivos), las demos de `crm_meetings` creadas por la persona, la confirmación de las tareas
   «Confirmar la demo…» completadas y el «Contratado» de la etapa del lead. Sin comisiones ni plata,
   y sin contadores a mano. Los estados son los de la base (scheduled / completed / cancelled) más
   «Sin marcar»: una agendada cuya hora ya pasó y nadie marcó hecha. No hay No Show ni Postponed. */

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
  const dia = relojDeEspana(r.starts_at).ymd
  const anterior = shiftIsoDate(dia, -1)
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

/** 'YYYY-MM' del instante, en la zona de quien mira (como Objetivos). */
export function mesLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Lunes a viernes que quedan en el mes de `hoy`, hoy incluido. */
export function diasHabilesRestantes(hoy: string): number {
  let n = 0
  for (let dia = hoy; dia.slice(0, 7) === hoy.slice(0, 7); dia = shiftIsoDate(dia, 1)) {
    const [y, m, d] = dia.split('-').map(Number)
    const semana = new Date(y, m - 1, d, 12).getDay()
    if (semana !== 0 && semana !== 6) n++
  }
  return n
}

// ---------- Armar las demos ----------
/** Lo que trae `demosDelSdr` de cada reunión. */
export type ReunionDelSdr = {
  id: string; lead_id: string | null; starts_at: string; created_at: string; status: string; cancel_reason: string | null
  lead: {
    funnel_stage_id: string | null; lead_type?: string | null
    client: { company_name: string | null; first_name: string | null; last_name: string | null } | null
  } | null
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

export function armarDemos(
  reuniones: readonly ReunionDelSdr[],
  registros: ReadonlyMap<string, RegistroDeLaDemo>,
  tareas: readonly TareaDeConfirmar[],
  etapas: ReadonlyMap<string, { starts_onboarding?: boolean }>,
  ahora: Date,
): DemoDelSdr[] {
  return reuniones.map(r => {
    const con = registros.get(r.id)?.con ?? []
    const cliente = r.lead?.client
    const delCliente = [cliente?.first_name, cliente?.last_name].map(s => s?.trim()).filter(Boolean).join(' ')
    const estado = estadoDeDemo(r, ahora)
    return {
      id: r.id, leadId: r.lead_id,
      inmobiliaria: cliente?.company_name?.trim() || 'Sin nombre',
      contacto: con.length ? con.join(', ') : delCliente,
      con, asistentes: Math.max(1, con.length),
      agendadaEl: r.created_at, empiezaEl: r.starts_at,
      estado, motivoCancelacion: estado === 'cancelada' ? r.cancel_reason : null,
      confirmada: demoConfirmada(r, tareas),
      contratado: esContratado(r.lead, etapas),
      antelacion: antelacionEnDias(r.created_at, r.starts_at),
    }
  })
}

// ---------- Llamadas ----------
export type LlamadasDelMes = { llamadas: number; decisores: number }

/** Contestadas + no respondidas por mes (las bolsas de Objetivos), y aparte las de decisor. */
export function llamadasPorMes(actividades: readonly { created_at: string; long_description: string | null }[]): Map<string, LlamadasDelMes> {
  const m = new Map<string, LlamadasDelMes>()
  for (const a of actividades) {
    const bolsas = bolsasDeLlamada(a.long_description)
    if (bolsas.length === 0) continue
    const mes = mesLocal(a.created_at)
    const fila = m.get(mes) ?? { llamadas: 0, decisores: 0 }
    fila.llamadas++
    if (bolsas.includes('decisores')) fila.decisores++
    m.set(mes, fila)
  }
  return m
}

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
  const delPeriodo = input.demos.filter(d => meses.includes(mesLocal(d.agendadaEl)))
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
    const demosDelMes = delPeriodo.filter(d => mesLocal(d.agendadaEl) === mes)
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

// ---------- Tabla ----------
export type FiltrosDeDemos = {
  busqueda: string
  estado: EstadoDeDemo | 'todos'
  calendario: 'todos' | 'confirmadas' | 'pendientes'
  /** Lo que hay que mover: agendadas y sin marcar. */
  foco: boolean
  orden: 'demo' | 'agendada'
}

const comparable = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function filtrarDemos(demos: readonly DemoDelSdr[], f: FiltrosDeDemos): DemoDelSdr[] {
  const q = comparable(f.busqueda.trim())
  const campo = f.orden === 'demo' ? 'empiezaEl' : 'agendadaEl'
  return demos
    .filter(d => !q || comparable(`${d.inmobiliaria} ${d.contacto}`).includes(q))
    .filter(d => f.estado === 'todos' || d.estado === f.estado)
    .filter(d => f.calendario === 'todos' || (f.calendario === 'confirmadas') === d.confirmada)
    .filter(d => !f.foco || d.estado === 'agendada' || d.estado === 'sinMarcar')
    .sort((a, b) => Date.parse(b[campo]) - Date.parse(a[campo]))
}

/** «Second Chance»: las que se cayeron (canceladas) o quedaron sin marcar, la más nueva primero. */
export const segundaOportunidad = (demos: readonly DemoDelSdr[]) =>
  demos.filter(d => d.estado === 'cancelada' || d.estado === 'sinMarcar')
    .sort((a, b) => Date.parse(b.empiezaEl) - Date.parse(a.empiezaEl))

// ---------- Textos para copiar ----------
const DIA_EN_ESPANA = new Intl.DateTimeFormat('es-ES', { timeZone: ZONA_ESPANA, weekday: 'long', day: 'numeric', month: 'long' })

/** «martes 10 de noviembre a las 09:30», en hora de España. Por partes: el ICU pone una coma
 *  después del día de la semana. */
export function cuandoEnEspana(iso: string): string {
  const p = Object.fromEntries(DIA_EN_ESPANA.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.weekday} ${p.day} de ${p.month} a las ${relojDeEspana(iso).hora}`
}

const saludo = (d: DemoDelSdr) => (d.con[0] ?? d.contacto.split(',')[0]).trim()

/** El WhatsApp para confirmar la demo. Va al cliente, que es de España: en «tú». */
export function recordatorioDeDemo(d: DemoDelSdr): string {
  const nombre = saludo(d)
  return [
    `¡Hola${nombre ? ` ${nombre}` : ''}! Te escribo de Propelia para confirmar la demo del ${cuandoEnEspana(d.empiezaEl)} (hora de España).`,
    '¿Te sigue viniendo bien? Si necesitas cambiarla, dímelo y buscamos otro hueco.',
  ].join('\n')
}

/** El guion para recuperar una demo que se cayó. También al cliente: en «tú». */
export function guionDeSegundaOportunidad(d: DemoDelSdr): string {
  const nombre = saludo(d)
  return [
    `¡Hola${nombre ? ` ${nombre}` : ''}! Soy de Propelia. Teníamos pendiente la demo con ${d.inmobiliaria} y al final no pudimos hacerla.`,
    'Son 20 minutos y te enseño cómo Propelia ordena los leads de la inmobiliaria y te ayuda a no perder ninguno.',
    '¿Te viene bien que busquemos otro momento esta semana?',
  ].join('\n')
}

const fechaCorta = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
const celda = (v: string | number) => {
  const s = String(v)
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Las demos del período para Excel: `;` (el Excel en español) y BOM para que lea las tildes. */
export function csvDeDemos(demos: readonly DemoDelSdr[]): string {
  const cabecera = ['Agendada el', 'Demo (hora de España)', 'Antelación (días)', 'Inmobiliaria', 'Contacto', 'Asistentes', 'Estado', 'Motivo de cancelación', 'Calendario confirmado', 'Contratado']
  const filas = demos.map(d => [
    fechaCorta(d.agendadaEl), `${relojDeEspana(d.empiezaEl).ymd} ${relojDeEspana(d.empiezaEl).hora}`, d.antelacion,
    d.inmobiliaria, d.contacto, d.asistentes, ROTULO_DE_ESTADO[d.estado], d.motivoCancelacion ?? '',
    d.confirmada ? 'Sí' : 'No', d.contratado ? 'Sí' : 'No',
  ])
  return '﻿' + [cabecera, ...filas].map(f => f.map(celda).join(';')).join('\r\n')
}

const opcional = (x: number | null) => (x === null ? '–' : pct(x))

/** El resumen para pegar en un chat: texto plano. */
export function resumenEnTexto(m: MetricasSdr, quien: { persona: string; periodo: string }): string {
  const renglones = [
    `Dashboard SDR · ${quien.persona} · ${quien.periodo}`,
    `Demos realizadas: ${m.meta.realizadas} de ${m.meta.objetivo} (${pct(m.meta.porcentaje)})${m.meta.porEncima ? ` · +${m.meta.porEncima} por encima de la meta` : ''}`,
    `Asistencia: ${opcional(m.asistencia.tasa)} (${m.asistencia.realizadas} de ${m.asistencia.resueltas} resueltas)`,
    `Llamadas: ${m.embudo.llamadas} · Decisores: ${m.embudo.decisores} (${opcional(m.embudo.pasoDeFiltro)}) · Demos agendadas: ${m.embudo.demos} (${opcional(m.embudo.efectividadDePitch)} de los decisores)`,
    `Demos con 2+ asistentes: ${opcional(m.dosOMas.tasa)}`,
  ]
  if (m.forecast) {
    renglones.push(`Faltan ${m.forecast.demosNecesarias} demos nuevas${m.forecast.ritmoDiario !== null ? ` · ${m.forecast.ritmoDiario} llamadas por día hábil` : ''}`)
  }
  renglones.push('', ...m.prescripciones.map(p => `- ${p}`))
  return renglones.join('\n')
}
