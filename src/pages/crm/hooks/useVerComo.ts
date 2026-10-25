import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { COMO_PARAM } from '../lib/leadFilterParams'
import { comoValido, nivelSobre, type NivelAcceso } from '../lib/permisos'
import type { Usuario } from '../types'
import { useCarteras } from './useCarteras'

/**
 * «Ver como» (23/10/2026): el `?como=` del CRM. NO es entrar como otro —la sesión sigue siendo la
 * mía, lo que escribo lo firmo yo y la RLS recorta con mis permisos—: solo cambia qué cuenta como
 * «lo mío» en pantalla (la cartera de entrada, el responsable del alta, los objetivos, la campana).
 * `perspectivaId` es ese «yo» de pantalla; para permisos se sigue usando `myId` / `puedeEscribir`.
 * Solo lo usan los componentes de `/crm`: lo montado en `AppLayout` (alarmas, avisos) es siempre
 * de quien está sentado.
 */
export function useVerComo(): {
  como: Usuario | null
  /** Qué puedo hacer yo sobre su cartera: lo que dice el cartel. */
  nivel: NivelAcceso | null
  perspectivaId: string | null
  /** Hay un `?como=` y los permisos todavía no llegaron: no se sabe si vale. */
  cargando: boolean
} {
  const { myId, yo, usuarios, accesos, isLoading } = useCarteras()
  const [searchParams] = useSearchParams()
  const comoId = searchParams.get(COMO_PARAM)
  const como = useMemo(() => comoValido(yo, comoId, usuarios, accesos), [yo, comoId, usuarios, accesos])
  return {
    como,
    nivel: como ? nivelSobre(yo, como.id, accesos) : null,
    perspectivaId: como?.id ?? myId,
    cargando: !!comoId && isLoading,
  }
}
