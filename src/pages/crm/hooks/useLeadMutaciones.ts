import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensajeDeError } from '../lib/errores'
import { aplicarGestionOptimista, type ManagementAction } from '../lib/gestionStatus'
import { comentarioDescarte, comentarioReasignacion } from '../lib/systemComment'
import type { FilaDelLote } from '../lib/importarLote'
import {
  crearComentario, crearEventoGestion, crearLeadConCliente, importarLote, reasignarLead, updateCliente, updateLead,
  type AltaLead, type ClientePatch, type LeadPatch,
} from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle, Usuario } from '../types'
import { CRM_KEYS } from './keys'

/* El «optimista + revertir + aviso» del tablero, dicho en TanStack Query: onMutate aplica en la
   cache, onError vuelve atrás y avisa con el motivo traducido, onSettled re-trae. */

async function optimistaSobreLeads(qc: QueryClient, cambio: (l: CrmLeadRow) => CrmLeadRow, ids: Set<string>) {
  await qc.cancelQueries({ queryKey: CRM_KEYS.leads })
  const previo = qc.getQueryData<CrmLeadRow[]>(CRM_KEYS.leads)
  qc.setQueryData<CrmLeadRow[]>(CRM_KEYS.leads, old => old?.map(l => (ids.has(l.id) ? cambio(l) : l)))
  return { previo }
}

function revertir(qc: QueryClient, previo: CrmLeadRow[] | undefined) {
  if (previo) qc.setQueryData(CRM_KEYS.leads, previo)
}

const refrescar = (qc: QueryClient, leadId?: string) => {
  void qc.invalidateQueries({ queryKey: CRM_KEYS.leads })
  void qc.invalidateQueries({ queryKey: leadId ? CRM_KEYS.detalle(leadId) : CRM_KEYS.detalles })
}

export function useActualizarLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LeadPatch }) => updateLead(id, patch),
    onMutate: ({ id, patch }) => optimistaSobreLeads(qc, l => ({ ...l, ...patch }), new Set([id])),
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error)) },
    onSettled: (_d, _e, { id }) => refrescar(qc, id),
  })
}

export function useActualizarCliente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, patch }: { clientId: string; patch: ClientePatch }) => updateCliente(clientId, patch),
    onMutate: async ({ clientId, patch }) => {
      await qc.cancelQueries({ queryKey: CRM_KEYS.leads })
      const previo = qc.getQueryData<CrmLeadRow[]>(CRM_KEYS.leads)
      // Un cliente puede colgar de varios leads (uno por cartera): se cambia en todos.
      qc.setQueryData<CrmLeadRow[]>(CRM_KEYS.leads, old => old?.map(l =>
        l.client?.id === clientId ? { ...l, client: { ...l.client, ...patch } } : l))
      return { previo }
    },
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error)) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CRM_KEYS.leads }) },
  })
}

export function useMarcarGestion(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { action: ManagementAction; effective_at?: string; note?: string | null }) =>
      crearEventoGestion({ lead_id: leadId, ...p }),
    onMutate: p => optimistaSobreLeads(
      qc,
      l => aplicarGestionOptimista(l, { action: p.action, effective_at: p.effective_at ?? new Date().toISOString() }),
      new Set([leadId]),
    ),
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error, 'No se pudo registrar la gestión')) },
    onSuccess: (_d, p) => toast.success(p.action === 'POSTPONED' ? 'Gestión pospuesta' : 'Gestión registrada'),
    onSettled: () => refrescar(qc, leadId),
  })
}

export function useDescartar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ leadId, etapaId, motivo }: { leadId: string; etapaId: string; motivo: string | null }) => {
      await updateLead(leadId, { funnel_stage_id: etapaId, discard_reason: motivo })
      await crearComentario({ lead_id: leadId, description: comentarioDescarte(motivo), comment_type: 'SYSTEM' })
    },
    onMutate: ({ leadId, etapaId, motivo }) =>
      optimistaSobreLeads(qc, l => ({ ...l, funnel_stage_id: etapaId, discard_reason: motivo }), new Set([leadId])),
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error, 'No se pudo descartar el lead')) },
    onSuccess: () => toast.success('Lead descartado'),
    onSettled: (_d, _e, { leadId }) => refrescar(qc, leadId),
  })
}

