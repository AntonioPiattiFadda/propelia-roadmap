/* El ritmo del día de un SDR (19/11/2026, por pedido): el contador «Contestadas» de Objetivos va
   en verde, amarillo o rojo según cuántas lleva contra una meta que crece con la hora, y Propelin
   avisa en los puntos de control. Al final del día: < 40 rojo, 40–49 amarillo, 50 o más verde (la
   meta es 60). Durante el día, los umbrales son esos por la parte de la jornada que ya pasó
   (`f` = minutos trabajados / 390, sin la pausa). Todo en hora de España. Reglas puras: la
   pantalla (`ContadorDeLlamadas`) pone la hora y las contestadas. */

import { esDiaHabil } from './commits'
import { shiftIsoDate } from '@/lib/calendarDate'

export type ColorDelRitmo = 'verde' | 'amarillo' | 'rojo'
export type TipoDeDia = 'completo' | 'media' | 'libre'

/** Minutos desde la medianoche (hora de España). */
export interface Jornada { inicio: number; pausaDesde: number; pausaHasta: number; fin: number }

export const minutosDeHora = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}
const horaDeMinutos = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 10:30 a 18:00 con pausa de 14:00 a 15:00: 390 minutos. */
export const JORNADA: Jornada = { inicio: 630, pausaDesde: 840, pausaHasta: 900, fin: 1080 }
/** La media jornada es la mañana: de 10:30 a 14:00, 210 minutos. */
export const MEDIA_JORNADA: Jornada = { inicio: 630, pausaDesde: 840, pausaHasta: 840, fin: 840 }

export const META_AMARILLO = 40
export const META_VERDE = 50
export const META_TOP = 60
export const MINUTOS_DE_GRACIA = 45
/** La proyección al cierre se muestra desde las 12:30: antes, con 2 llamadas, dice cualquier cosa. */
export const PROYECCION_DESDE = 750
/** 12:30, 14:00, 16:30 y 18:00. */
export const PUNTOS_DE_CONTROL = [750, 840, 990, 1080] as const
/** Un punto de control avisa hasta una hora después: abrir la app a las 17:00 no dispara el de las 12:30. */
export const VENTANA_DEL_PUNTO = 60

const RANGO: Record<ColorDelRitmo, number> = { rojo: 0, amarillo: 1, verde: 2 }

const productivos = (min: number, j: Jornada) => {
  const hasta = Math.min(Math.max(min, j.inicio), j.fin)
  const pausa = Math.max(0, Math.min(hasta, j.pausaHasta) - j.pausaDesde)
  return hasta - j.inicio - pausa
}
const MINUTOS_DE_JORNADA = productivos(JORNADA.fin, JORNADA)

/** Sin marca, de lunes a viernes es completo y el fin de semana libre. Un día marcado manda. */
export function tipoDeDia(ymd: string, marcados: Readonly<Record<string, TipoDeDia>> = {}): TipoDeDia {
  return marcados[ymd] ?? (esDiaHabil(ymd) ? 'completo' : 'libre')
}

export interface EstadoDelRitmo {
  color: ColorDelRitmo
  momento: 'antes' | 'gracia' | 'jornada' | 'terminada'
  enPausa: boolean
  /** Ya llegó a 50: verde fijo por el resto del día. */
  asegurado: boolean
  umbralAmarillo: number
  umbralVerde: number
  /** Cuántas haría al cierre de su jornada a este ritmo. null antes de las 12:30. */
  proyeccion: number | null
  /** Hasta qué hora es la jornada de hoy («18:00» o «14:00»). */
  fin: string
}

