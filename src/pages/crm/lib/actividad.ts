import { fmtDayMonth, toIsoDate } from '@/lib/calendarDate'
import type { EtapaConPrioridad, LeadDetalle, Usuario } from '../types'
import { nombreDe } from './permisos'

/* La actividad del lead en una sola lista: lo que se escribió (comentarios MANUAL), lo que dejó
   el sistema (comentarios SYSTEM) y lo que registran la base y los triggers (gestiones, cambios
   de etapa y de responsable). Una lista y no cuatro: la pregunta al abrir un lead es «qué pasó
   con esto», y la respuesta es en orden. */
export type ItemActividad = {
  id: string
  tipo: 'comentario' | 'sistema' | 'gestion' | 'pospuesto' | 'etapa' | 'asignacion'
  /** Cuándo pasó (no cuándo vence): lo que ordena la lista. */
  fecha: string
  texto: string
  autorId: string | null
}

export function lineaDeTiempo(
  detalle: LeadDetalle, etapas: ReadonlyMap<string, EtapaConPrioridad>, usuarios: Usuario[],
): ItemActividad[] {
  const etapa = (id: string | null) => (id ? etapas.get(id)?.label ?? '(etapa borrada)' : '')
  const items: ItemActividad[] = [
    ...detalle.comments.map(c => ({
      id: c.id, tipo: c.comment_type === 'SYSTEM' ? 'sistema' as const : 'comentario' as const,
      fecha: c.created_at, texto: c.description, autorId: c.created_by,
    })),
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
  ]
  return items.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
}