export type ItemReasignacion = { leadId: string; deNombre: string }

/** Reasigna de a uno (ver `reasignarLead`) y junta lo que falló en vez de cortar en el primero. */
export function useReasignar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, nuevo }: { items: ItemReasignacion[]; nuevo: Usuario }) => {
      const fallidos: { leadId: string; error: unknown }[] = []
      for (const item of items) {
        try {
          await reasignarLead(item.leadId, nuevo.id, comentarioReasignacion(item.deNombre, nuevo.nombre))
        } catch (error) {
          fallidos.push({ leadId: item.leadId, error })
        }
      }
      return { movidos: items.length - fallidos.length, fallidos }
    },
    onMutate: ({ items, nuevo }) =>
      optimistaSobreLeads(qc, l => ({ ...l, assigned_to: nuevo.id }), new Set(items.map(i => i.leadId))),
    onSuccess: ({ movidos, fallidos }, { nuevo }, ctx) => {
      if (movidos > 0) toast.success(movidos === 1 ? `Lead reasignado a ${nuevo.nombre}` : `${movidos} leads reasignados a ${nuevo.nombre}`)
      if (fallidos.length > 0) {
        // Los que fallaron vuelven a su lugar con el refresco; el revert entero taparía los que sí se movieron.
        toast.error(`${fallidos.length} no se ${fallidos.length === 1 ? 'pudo' : 'pudieron'} reasignar: ${mensajeDeError(fallidos[0].error)}`)
        if (movidos === 0) revertir(qc, ctx?.previo)
      }
    },
    onError: (error, _v, ctx) => { revertir(qc, ctx?.previo); toast.error(mensajeDeError(error)) },
    onSettled: () => {
      refrescar(qc)
      void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
    },
  })
}

/** Sin toast de error: el dialog de alta lo muestra adentro, al lado del campo. */
export function useCrearLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AltaLead) => crearLeadConCliente(input),
    onSuccess: r => toast.success(r.client_reused ? 'Lead creado. El cliente ya existía y se reutilizó.' : 'Lead creado'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CRM_KEYS.leads })
      void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
    },
  })
}

/* El import de un lote. Sin optimismo: son cientos de filas que decide la base. El simulacro no
   escribe nada, así que solo el de verdad re-trae (los leads y el catálogo, por las etiquetas). */
export function useImportarLote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { assignedTo: string; filas: FilaDelLote[]; simular: boolean }) =>
      importarLote(v.assignedTo, v.filas, v.simular),
    onSettled: (_r, _e, v) => {
      if (v.simular) return
      void qc.invalidateQueries({ queryKey: CRM_KEYS.leads })
      void qc.invalidateQueries({ queryKey: CRM_KEYS.catalogos })
    },
  })
}

/**
 * Mutaciones de lo que cuelga del lead (tareas, reuniones, comentarios). `optimista` aplica el
 * cambio sobre el detalle en cache antes de que conteste la base.
 */
export function useMutacionDelDetalle<TVars, TData>(
  leadId: string,
  fn: (vars: TVars) => Promise<TData>,
  opciones: { exito?: string; optimista?: (d: LeadDetalle, vars: TVars) => LeadDetalle } = {},
) {
  const qc = useQueryClient()
  const key = CRM_KEYS.detalle(leadId)
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars: TVars) => {
      if (!opciones.optimista) return { previo: undefined }
      await qc.cancelQueries({ queryKey: key })
      const previo = qc.getQueryData<LeadDetalle>(key)
      if (previo) qc.setQueryData<LeadDetalle>(key, opciones.optimista(previo, vars))
      return { previo }
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previo) qc.setQueryData(key, ctx.previo)
      toast.error(mensajeDeError(error))
    },
    onSuccess: () => { if (opciones.exito) toast.success(opciones.exito) },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
      void qc.invalidateQueries({ queryKey: ['crm', 'reuniones'] })
    },
  })
}
