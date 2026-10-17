import { fmtDayMonth, fmtDueLabel, shiftIsoDate, toIsoDate } from '@/lib/calendarDate'
import type { LeadDetalle, Usuario } from '../types'
import { nombreDe } from './permisos'

/* La actividad del lead en una sola lista: lo que se escribió (comentarios MANUAL), lo que dejó
   el sistema (comentarios SYSTEM) y lo que registran la base y los triggers (gestiones, cambios
   de etapa y de responsable). Una lista y no cuatro: la pregunta al abrir un lead es «qué pasó
   con esto», y la respuesta es en orden. */
export type ItemActividad = {
  id: string
  tipo: 'comentario' | 'llamada' | 'sistema' | 'gestion' | 'pospuesto' | 'asignacion' | 'reunion' | 'consejo'
  /** Cuándo pasó (no cuándo vence): lo que ordena la lista. */
  fecha: string
  texto: string
  autorId: string | null
  /** Con quién de la inmobiliaria (solo notas y llamadas; vacío = no se dijo). */
  con?: string[]
  /** Solo llamadas: qué pasó y si fue con un decisor. */
  resultado?: ResultadoDeLlamada
  decisor?: boolean
  /** Solo llamadas: a qué teléfono se llamó (ver `MetaDeActividad`). */
  telefono?: { numero: string; etiqueta: string }
}

/* Qué fue una actividad escrita a mano —nota o llamada— y con quién, colgado del comentario en
   `long_description`: la columna existe y ninguna pantalla la usaba, y `comment_type` solo admite
   MANUAL y SYSTEM, así que una llamada no tenía dónde decir que era una llamada sin migración.
   Misma jugada que el tablero con `modulo`, `hoy` y `tipo`. Por eso se lee ESTRICTO: por la marca
   del principio y la forma del JSON, nunca «lo que haya»; si algún día otro escribe ahí texto
   largo de verdad, no tiene que leerse como una llamada. Se guardan los nombres y no el casillero:
   el teléfono alternativo de hoy puede ser otra persona mañana, y la llamada fue con quien fue. */
const MARCA_ACTIVIDAD = '<!--act-->'
/** Qué pasó en una llamada. Opcional: las llamadas anteriores al 10/10/2026 no lo dicen. */
export type ResultadoDeLlamada = 'contestada' | 'no_respondida'
export type MetaDeActividad = {
  tipo: 'nota' | 'llamada'
  con: string[]
  resultado?: ResultadoDeLlamada
  /** Si quien atendió decide. Solo tiene sentido en una llamada contestada. */
  decisor?: boolean
  /** Solo llamadas: a qué número se llamó y cómo se llamaba ese número en el perfil («Oficina»,
   *  «Laura»). Va aparte de `con` porque el número marcado y quien atiende no siempre coinciden
   *  (16/10/2026, por pedido). Las llamadas anteriores no lo dicen. */
  telefono?: { numero: string; etiqueta: string }
}

/** Lo que va a `long_description`. Una nota sin nadie no guarda nada: es un comentario de siempre. */
export function armarMetaDeActividad(meta: MetaDeActividad): string | null {
  if (meta.tipo === 'nota' && meta.con.length === 0) return null
  return MARCA_ACTIVIDAD + JSON.stringify(meta)
}

function esTelefonoGuardado(t: unknown): t is { numero: string; etiqueta: string } {
  if (typeof t !== 'object' || t === null) return false
  const { numero, etiqueta } = t as Record<string, unknown>
  return typeof numero === 'string' && typeof etiqueta === 'string'
}

