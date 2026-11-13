import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import {
  carterasConEscritura, carterasVisibles, esSuperadmin, puedeEditarLead, puedeEscribir, type Acceso,
} from '../lib/permisos'
import { getAccesos, getUsuarios } from '../service/crm.service'
import type { Usuario } from '../types'
import { CRM_KEYS } from './keys'

// Vacíos estables: un `?? []` nuevo en cada render rompería los useMemo de abajo.
const SIN_USUARIOS: Usuario[] = []
const SIN_ACCESOS: Acceso[] = []

/* Quién puede mirar y escribir qué cartera. Es el `@/hooks/useVisibleAgents` del producto (la
   mitad compartida): lo usan el CRM y Equipo. La selección en la URL es de cada página y vive en
   `useVisibleAgents`. */
export function useCarteras() {
  const { userSession } = useUserSession()
  const myId = userSession?.user.id ?? null
  const { data: yo } = useYo(myId ?? undefined)
  const usuariosQ = useQuery({ queryKey: CRM_KEYS.usuarios, queryFn: getUsuarios, staleTime: 5 * 60_000 })
  const accesosQ = useQuery({ queryKey: CRM_KEYS.accesos, queryFn: getAccesos })
  const usuarios = usuariosQ.data ?? SIN_USUARIOS
  const accesos = accesosQ.data ?? SIN_ACCESOS

  const visibles = useMemo(() => carterasVisibles(yo, usuarios, accesos), [yo, usuarios, accesos])
  const conEscritura = useMemo(() => carterasConEscritura(yo, usuarios, accesos), [yo, usuarios, accesos])
  const puedeEscribirEn = useCallback((owner: string) => puedeEscribir(yo, owner, accesos), [yo, accesos])
  /** Escribir en la cartera y que el lead no esté en onboarding (`puedeEditarLead`). */
  const puedeEditar = useCallback((lead: { assigned_to: string; lead_type?: string | null }) =>
    puedeEditarLead(yo, lead, accesos), [yo, accesos])

  return {
    myId,
    yo: yo ?? null,
    usuarios,
    accesos,
    visibles,
    conEscritura,
    esSuperadmin: esSuperadmin(yo),
    puedeEscribir: puedeEscribirEn,
    puedeEditarLead: puedeEditar,
    isLoading: usuariosQ.isLoading || accesosQ.isLoading || !yo,
  }
}
