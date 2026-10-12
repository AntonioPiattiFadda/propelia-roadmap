import { useQuery } from '@tanstack/react-query'
import { getEtiquetas, getPagadores, getUsoDeEtiquetas } from '../service/caja.service'
import { CAJA_KEYS } from './keys'

/** Todas, también las borradas (ver `getEtiquetas`). */
export function useEtiquetas() {
  return useQuery({ queryKey: CAJA_KEYS.etiquetas, queryFn: getEtiquetas })
}

/** `{ [etiquetaId]: cantidad de gastos vivos }`. */
export function useUsoDeEtiquetas() {
  return useQuery({ queryKey: CAJA_KEYS.uso, queryFn: getUsoDeEtiquetas })
}

/** La gente de `users` para «Pagó»: cambia poco, no hace falta re-traerla en cada invalidación. */
export function usePagadores() {
  return useQuery({ queryKey: CAJA_KEYS.pagadores, queryFn: getPagadores, staleTime: 5 * 60_000 })
}
