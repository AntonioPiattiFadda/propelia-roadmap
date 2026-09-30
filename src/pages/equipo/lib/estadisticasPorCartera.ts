import { etapaDelLead } from '@/pages/crm/lib/effectiveStage'
import { claveDeGestion } from '@/pages/crm/lib/gestionStatus'
import { esDescartado, estadoDeGestion } from '@/pages/crm/lib/leadFilters'
import { idsConTareasVencidas } from '@/pages/crm/lib/tareas'
import type { CrmLeadRow, CrmMeeting, CrmTask, EtapaConPrioridad, Usuario } from '@/pages/crm/types'

export type TramoEtapa = { etapaId: string | null; label: string; color: string; cantidad: number }
export type FilaEquipo = {
  usuario: Usuario
  leadsActivos: number
  porEtapa: TramoEtapa[]
  gestionesVencidas: number
  leadsConTareasVencidas: number
  reunionesMes: number
}

/**
 * Los números de Equipo › Tabla, en el cliente y con las mismas funciones puras del CRM
 * (`esDescartado`, `estadoDeGestion` + `claveDeGestion`, `idsConTareasVencidas`): el número de una celda y
 * lo que el CRM muestra al tocarla salen de la misma regla, no de una re-derivación. La RLS ya
 * recortó los datos de entrada: no puede aparecer un número de una cartera ajena.
 *
 * «Activo» = no borrado y no descartado. Las gestiones vencidas se cuentan sobre los activos: un
 * descartado no es trabajo pendiente (el CRM tampoco lo muestra por defecto).
 *
 * Las tareas vencidas se cuentan en LEADS y no en tareas, y por el dueño del lead y no el de la
 * tarea: es lo que muestra el CRM al tocar el número (el chip «Tareas vencidas» sobre esa cartera).
 * Contando tareas por `assigned_to`, entraban las sin lead, las de descartados, varias del mismo
 * lead, y la tarea de un lead reasignado le seguía sumando al dueño viejo (reasignar no mueve las
 * tareas): el número decía 3 y el enlace mostraba 0.
 */
export function estadisticasPorCartera(input: {
  carteras: Usuario[]
  leads: CrmLeadRow[]
  tareasPendientes: CrmTask[]
  reunionesDelMes: CrmMeeting[]
  etapas: ReadonlyMap<string, EtapaConPrioridad>
  hoy: string
  now: number
}): FilaEquipo[] {
  const { carteras, leads, tareasPendientes, reunionesDelMes, etapas, hoy, now } = input
  const ctx = { overdueLeadIds: new Set<string>(), etapas, now }
  const conVencidas = idsConTareasVencidas(tareasPendientes, hoy)
  return carteras.map(usuario => {
    const activos = leads.filter(l => l.assigned_to === usuario.id && l.deleted_at == null && !esDescartado(l, etapas))

    const porId = new Map<string | null, TramoEtapa & { position: number }>()
    for (const l of activos) {
      const e = etapaDelLead(l, etapas)
      const clave = e?.id ?? null
      const tramo = porId.get(clave) ?? {
        etapaId: clave,
        label: e?.label ?? 'Sin etapa',
        color: e ? e.priority?.color ?? 'var(--fg-faint)' : 'var(--line-strong)',
        cantidad: 0,
        // Sin etapa va al final de la barra.
        position: e?.position ?? Number.MAX_SAFE_INTEGER,
      }
      tramo.cantidad++
      porId.set(clave, tramo)
    }

    return {
      usuario,
      leadsActivos: activos.length,
      porEtapa: [...porId.values()].sort((a, b) => a.position - b.position)
        .map(({ etapaId, label, color, cantidad }) => ({ etapaId, label, color, cantidad })),
      gestionesVencidas: activos.filter(l => claveDeGestion(estadoDeGestion(l, ctx)) === 'pendiente').length,
      leadsConTareasVencidas: activos.filter(l => conVencidas.has(l.id)).length,
      reunionesMes: reunionesDelMes.filter(r => r.assigned_to === usuario.id && r.deleted_at == null && r.status !== 'cancelled').length,
    }
  })
}
