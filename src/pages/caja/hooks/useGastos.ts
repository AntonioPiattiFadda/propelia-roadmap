import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getGastos } from '../service/caja.service'
import type { Rango } from '../types'
import { CAJA_KEYS } from './keys'

/** Gastos vivos de los meses que toca el rango (más uno de cada lado). Al cambiar fechas se queda
    con lo anterior hasta que llega lo nuevo, para que la lista no parpadee vacía. */
export function useGastos(rango: Rango) {
  return useQuery({
    queryKey: CAJA_KEYS.gastos(rango.from, rango.to),
    queryFn: () => getGastos(rango),
    placeholderData: keepPreviousData,
  })
}