/** El color de `contestadas` a la hora `min` (minutos, hora de España). null si el día es libre. */
export function estadoDelRitmo(contestadas: number, min: number, tipo: TipoDeDia = 'completo'): EstadoDelRitmo | null {
  if (tipo === 'libre') return null
  const j = tipo === 'media' ? MEDIA_JORNADA : JORNADA
  const hechos = productivos(min, j)
  const f = hechos / MINUTOS_DE_JORNADA
  const umbralAmarillo = Math.round(META_AMARILLO * f)
  const umbralVerde = Math.round(META_VERDE * f)
  const momento = min < j.inicio ? 'antes' : min < j.inicio + MINUTOS_DE_GRACIA ? 'gracia' : min >= j.fin ? 'terminada' : 'jornada'
  const asegurado = contestadas >= META_VERDE
  const color: ColorDelRitmo = momento === 'antes' || momento === 'gracia' || asegurado || contestadas >= umbralVerde
    ? 'verde'
    : contestadas >= umbralAmarillo ? 'amarillo' : 'rojo'
  const total = productivos(j.fin, j)
  const proyeccion = min >= PROYECCION_DESDE && hechos > 0 ? Math.round(contestadas * total / hechos) : null
  return {
    color, momento, asegurado, umbralAmarillo, umbralVerde, proyeccion,
    enPausa: min >= j.pausaDesde && min < j.pausaHasta,
    fin: horaDeMinutos(j.fin),
  }
}

/** Lo que dice Propelin al pasar el cursor por «Contestadas». */
export function explicacionDelRitmo(e: EstadoDelRitmo, contestadas: number): { titulo: string; porque: string; proyeccion: string | null } {
  const { umbralAmarillo: ua, umbralVerde: uv } = e
  const titulo = e.momento === 'antes'
    ? `Llevás ${contestadas} contactados`
    : `Llevás ${contestadas} contactados · ${e.momento === 'terminada' ? 'meta del día' : 'a esta hora'}: verde desde ${uv}, amarillo desde ${ua}`
  let porque: string
  if (e.momento === 'antes') porque = `La jornada arranca a las ${horaDeMinutos(JORNADA.inicio)}: hasta entonces vas en verde.`
  else if (e.asegurado) porque = contestadas >= META_TOP
    ? `¡${contestadas}! Pasaste los ${META_TOP}: día top.`
    : `Pasaste los ${META_VERDE}: el día está en verde asegurado. ¡A por los ${META_TOP}!`
  else if (e.momento === 'gracia') porque = `Son los primeros ${MINUTOS_DE_GRACIA} minutos: vas en verde mientras arrancás. Desde las ${horaDeMinutos(JORNADA.inicio + MINUTOS_DE_GRACIA)} se compara con la meta.`
  else if (e.color === 'verde') porque = `Vas en verde: tenés ${contestadas} y ${e.momento === 'terminada' ? 'el día' : 'a esta hora el verde'} arranca en ${uv}.`
  else if (e.color === 'amarillo') porque = `Vas en amarillo: tenés ${contestadas}, más que los ${ua} del amarillo pero menos que los ${uv} del verde. Te faltan ${uv - contestadas} para el verde.`
  else porque = `Vas en rojo: ${e.momento === 'terminada' ? 'el amarillo era desde' : 'a esta hora deberías tener al menos'} ${ua} y tenés ${contestadas}. Te faltan ${ua - contestadas} para el amarillo y ${uv - contestadas} para el verde.`
  if (e.enPausa) porque += ` Estás en la pausa: los números quedan como a las ${horaDeMinutos(JORNADA.pausaDesde)}.`
  const proyeccion = e.proyeccion !== null && e.momento !== 'terminada' ? `Proyección al cierre: ${e.proyeccion}.` : null
  return { titulo, porque, proyeccion }
}

/** Lo que guarda cada navegador del día: qué avisos ya salieron y el último color visto. */
export interface MemoriaDeAvisos { enviados: string[]; ultimoColor: ColorDelRitmo | null }

export interface AvisoDelRitmo {
  /** `punto-<min>`, `meta-50`, `meta-60` o `mejora-<min>`. */
  clave: string
  texto: string
  color: ColorDelRitmo
  cierre?: boolean
  /** Rojo y cierre: los que un SUPERADMIN recibiría en copia (todavía sin servidor). */
  paraSuperadmin: boolean
}

