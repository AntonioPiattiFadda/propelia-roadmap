import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import {
  asignarOnboarding, completarOnboarding, getOnboardings, getPlantillas, importarEquipo, marcarTarea, reabrirAlta,
} from '../service/clientes.service'
import { activarTutorialDeLeads, getLinksDePago, getOrganizacion, getPlanes } from '../service/puente'
import type { Onboarding } from '../types'

export const CLIENTES_KEYS = {
  onboardings: ['clientes', 'onboardings'] as const,
  plantillas: ['clientes', 'plantillas'] as const,
  org: (orgId: string) => ['clientes', 'puente', 'org', orgId] as const,
  planes: (orgId: string) => ['clientes', 'puente', 'planes', orgId] as const,
  links: (orgId: string) => ['clientes', 'puente', 'links', orgId] as const,
}

export const useOnboardings = (enabled: boolean) =>
  useQuery({ queryKey: CLIENTES_KEYS.onboardings, queryFn: getOnboardings, enabled })

export const usePlantillas = (enabled: boolean) =>
  useQuery({ queryKey: CLIENTES_KEYS.plantillas, queryFn: getPlantillas, enabled, staleTime: 5 * 60_000 })

export const useOrganizacion = (orgId: string | null | undefined) =>
  useQuery({ queryKey: CLIENTES_KEYS.org(orgId ?? ''), queryFn: () => getOrganizacion(orgId!), enabled: !!orgId, retry: false })

export const usePlanes = (orgId: string | null | undefined) =>
  useQuery({ queryKey: CLIENTES_KEYS.planes(orgId ?? ''), queryFn: () => getPlanes(orgId!), enabled: !!orgId, staleTime: 5 * 60_000 })

export const useLinksDePago = (orgId: string | null | undefined) =>
  useQuery({ queryKey: CLIENTES_KEYS.links(orgId ?? ''), queryFn: () => getLinksDePago(orgId!), enabled: !!orgId })

/* Otro SUPERADMIN tilda o importa, o un comercial mueve un lead a «Contratado»: se re-trae la
   lista. Topic único por montaje, por lo mismo que `useCrmRealtime`. */
export function useClientesRealtime(activo: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!activo) return
    const canal = supabase.channel(`clientes-${crypto.randomUUID()}`)
    // crm_tasks: la columna «Tareas» (la tarea que crea el envío del alta aparece sola).
    for (const tabla of ['client_onboardings', 'client_onboarding_members', 'client_onboarding_tasks', 'crm_tasks']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla },
        () => { void qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }) })
    }
    canal.subscribe()
    return () => { void supabase.removeChannel(canal) }
  }, [activo, qc])
}

const mensajeDeError = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo guardar')

/** Tildar y destildar: optimista, y vuelve atrás si la base no lo guarda. */
export function useMarcarTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: marcarTarea,
    onMutate: async ({ onboardingId, taskId, hecha }) => {
      await qc.cancelQueries({ queryKey: CLIENTES_KEYS.onboardings })
      const antes = qc.getQueryData<Onboarding[]>(CLIENTES_KEYS.onboardings)
      qc.setQueryData<Onboarding[]>(CLIENTES_KEYS.onboardings, lista => lista?.map(o => o.id !== onboardingId ? o : {
        ...o,
        tareas: hecha
          ? [...o.tareas.filter(t => t.task_id !== taskId), { task_id: taskId, done_at: new Date().toISOString(), done_by: null }]
          : o.tareas.filter(t => t.task_id !== taskId),
      }))
      return { antes }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CLIENTES_KEYS.onboardings, ctx.antes)
      toast.error('No se guardó la tarea', { description: mensajeDeError(e) })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }),
  })
}

/** Prende el «Tutorial de leads» en Propelia y, recién con eso hecho, tilda la tarea. Si Propelia
 *  falla, la tarea queda sin tildar: tildada diría que el cliente ya lo tiene. */
export function useActivarTutorialDeLeads() {
  const qc = useQueryClient()
  const marcar = useMarcarTarea()
  return useMutation({
    mutationFn: async ({ orgId, onboardingId, taskId }: { orgId: string; onboardingId: string; taskId: string }) => {
      const r = await activarTutorialDeLeads(orgId)
      await marcar.mutateAsync({ onboardingId, taskId, hecha: true })
      return r
    },
    onSuccess: r => {
      const personas = r.users.filter(u => u.activated).length
      toast.success(`Tutorial de leads activado para ${personas} ${personas === 1 ? 'persona' : 'personas'}`, {
        description: 'Lo ven en Propelia al lado de «Primeros pasos». Los avisos a leads, sólo los admin.',
      })
    },
    onError: e => toast.error('No se pudo activar el tutorial', { description: mensajeDeError(e) }),
    onSettled: (_r, _e, v) => qc.invalidateQueries({ queryKey: CLIENTES_KEYS.org(v.orgId) }),
  })
}

export function useAsignarOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: asignarOnboarding,
    onError: e => toast.error('No se pudo asignar', { description: mensajeDeError(e) }),
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }),
  })
}

export function useImportarEquipo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importarEquipo,
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }),
  })
}

export function useReabrirAlta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: reabrirAlta,
    onError: e => toast.error('No se pudo reabrir el enlace', { description: mensajeDeError(e) }),
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }),
  })
}

export function useCompletarOnboarding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: completarOnboarding,
    onError: e => toast.error('No se pudo completar', { description: mensajeDeError(e) }),
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings }),
  })
}
