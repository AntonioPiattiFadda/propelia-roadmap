// Lo del CRM que el MCP lee igual que el front (src/pages/crm/lib/). Puro: crm.test.ts.

/**
 * La actividad escrita a mano guarda su meta en `long_description` con la marca `<!--act-->`
 * (tipo, con quién, teléfono, resultado…). Al conector va el tipo y con quién; el teléfono NO.
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
}

export function actividadDe(commentType: unknown, longDescription: unknown): Actividad {
  if (commentType === 'SYSTEM') return { tipo: 'sistema', con: [] }
  if (typeof longDescription !== 'string' || !longDescription.startsWith(MARCA_ACTIVIDAD)) {
    return { tipo: 'nota', con: [] }
  }
  try {
    const meta = JSON.parse(longDescription.slice(MARCA_ACTIVIDAD.length))
    const tipo = typeof meta?.tipo === 'string' ? (TIPOS[meta.tipo] ?? meta.tipo) : 'nota'
    const con = Array.isArray(meta?.con) ? meta.con.filter((c: unknown): c is string => typeof c === 'string') : []
    return { tipo, con }
  } catch {
    return { tipo: 'nota', con: [] }
  }
}

/** El «hoy» del equipo: las tareas y las demos se piensan en hora de España. */
export function hoyEnEspana(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now)
}