function textoDelPunto(e: EstadoDelRitmo, x: number): string {
  const z = e.proyeccion ?? x
  if (e.color === 'verde') return `🟢 Vas en verde: ${x} contactados. Proyección al cierre: ${z}. ¡A por los ${META_TOP}!`
  if (e.color === 'amarillo') return `🟡 Vas en amarillo: llevás ${x} y para estar en verde a esta hora necesitás ${e.umbralVerde}. Te faltan ${e.umbralVerde - x}.`
  return `🔴 Estás en rojo: llevás ${x} contactados y a esta hora deberías tener al menos ${e.umbralAmarillo} (verde: ${e.umbralVerde}). Al ritmo actual cerrás con ${z}. ¡Metele pata!`
}

function textoDelCierre(e: EstadoDelRitmo, x: number, media: number | undefined): string {
  const base = `🏁 Cierre del día: ${x} contactados, en ${e.color}.`
  if (media === undefined) return base
  const m = Math.round(media)
  const d = x - m
  return `${base} Tu media de los últimos 5 días es ${m} (${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}).`
}

/**
 * Qué avisa Propelin ahora. Un aviso por punto de control (dentro de su ventana), uno al llegar a
 * 50 y otro a 60, y entre puntos solo cuando el color mejora (no el primer cálculo: abrir la app no
 * es una mejora). Devuelve la memoria nueva, que la pantalla guarda.
 */
export function avisosDelRitmo(
  memoria: MemoriaDeAvisos, contestadas: number, min: number, tipo: TipoDeDia = 'completo', mediaDe5Dias?: number,
): { avisos: AvisoDelRitmo[]; memoria: MemoriaDeAvisos } {
  const e = estadoDelRitmo(contestadas, min, tipo)
  if (!e) return { avisos: [], memoria }
  const fin = minutosDeHora(e.fin)
  const enviados = new Set(memoria.enviados)
  const avisos: AvisoDelRitmo[] = []

  const punto = PUNTOS_DE_CONTROL.filter(p => p <= fin).findLast(p => min >= p && min < p + VENTANA_DEL_PUNTO)
  if (punto !== undefined && !enviados.has(`punto-${punto}`)) {
    const cierre = punto === fin
    avisos.push({
      clave: `punto-${punto}`, color: e.color, cierre,
      texto: cierre ? textoDelCierre(e, contestadas, mediaDe5Dias) : textoDelPunto(e, contestadas),
      paraSuperadmin: cierre || e.color === 'rojo',
    })
  }
  if (contestadas >= META_TOP && !enviados.has('meta-60')) {
    avisos.push({ clave: 'meta-60', color: 'verde', texto: `🔥 ¡${META_TOP} contactados, día top!`, paraSuperadmin: false })
    enviados.add('meta-50')
  } else if (contestadas >= META_VERDE && !enviados.has('meta-50')) {
    avisos.push({ clave: 'meta-50', color: 'verde', texto: `✅ ¡Día en verde asegurado: ${META_VERDE} contactados!`, paraSuperadmin: false })
  }
  if (avisos.length === 0 && memoria.ultimoColor && RANGO[e.color] > RANGO[memoria.ultimoColor]) {
    avisos.push({ clave: `mejora-${min}`, color: e.color, texto: `💪 ¡Pasaste a ${e.color}! Llevás ${contestadas} contactados.`, paraSuperadmin: false })
  }
  for (const a of avisos) if (!a.clave.startsWith('mejora-')) enviados.add(a.clave)
  return { avisos, memoria: { enviados: [...enviados], ultimoColor: e.color } }
}

/** Los `n` días hábiles antes de `hoy`, del más nuevo al más viejo (la media del cierre). */
export function diasHabilesAnteriores(hoy: string, n: number): string[] {
  const dias: string[] = []
  for (let d = shiftIsoDate(hoy, -1); dias.length < n; d = shiftIsoDate(d, -1)) if (esDiaHabil(d)) dias.push(d)
  return dias
}
