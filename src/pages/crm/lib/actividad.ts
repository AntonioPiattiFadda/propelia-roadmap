import { fmtDayMonth, fmtDueLabel, shiftIsoDate, toIsoDate } from '@/lib/calendarDate'
import type { EtapaConPrioridad, LeadDetalle, Usuario } from '../types'
import { nombreDe } from './permisos'

/* La actividad del lead en una sola lista: lo que se escribió (comentarios MANUAL), lo que dejó
   el sistema (comentarios SYSTEM) y lo que registran la base y los triggers (gestiones, cambios
   de etapa y de responsable). Una lista y no cuatro: la pregunta al abrir un lead es «qué pasó
   con esto», y la respuesta es en orden. */
export type ItemActividad = {
  id: string
  tipo: 'comentario' | 'llamada' | 'sistema' | 'gestion' | 'pospuesto' | 'etapa' | 'asignacion' | 'reunion' | 'tarea'
  /** Cuándo pasó (no cuándo vence): lo que ordena la lista. */
  fecha: string
  texto: string
  autorId: string | null
  /** Con quién de la inmobiliaria (solo notas y llamadas; vacío = no se dijo). */
  con?: string[]
}

/* Qué fue una actividad escrita a mano —nota o llamada— y con quién, colgado del comentario en
   `long_description`: la columna existe y ninguna pantalla la usaba, y `comment_type` solo admite
   MANUAL y SYSTEM, así que una llamada no tenía dónde decir que era una llamada sin migración.
   Misma jugada que el tablero con `modulo`, `hoy` y `tipo`. Por eso se lee ESTRICTO: por la marca
   del principio y la forma del JSON, nunca «lo que haya»; si algún día otro escribe ahí texto
   largo de verdad, no tiene que leerse como una llamada. Se guardan los nombres y no el casillero:
   el teléfono alternativo de hoy puede ser otra persona mañana, y la llamada fue con quien fue. */
const MARCA_ACTIVIDAD = '<!--act-->'
export type MetaDeActividad = { tipo: 'nota' | 'llamada'; con: string[] }

/** Lo que va a `long_description`. Una nota sin nadie no guarda nada: es un comentario de siempre. */
export function armarMetaDeActividad(meta: MetaDeActividad): string | null {
  if (meta.tipo === 'nota' && meta.con.length === 0) return null
  return MARCA_ACTIVIDAD + JSON.stringify(meta)
}

export function leerMetaDeActividad(guardado: string | null): MetaDeActividad | null {
  if (!guardado?.startsWith(MARCA_ACTIVIDAD)) return null
  try {
    const m: unknown = JSON.parse(guardado.slice(MARCA_ACTIVIDAD.length))
    if (typeof m !== 'object' || m === null) return null
    const { tipo, con } = m as Record<string, unknown>
    if (tipo !== 'nota' && tipo !== 'llamada') return null
    if (!Array.isArray(con) || !con.every(c => typeof c === 'string')) return null
    return { tipo, con }
  } catch { return null }
}

export function lineaDeTiempo(
  detalle: LeadDetalle, etapas: ReadonlyMap<string, EtapaConPrioridad>, usuarios: Usuario[],
): ItemActividad[] {
  const etapa = (id: string | null) => (id ? etapas.get(id)?.label ?? '(etapa borrada)' : '')
  const items: ItemActividad[] = [
    ...detalle.comments.map(c => {
      if (c.comment_type === 'SYSTEM') return { id: c.id, tipo: 'sistema' as const, fecha: c.created_at, texto: c.description, autorId: c.created_by }
      const meta = leerMetaDeActividad(c.long_description)
      return {
        id: c.id, tipo: meta?.tipo === 'llamada' ? 'llamada' as const : 'comentario' as const,
        fecha: c.created_at, texto: c.description, autorId: c.created_by, con: meta?.con ?? [],
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
    ...detalle.stageHistory.map(h => ({
      id: h.id, tipo: 'etapa' as const, fecha: h.changed_at,
      texto: h.from_stage_id ? `Etapa: ${etapa(h.from_stage_id)} → ${etapa(h.to_stage_id)}` : `Entró en ${etapa(h.to_stage_id)}`,
      autorId: h.changed_by,
    })),
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
    // La tarea igual: entra cuando se anotó; para cuándo vence va en el texto.
    ...detalle.tasks.filter(t => t.deleted_at == null).map(t => ({
      id: t.id, tipo: 'tarea' as const, fecha: t.created_at,
      texto: `Se agendó la tarea «${t.title}»` + (t.due_date ? ` para el ${fmtDayMonth(t.due_date)}` : ', sin fecha'),
      autorId: t.created_by,
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