export function leerMetaDeActividad(guardado: string | null): MetaDeActividad | null {
  if (!guardado?.startsWith(MARCA_ACTIVIDAD)) return null
  try {
    const m: unknown = JSON.parse(guardado.slice(MARCA_ACTIVIDAD.length))
    if (typeof m !== 'object' || m === null) return null
    const { tipo, con, resultado, decisor, telefono } = m as Record<string, unknown>
    if (tipo !== 'nota' && tipo !== 'llamada') return null
    if (!Array.isArray(con) || !con.every(c => typeof c === 'string')) return null
    if (resultado !== undefined && resultado !== 'contestada' && resultado !== 'no_respondida') return null
    if (decisor !== undefined && typeof decisor !== 'boolean') return null
    if (telefono !== undefined && !esTelefonoGuardado(telefono)) return null
    return {
      tipo, con,
      ...(resultado !== undefined && { resultado }),
      ...(decisor !== undefined && { decisor }),
      ...(telefono !== undefined && { telefono: { numero: telefono.numero, etiqueta: telefono.etiqueta } }),
    }
  } catch { return null }
}

export type ResumenDeLlamadas = { contestadas: number; decisores: number; noRespondidas: number }

/** El contador del día. Se le pasa el `long_description` de cada comentario: lo que no es una
 *  llamada con resultado (notas, comentarios viejos, llamadas de antes de que existiera) no
 *  cuenta. Las de decisor son también contestadas: es un subconjunto, no una tercera bolsa. */
export function resumenDeLlamadas(guardados: readonly (string | null)[]): ResumenDeLlamadas {
  const r: ResumenDeLlamadas = { contestadas: 0, decisores: 0, noRespondidas: 0 }
  for (const g of guardados) for (const k of bolsasDeLlamada(g)) r[k]++
  return r
}

/** En qué números del contador cae una actividad guardada: ninguno, uno o dos (con decisor
 *  también es contestada). Una sola regla para contar y para filtrar (`objetivosDe`). */
export function bolsasDeLlamada(guardado: string | null): (keyof ResumenDeLlamadas)[] {
  const m = leerMetaDeActividad(guardado)
  if (m?.tipo !== 'llamada') return []
  if (m.resultado === 'no_respondida') return ['noRespondidas']
  if (m.resultado === 'contestada') return m.decisor ? ['contestadas', 'decisores'] : ['contestadas']
  return []
}

/** Si en esta inmobiliaria ya se habló con quien decide (16/10/2026, por pedido): la primera
 *  llamada contestada con el decisor, sin importar en qué etapa esté el lead. Sale de las llamadas
 *  registradas y no de una columna: el dato ya estaba en cada llamada y así no hace falta
 *  migración. Borrar esa llamada (se cargó por error) lo desmarca, que es lo correcto. */
export function decisorContactado(
  comments: readonly Pick<LeadDetalle['comments'][number], 'created_at' | 'long_description' | 'deleted_at'>[],
): { fecha: string; con: string[] } | null {
  let primera: { fecha: string; con: string[] } | null = null
  for (const c of comments) {
    if (c.deleted_at) continue
    const m = leerMetaDeActividad(c.long_description)
    if (m?.tipo !== 'llamada' || m.resultado !== 'contestada' || !m.decisor) continue
    if (!primera || c.created_at < primera.fecha) primera = { fecha: c.created_at, con: m.con }
  }
  return primera
}

/** Lo que hace falta de la inmobiliaria para dibujar su consejo en la actividad. */
export type ClienteConConsejo = { id: string; sdr_advice: string | null; created_at: string }

