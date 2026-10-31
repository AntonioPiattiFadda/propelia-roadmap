// Lo del CRM que el MCP lee igual que el front (src/pages/crm/lib/). Puro: crm.test.ts.

/**
 * La actividad escrita a mano guarda su meta en `long_description` con la marca `<!--act-->`
 * (tipo, con quién, teléfono, resultado…; `MetaDeActividad` en src/pages/crm/lib/actividad.ts).
 * Al conector va el tipo, con quién, si decide y, en una demo, el decisor apuntado y la reunión.
 * El teléfono NO.
 */
const MARCA_ACTIVIDAD = '<!--act-->'

const TIPOS: Record<string, string> = {
  nota: 'nota',
  llamada: 'llamada',
  fallido: 'contacto fallido',
  demo: 'demo agendada',
}

export interface Actividad {
  tipo: string
  con: string[]
  /** Llamada: si quien atendió decide. */
  decisor?: boolean
  /** Demo: el decisor que dio el doorkeeper (no tiene por qué asistir). */
  decisorApuntado?: string
  /** Demo: el id de la reunión en crm_meetings. */
  reunion?: string
  resultado?: string
}

export function actividadDe(commentType: unknown, longDescription: unknown): Actividad {
  if (commentType === 'SYSTEM') return { tipo: 'sistema', con: [] }
  if (typeof longDescription !== 'string' || !longDescription.startsWith(MARCA_ACTIVIDAD)) {
    return { tipo: 'nota', con: [] }
  }
  try {
    const meta = JSON.parse(longDescription.slice(MARCA_ACTIVIDAD.length))
    const a: Actividad = {
      tipo: typeof meta?.tipo === 'string' ? (TIPOS[meta.tipo] ?? meta.tipo) : 'nota',
      con: Array.isArray(meta?.con) ? meta.con.filter((c: unknown): c is string => typeof c === 'string') : [],
    }
    if (typeof meta?.decisor === 'boolean') a.decisor = meta.decisor
    if (typeof meta?.decisorApuntado === 'string' && meta.decisorApuntado.trim()) a.decisorApuntado = meta.decisorApuntado.trim()
    if (typeof meta?.reunion === 'string') a.reunion = meta.reunion
    if (typeof meta?.resultado === 'string') a.resultado = meta.resultado
    return a
  } catch {
    return { tipo: 'nota', con: [] }
  }
}

/** El texto de fábrica del registro de una demo (`TEXTO_DE_DEMO`): no dice nada. */
export const TEXTO_DE_DEMO = 'Demo agendada.'

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g

/**
 * Las demos de antes del 22/10/2026 guardaban la invitación, quién asiste y las notas en
 * `description` (`leerDescripcionDeDemo` del front). Al conector va quién asiste y las notas; el
 * renglón de la invitación no, y cualquier email suelto en las notas se tapa.
 */
export function demoVieja(descripcion: unknown): { asistentes: string[]; notas: string } {
  let asistentes: string[] = []
  const notas: string[] = []
  for (const renglon of (typeof descripcion === 'string' ? descripcion : '').split('\n')) {
    if (renglon.startsWith('Invitación a: ')) continue
    if (!asistentes.length && renglon.startsWith('Asisten: ')) {
      asistentes = renglon.slice('Asisten: '.length).split(',').map((s) => s.trim()).filter(Boolean)
    } else notas.push(renglon)
  }
  return { asistentes, notas: notas.join('\n').replace(EMAIL, '[email]').trim() }
}

/** El «hoy» del equipo: las tareas y las demos se piensan en hora de España. */
export function hoyEnEspana(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now)
}

/** «vie 31/10/2026 10:00» en hora de España: lo que se lee para saber cuándo es la demo. */
export function horaEnEspana(iso: unknown): string | null {
  if (typeof iso !== 'string') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${p('weekday').replace('.', '')} ${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`
}

/** Días enteros entre dos instantes (b − a), para «hace cuánto» y «falta cuánto». */
export function diasEntre(a: unknown, b: unknown): number | null {
  if (typeof a !== 'string' || typeof b !== 'string') return null
  const ms = Date.parse(b) - Date.parse(a)
  return Number.isNaN(ms) ? null : Math.floor(ms / 86_400_000)
}
