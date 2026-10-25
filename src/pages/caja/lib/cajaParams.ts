import type { FiltroTipo } from '../types'

/* Los filtros de la Caja que viven en la URL, al estilo de crm/lib/leadFilterParams.ts: se copia
   `params` y nunca se muta el que llega, y un valor de fábrica BORRA su clave, así la URL limpia y
   la del estado por defecto son la misma. */

export const WITH_PENDING_PARAM = 'withPending'
export const TIPO_PARAM = 'tipo'

/** Prendido de fábrica: en la URL solo se escribe apagado, así un enlace sin el parámetro muestra todo. */
export const leerConPendientes = (params: URLSearchParams): boolean => params.get(WITH_PENDING_PARAM) !== '0'

export function escribirConPendientes(params: URLSearchParams, conPendientes: boolean): URLSearchParams {
  const next = new URLSearchParams(params)
  if (conPendientes) next.delete(WITH_PENDING_PARAM)
  else next.set(WITH_PENDING_PARAM, '0')
  return next
}

export const VISTA_PARAM = 'vista'
export type VistaCaja = 'lista' | 'meses'

/** La lista de siempre es la de fábrica: en la URL solo se escribe «meses». */
export const leerVista = (params: URLSearchParams): VistaCaja => (params.get(VISTA_PARAM) === 'meses' ? 'meses' : 'lista')

export function escribirVista(params: URLSearchParams, vista: VistaCaja): URLSearchParams {
  const next = new URLSearchParams(params)
  if (vista === 'lista') next.delete(VISTA_PARAM)
  else next.set(VISTA_PARAM, vista)
  return next
}

export function leerTipo(params: URLSearchParams): FiltroTipo {
  const v = params.get(TIPO_PARAM)
  return v === 'FIXED' || v === 'VARIABLE' ? v : 'all'
}

export function escribirTipo(params: URLSearchParams, tipo: FiltroTipo): URLSearchParams {
  const next = new URLSearchParams(params)
  if (tipo === 'all') next.delete(TIPO_PARAM)
  else next.set(TIPO_PARAM, tipo)
  return next
}