export function lineaDeTiempo(
  detalle: LeadDetalle, usuarios: Usuario[],
  cliente?: ClienteConConsejo | null,
): ItemActividad[] {
  const consejo = cliente?.sdr_advice?.trim()
  const items: ItemActividad[] = [
    /* El consejo de Claude para el SDR se lee acá y en ningún otro lado (12/10/2026 salió del
       perfil del lead): es lo que tiene abierto el SDR mientras llama. No es un comentario
       guardado: sale de `crm_clients.sdr_advice` en cada pintado. Se fecha cuando llegó la
       inmobiliaria: es lo primero. */
    ...(cliente && consejo
      ? [{ id: `consejo-${cliente.id}`, tipo: 'consejo' as const, fecha: cliente.created_at, texto: consejo, autorId: null }]
      : []),
    ...detalle.comments.map(c => {
      if (c.comment_type === 'SYSTEM') return { id: c.id, tipo: 'sistema' as const, fecha: c.created_at, texto: c.description, autorId: c.created_by }
      const meta = leerMetaDeActividad(c.long_description)
      return {
        id: c.id, tipo: meta?.tipo === 'llamada' ? 'llamada' as const : 'comentario' as const,
        fecha: c.created_at, texto: c.description, autorId: c.created_by, con: meta?.con ?? [],
        resultado: meta?.resultado, decisor: meta?.decisor, telefono: meta?.telefono,
      }
    }),
    ...detalle.events.map(e => ({
      id: e.id,
      tipo: e.action === 'POSTPONED' ? 'pospuesto' as const : 'gestion' as const,
      // created_at: un pospuesto a la semana que viene se hizo HOY, y ahí va en la lista.
      fecha: e.created_at,
      // toIsoDate usa el día LOCAL: un timestamptz de las 01:00 UTC es el día anterior en Buenos Aires.
      texto: (e.action === 'POSTPONED' ? `Gestión pospuesta hasta ${fmtDayMonth(toIsoDate(new Date(e.effective_at)))}` : 'Gestión registrada')
        + (e.note ? ` · ${e.note}` : ''),
      autorId: e.created_by,
    })),
    /* Ni los cambios de estado ni las tareas agendadas son actividad (16/10/2026, por pedido):
       llenaban la lista de «Estado: A → B» y «Se agendó la tarea…». La base los sigue guardando
       (`crm_stage_history`, `crm_tasks`); el estado se ve en el perfil y las tareas en su panel. */
    ...detalle.assignmentHistory.map(h => ({
      id: h.id, tipo: 'asignacion' as const, fecha: h.changed_at,
      texto: `Responsable: ${nombreDe(usuarios, h.from_user_id)} → ${nombreDe(usuarios, h.to_user_id)}`,
      autorId: h.changed_by,
    })),
    /* Una reunión entra cuando se agendó (created_at), que es lo que pasó; para cuándo es va en
       el texto. Se nombra «demo» porque es lo único que agenda el compositor, y el título «Demo»
       que le pone de fábrica no se repite: diría lo mismo dos veces. */
    ...detalle.meetings.filter(m => m.deleted_at == null).map(m => ({
      id: m.id, tipo: 'reunion' as const, fecha: m.created_at,
      texto: `Se agendó una demo para el ${fmtDayMonth(toIsoDate(new Date(m.starts_at)))} a las ${horaDe(m.starts_at)}`
        + (m.title && m.title !== 'Demo' ? ` · ${m.title}` : ''),
      autorId: m.created_by,
    })),
  ]
  return items.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
}

/** HH:mm del instante en la zona de quien mira. */
export function horaDe(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const DIAS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export type DiaDeActividad = { dia: string; rotulo: string; items: ItemActividad[] }

/**
 * La línea de tiempo partida por día LOCAL, en el orden en que llegan los items (ya vienen
 * ordenados). Hoy y ayer se nombran; el resto lleva el día de la semana, que es lo que se
 * recuerda de una llamada («fue el jueves»). El año solo si no es el de hoy.
 */
export function agruparPorDia(items: ItemActividad[], hoy: string): DiaDeActividad[] {
  const grupos = new Map<string, DiaDeActividad>()
  for (const item of items) {
    const fecha = new Date(item.fecha)
    const dia = toIsoDate(fecha)
    let grupo = grupos.get(dia)
    if (!grupo) {
      const rotulo = dia === hoy ? 'Hoy'
        : dia === shiftIsoDate(hoy, -1) ? 'Ayer'
          : `${DIAS_ES[fecha.getDay()]} ${fmtDueLabel(dia, hoy)}`
      grupo = { dia, rotulo, items: [] }
      grupos.set(dia, grupo)
    }
    grupo.items.push(item)
  }
  return [...grupos.values()]
}
